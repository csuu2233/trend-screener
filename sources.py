"""Market adapters. All returned bars have local market timestamps and completed candles only."""
from __future__ import annotations

import os
import time
from pathlib import Path
from datetime import datetime, timedelta, timezone
import pandas as pd
import requests

FIELDS = ["datetime", "open", "high", "low", "close", "amount", "turnover"]
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "trend-screener/1.0"})


def _frame(rows) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(columns=FIELDS)
    df["datetime"] = pd.to_datetime(df["datetime"]).dt.tz_localize(None)
    for col in FIELDS[1:]:
        if col not in df:
            df[col] = float("nan")
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df[FIELDS].dropna(subset=["datetime", "open", "high", "low", "close"]).sort_values("datetime").drop_duplicates("datetime").reset_index(drop=True)


class AShare:
    key = "ashare"
    label = "A股"
    source = "baostock 前复权；本地中证1000＋中证2000名单"

    def __init__(self, root: Path):
        import baostock as bs
        self.bs = bs
        self.root = root
        self.cache = root / "cache" / "ashare"
        self.cache.mkdir(parents=True, exist_ok=True)
        result = bs.login()
        if result.error_code != "0":
            raise RuntimeError(result.error_msg)

    def close(self):
        self.bs.logout()

    def universe(self):
        path = self.root / "data" / "constituents.csv.gz"
        cons = pd.read_csv(path, dtype={"code": str}).drop_duplicates("code")
        return [{"symbol": r["code"], "name": r["name"], "rank": None, "group": r["index"],
                 "exchange": r["exchange"]} for _, r in cons.iterrows()]

    def _prefix(self, item):
        return ("sh" if "上海" in str(item["exchange"]) or item["symbol"].startswith("6") else "sz") + "." + item["symbol"]

    def _fetch(self, item, freq, start, end):
        cols = "date,open,high,low,close,volume,amount,turn" if freq == "d" else "date,time,open,high,low,close,volume,amount"
        rs = self.bs.query_history_k_data_plus(self._prefix(item), cols, start_date=start, end_date=end, frequency=freq, adjustflag="2")
        if rs.error_code != "0":
            raise RuntimeError(rs.error_msg)
        rows = []
        while rs.next():
            x = rs.get_row_data()
            if freq == "d":
                rows.append(dict(datetime=x[0], open=x[1], high=x[2], low=x[3], close=x[4], amount=x[6], turnover=x[7]))
            else:
                rows.append(dict(datetime=x[1][:14], open=x[2], high=x[3], low=x[4], close=x[5], amount=x[7]))
        if freq == "60" and rows:
            for x in rows:
                x["datetime"] = pd.to_datetime(x["datetime"], format="%Y%m%d%H%M%S")
        return _frame(rows)

    def daily(self, item):
        path = self.cache / f'{item["symbol"]}_daily.csv'
        today = datetime.now().date().isoformat()
        if path.exists():
            old = pd.read_csv(path, parse_dates=["datetime"])
            start = (pd.Timestamp(old.datetime.iloc[-1]) - pd.Timedelta(days=2)).date().isoformat()
        else:
            old = _frame([])
            start = (datetime.now() - timedelta(days=5 * 365 + 15)).date().isoformat()
        fresh = self._fetch(item, "d", start, today)
        if fresh.empty and old.empty:
            raise RuntimeError("日线行情为空")
        merged = _frame(pd.concat([old, fresh]).to_dict("records"))
        merged.to_csv(path, index=False)
        return merged

    def hour(self, item):
        path = self.cache / f'{item["symbol"]}_hour.csv'
        today = datetime.now().date().isoformat()
        if path.exists():
            old = pd.read_csv(path, parse_dates=["datetime"])
            start = (pd.Timestamp(old.datetime.iloc[-1]) - pd.Timedelta(days=2)).date().isoformat()
        else:
            old = _frame([])
            start = (datetime.now() - timedelta(days=65)).date().isoformat()
        fresh = self._fetch(item, "60", start, today)
        merged = _frame(pd.concat([old, fresh]).to_dict("records"))
        if merged.empty:
            raise RuntimeError("60分钟行情为空")
        merged.to_csv(path, index=False)
        return merged


class US:
    key = "us"
    label = "美股"
    source = "Yahoo Finance，预设美股大盘核心股名单"

    def __init__(self, root: Path):
        import yfinance as yf
        self.yf = yf
        import json
        self.items = json.loads((root / "data" / "us_core.json").read_text())

    def close(self):
        pass

    def universe(self):
        return [{"symbol": x["symbol"], "name": x["name"], "rank": None, "group": x["sector"]} for x in self.items]

    def _history(self, symbol, period, interval):
        from zoneinfo import ZoneInfo
        df = self.yf.Ticker(symbol).history(period=period, interval=interval, auto_adjust=True, prepost=False)
        if df.empty:
            raise RuntimeError("Yahoo Finance 行情为空")
        idx = df.index.tz_convert("America/New_York") if df.index.tz is not None else df.index
        rows = pd.DataFrame({
            "datetime": idx.tz_localize(None) if idx.tz is not None else idx,
            "open": df["Open"].to_numpy(), "high": df["High"].to_numpy(),
            "low": df["Low"].to_numpy(), "close": df["Close"].to_numpy(),
            "amount": (df["Close"] * df["Volume"]).to_numpy(),
        })
        result = _frame(rows)
        now = datetime.now(ZoneInfo("America/New_York"))
        if interval == "1d" and now.hour < 16:
            result = result[result.datetime.dt.date < now.date()]
        if interval == "60m":
            cutoff = pd.Timestamp(now.replace(tzinfo=None)) - pd.Timedelta(hours=1)
            result = result[result.datetime <= cutoff]
        return result.reset_index(drop=True)

    def daily(self, item):
        return self._history(item["symbol"], "5y", "1d")

    def hour(self, item):
        return self._history(item["symbol"], "60d", "60m")


class Crypto:
    key = "crypto"
    label = "加密"
    source = "CoinGecko 市值排名；Binance USDT 现货K线（UTC）"
    STABLE = {"usdt", "usdc", "dai", "usds", "usde", "fdusd", "pyusd", "tusd", "usd1", "rlusd"}

    def __init__(self, root: Path):
        self.base = "https://data-api.binance.vision/api/v3"

    def close(self):
        pass

    def universe(self):
        r = SESSION.get("https://api.coingecko.com/api/v3/coins/markets",
                        params={"vs_currency": "usd", "order": "market_cap_desc", "per_page": 100, "page": 1},
                        timeout=30)
        r.raise_for_status()
        ranked = r.json()
        e = SESSION.get(self.base + "/exchangeInfo", timeout=30)
        e.raise_for_status()
        tradable = {x["baseAsset"]: x["symbol"] for x in e.json()["symbols"]
                    if x["quoteAsset"] == "USDT" and x["status"] == "TRADING" and x.get("isSpotTradingAllowed", True)}
        items = []
        for coin in ranked:
            base = coin["symbol"].upper()
            if coin["symbol"].lower() in self.STABLE:
                continue
            if base in tradable:
                items.append({"symbol": tradable[base], "name": coin["name"], "rank": coin.get("market_cap_rank"),
                              "group": "市值前100", "coingecko_id": coin["id"]})
        return items

    def _klines(self, symbol, interval, limit_days):
        length = 86_400_000 if interval == "1d" else 3_600_000
        end = int(datetime.now(timezone.utc).timestamp() * 1000)
        start = end - limit_days * 86_400_000
        rows = []
        while start < end:
            r = SESSION.get(self.base + "/klines", params={"symbol": symbol, "interval": interval,
                            "startTime": start, "endTime": end, "limit": 1000}, timeout=30)
            r.raise_for_status()
            batch = r.json()
            if not batch:
                break
            rows.extend(batch)
            start = int(batch[-1][0]) + length
            time.sleep(.08)
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        return _frame([{"datetime": pd.Timestamp(x[0], unit="ms", tz="UTC").tz_localize(None),
                        "open": x[1], "high": x[2], "low": x[3], "close": x[4],
                        "amount": x[7]} for x in rows if int(x[6]) < now])

    def daily(self, item):
        return self._klines(item["symbol"], "1d", 5 * 365 + 15)

    def hour(self, item):
        return self._klines(item["symbol"], "1h", 65)
