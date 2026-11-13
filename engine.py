"""股道选股策略的跨市场、只读扫描内核。输入均为已收盘 OHLCV。"""
from __future__ import annotations

import pandas as pd

POOLS = {
    "hourly": ("小时池", "60m", "15m"),
    "daily": ("日池", "D", "60m"),
    "weekly": ("周池", "W", "D"),
    "monthly": ("月池", "M", "W"),
}


def aggregate(daily: pd.DataFrame, freq: str) -> pd.DataFrame:
    if freq == "D":
        return daily.reset_index(drop=True)
    t = daily.copy()
    if freq == "W":
        iso = t["datetime"].dt.isocalendar()
        t["_key"] = iso.year.astype(str) + "-" + iso.week.astype(str).str.zfill(2)
    else:
        t["_key"] = t["datetime"].dt.to_period(freq).astype(str)
    return t.groupby("_key", sort=True).agg(
        datetime=("datetime", "last"), open=("open", "first"),
        high=("high", "max"), low=("low", "min"), close=("close", "last"),
        amount=("amount", "sum"), turnover=("turnover", "sum"),
    ).reset_index(drop=True)


def complete_periods(bars: pd.DataFrame, freq: str, observed: pd.Timestamp) -> pd.DataFrame:
    if freq == "D" or bars.empty:
        return bars
    d = pd.Timestamp(observed)
    if freq == "W":
        end = d + pd.Timedelta(days=4 - d.weekday())
    elif freq == "M":
        end = d + pd.offsets.BMonthEnd(0)
    else:
        end = d + pd.offsets.BQuarterEnd(0)
    return bars.iloc[:-1].reset_index(drop=True) if d < end - pd.Timedelta(days=2) else bars


def trend(bars: pd.DataFrame) -> dict:
    if len(bars) < 4:
        return {"ok": False, "reason": "不足4根K线"}
    x = bars.iloc[-4:]
    a, b, c, d = (float(v) for v in x.close)
    support = float(bars.low.iloc[-5:].min())
    score = 1 / (1 + abs(c - b) / b) if b else 0
    return {
        "ok": c > a and d > b and d > support,
        "a": a, "b": b, "c": c, "d": d,
        "a_date": str(pd.Timestamp(x.datetime.iloc[0]))[:10],
        "a_time": str(pd.Timestamp(x.datetime.iloc[0])),
        "support": support, "score": score,
        "higher_low": c > a, "higher_high": d > b, "above_support": d > support,
    }


def _big(bars: pd.DataFrame, i: int) -> bool | None:
    if i < 10:
        return None
    body = (bars.close - bars.open).abs()
    avg = body.rolling(10).mean().iloc[i]
    return bool(body.iloc[i] >= avg) if pd.notna(avg) else None


def pattern(bars: pd.DataFrame) -> str | None:
    n = len(bars)
    if n < 4:
        return None
    x = bars.iloc[-3:]
    if (x.close.iloc[0] > x.open.iloc[0] and x.close.iloc[1] < x.open.iloc[1]
            and x.close.iloc[2] > x.open.iloc[2] and x.low.iloc[1] > x.open.iloc[0]):
        return "阳阴阳"
    for name, want in (
        ("大小大", (True, False, True)),
        ("大大小大", (True, True, False, True)),
        ("大小小大", (True, False, False, True)),
        ("小大小大", (False, True, False, True)),
    ):
        got = [_big(bars, i) for i in range(n - len(want), n)]
        if got == list(want):
            return name
    x = bars.iloc[-4:]
    if all(x.close > x.open):
        hits = 0
        for i in range(n - 4, n):
            start = max(0, i - 19)
            hits += bool(bars.close.iloc[i] >= bars.close.iloc[start:i + 1].max())
        if hits >= 2:
            return "四连阳"
    return None


def a_start(a_date: str, main_freq: str, sub_freq: str, market: str) -> pd.Timestamp:
    a = pd.Timestamp(a_date)
    if main_freq == "60m":
        return a
    if main_freq == "D":
        return a + pd.Timedelta(hours=0 if market == "crypto" else 9, minutes=0 if market == "crypto" else 30) if sub_freq == "60m" else a
    if main_freq == "W":
        return a - pd.Timedelta(days=a.weekday())
    if main_freq == "M":
        return a.replace(day=1)
    return a.replace(month=((a.month - 1) // 3) * 3 + 1, day=1)


def a_share_filter(daily: pd.DataFrame) -> tuple[bool, str]:
    c = daily.close.astype(float)
    if daily.amount.tail(20).mean() < 50_000_000:
        return False, "近20日日均成交额不足5000万"
    if c.iloc[-1] < 2:
        return False, "股价低于2元"
    if len(c) >= 6 and c.iloc[-1] / c.iloc[-6] - 1 > .30:
        return False, "近5日涨幅超过30%"
    if len(c) >= 21 and c.iloc[-1] / c.iloc[-21] - 1 > .50:
        return False, "近20日涨幅超过50%"
    if daily.turnover.tail(20).mean() > 15:
        return False, "近20日日均换手超过15%"
    if len(c) >= 11 and int((c.pct_change().iloc[-10:] >= .098).sum()) >= 2:
        return False, "近10日涨停达到2次"
    return True, "通过（财务/ST/市值未核验）"


def scan_one(daily: pd.DataFrame, hour: pd.DataFrame | None,
             minute15: pd.DataFrame | None, market: str) -> dict:
    if len(daily) < 60:
        raise ValueError("日线不足60根")
    passed, filter_note = a_share_filter(daily) if market == "ashare" else (True, "不适用A股隔离")
    out = {}
    observed = pd.Timestamp(daily.datetime.iloc[-1])
    for key, (label, main_freq, sub_freq) in POOLS.items():
        main = hour if main_freq == "60m" else complete_periods(aggregate(daily, main_freq), main_freq, observed)
        if main is None or main.empty:
            continue
        mt = trend(main)
        if not mt["ok"]:
            continue
        if sub_freq == "15m":
            sub = minute15
        elif sub_freq == "60m":
            sub = hour
        else:
            sub = aggregate(daily, sub_freq)
        if sub is None or sub.empty:
            continue
        start_value = mt["a_time"] if main_freq == "60m" else mt["a_date"]
        sub = sub[sub.datetime >= a_start(start_value, main_freq, sub_freq, market)].reset_index(drop=True)
        st = trend(sub)
        if not st["ok"]:
            continue
        shape = pattern(sub)
        if shape and passed:
            from strategies import chart
            upper_freq = {"60m": "D", "D": "W", "W": "M", "M": "Q"}[main_freq]
            upper = complete_periods(aggregate(daily, upper_freq), upper_freq, observed)
            out[key] = {
                "pool": label, "main_period": main_freq, "sub_period": sub_freq,
                "main": mt, "sub": st, "pattern": shape, "filter": filter_note,
                "daily_date": str(observed)[:10],
                "sub_date": str(pd.Timestamp(sub.datetime.iloc[-1])),
                "close": float(daily.close.iloc[-1]),
                "chart": {"upper": chart(upper, 12), "main": chart(main, 12), "sub": chart(sub, 20)},
            }
    return out
