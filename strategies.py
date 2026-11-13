"""Completed-bar, long-only strategy signals shared by all three markets."""
from __future__ import annotations

import math
import pandas as pd

VERSION = "1.0"
DEFINITIONS = {
    "multi_structure_trend": {"name": "股道多周期结构趋势", "category": "trend", "horizon": "小时至月", "summary": "本级趋势、次级趋势与确认形态"},
    "long_ma_filter": {"name": "长周期均线过滤", "category": "trend", "horizon": "中长期", "summary": "日收盘高于 SMA200，完整月收盘高于 SMA10"},
    "dual_ma_cross": {"name": "双均线交叉", "category": "trend", "horizon": "中长期", "summary": "近20个交易日发生 SMA50 上穿 SMA200"},
    "absolute_momentum_12m": {"name": "12个月绝对动量", "category": "trend", "horizon": "中长期", "summary": "完整月线的12个月回报率大于零"},
    "bollinger_rebound": {"name": "布林带超卖反弹", "category": "reversion", "horizon": "短中期", "summary": "前一日跌破下轨，最新日重新站上下轨"},
    "rsi2_mean_reversion": {"name": "RSI-2 短期均值回归", "category": "reversion", "horizon": "短中期", "summary": "SMA200上方出现 RSI(2) 小于5"},
}


def chart(bars, count=35, lines=None):
    tail = bars.tail(count)
    indices = list(tail.index)
    result = []
    for i, (_, row) in zip(indices, tail.iterrows()):
        point = {"date": str(row.datetime), "open": float(row.open), "high": float(row.high),
                 "low": float(row.low), "close": float(row.close)}
        for label, series in (lines or {}).items():
            value = series.loc[i]
            point[label] = round(float(value), 5) if pd.notna(value) else None
        result.append(point)
    return result


def _signal(key, daily, metrics, checks, chart_data, signal_date=None, exit_rule=""):
    return {"strategy_id": key, "strategy_version": VERSION,
            "signal_date": signal_date or str(daily.datetime.iloc[-1])[:10],
            "as_of": str(daily.datetime.iloc[-1])[:10], "close": float(daily.close.iloc[-1]),
            "metrics": metrics, "rule_checks": checks, "chart": chart_data,
            "reference_exit": exit_rule}


def scan_reversion_pool(bars, daily, market, pool):
    """Apply both mean-reversion signals to a completed target timeframe."""
    if bars is None or len(bars) < 21 or len(daily) < 200:
        return {}
    bars = bars.reset_index(drop=True)
    daily = daily.reset_index(drop=True)
    if market == "ashare":
        from engine import a_share_filter
        if not a_share_filter(daily)[0]:
            return {}
    close = bars.close.astype(float)
    baseline = float(daily.close.astype(float).rolling(200).mean().iloc[-1])
    if float(daily.close.iloc[-1]) <= baseline:
        return {}
    out = {}
    middle = close.rolling(20).mean()
    deviation = close.rolling(20).std(ddof=0)
    lower, upper = middle - 2 * deviation, middle + 2 * deviation
    series = {"上轨": upper, "中轨": middle, "下轨": lower}
    if close.iloc[-2] < lower.iloc[-2] and close.iloc[-1] > lower.iloc[-1]:
        out["bollinger_rebound"] = _signal("bollinger_rebound", bars,
            {"lower": float(lower.iloc[-1]), "middle": float(middle.iloc[-1]),
             "upper": float(upper.iloc[-1]), "daily_sma200": baseline},
            ["前根收盘 < 前根下轨", "本根收盘 > 本根下轨", "日收盘 > 日线SMA200"],
            {pool: chart(bars, 45, series)}, exit_rule="收盘回到本级中轨或观察满10根本级K线")
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=.5, adjust=False, min_periods=2).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=.5, adjust=False, min_periods=2).mean()
    rsi = 100 - 100 / (1 + gain / loss.replace(0, float("nan")))
    rsi = rsi.where(loss != 0, 100).where(gain != 0, 0)
    if pd.notna(rsi.iloc[-1]) and rsi.iloc[-1] < 5:
        sma5 = close.rolling(5).mean()
        out["rsi2_mean_reversion"] = _signal("rsi2_mean_reversion", bars,
            {"rsi2": float(rsi.iloc[-1]), "sma5": float(sma5.iloc[-1]), "daily_sma200": baseline},
            ["日收盘 > 日线SMA200", "本级RSI(2) < 5"],
            {pool: chart(bars, 45, {"SMA5": sma5, "RSI2": rsi})},
            exit_rule="本级收盘高于SMA5、RSI(2)高于70或观察满10根本级K线")
    return out


def scan_strategies(daily, market):
    """Return only selected signals. Input daily bars must already be completed."""
    from engine import aggregate, complete_periods
    out = {}
    if daily.empty:
        return out
    daily = daily.reset_index(drop=True)
    close = daily.close.astype(float)
    sma200 = close.rolling(200).mean()
    if market == "ashare":
        from engine import a_share_filter
        if not a_share_filter(daily)[0]:
            return out
    monthly = complete_periods(aggregate(daily, "M"), "M", pd.Timestamp(daily.datetime.iloc[-1])).reset_index(drop=True)
    if len(daily) >= 200 and len(monthly) >= 11:
        mc = monthly.close.astype(float)
        ma10 = mc.rolling(10).mean()
        if close.iloc[-1] > sma200.iloc[-1] and mc.iloc[-1] > ma10.iloc[-1]:
            out["long_ma_filter"] = _signal("long_ma_filter", daily,
                {"sma200": float(sma200.iloc[-1]), "month_close": float(mc.iloc[-1]), "sma10_month": float(ma10.iloc[-1])},
                ["日收盘 > SMA200", "完整月收盘 > SMA10"],
                {"daily": chart(daily, 90, {"SMA200": sma200}), "monthly": chart(monthly, 18, {"SMA10": ma10})})
    if len(daily) >= 201:
        fast, slow = close.rolling(50).mean(), sma200
        crosses = (fast > slow) & (fast.shift(1) <= slow.shift(1))
        recent = crosses.iloc[-20:]
        if fast.iloc[-1] > slow.iloc[-1] and recent.any():
            idx = recent[recent].index[-1]
            out["dual_ma_cross"] = _signal("dual_ma_cross", daily,
                {"sma50": float(fast.iloc[-1]), "sma200": float(slow.iloc[-1]), "days_since_cross": int(len(daily)-1-idx)},
                ["SMA50 > SMA200", "最近20个交易日发生金叉"],
                {"daily": chart(daily, 90, {"SMA50": fast, "SMA200": slow})},
                str(daily.datetime.iloc[idx])[:10], "SMA50跌回SMA200下方时重新评估")
    if len(monthly) >= 13:
        mc = monthly.close.astype(float)
        momentum = float(mc.iloc[-1] / mc.iloc[-13] - 1)
        if math.isfinite(momentum) and momentum > 0:
            out["absolute_momentum_12m"] = _signal("absolute_momentum_12m", daily,
                {"return_12m": momentum, "base_close": float(mc.iloc[-13]), "month_close": float(mc.iloc[-1])},
                ["12个月回报率 > 0"], {"monthly": chart(monthly, 13)},
                str(monthly.datetime.iloc[-1])[:10], "完整月度回报率降至零或以下时重新评估")
    if len(daily) >= 200:
        middle = close.rolling(20).mean()
        deviation = close.rolling(20).std(ddof=0)
        lower, upper = middle - 2*deviation, middle + 2*deviation
        if close.iloc[-2] < lower.iloc[-2] and close.iloc[-1] > lower.iloc[-1] and close.iloc[-1] > sma200.iloc[-1]:
            out["bollinger_rebound"] = _signal("bollinger_rebound", daily,
                {"lower": float(lower.iloc[-1]), "middle": float(middle.iloc[-1]), "upper": float(upper.iloc[-1]), "sma200": float(sma200.iloc[-1])},
                ["前日收盘 < 前日下轨", "最新收盘 > 最新下轨", "最新收盘 > SMA200"],
                {"daily": chart(daily, 45, {"上轨": upper, "中轨": middle, "下轨": lower, "SMA200": sma200})},
                exit_rule="收盘回到中轨或观察满10个交易日")
        delta = close.diff()
        gain = delta.clip(lower=0).ewm(alpha=.5, adjust=False, min_periods=2).mean()
        loss = (-delta.clip(upper=0)).ewm(alpha=.5, adjust=False, min_periods=2).mean()
        rsi = 100 - 100/(1 + gain/loss.replace(0, float("nan")))
        rsi = rsi.where(loss != 0, 100).where(gain != 0, 0)
        if pd.notna(rsi.iloc[-1]) and rsi.iloc[-1] < 5 and close.iloc[-1] > sma200.iloc[-1]:
            sma5 = close.rolling(5).mean()
            out["rsi2_mean_reversion"] = _signal("rsi2_mean_reversion", daily,
                {"rsi2": float(rsi.iloc[-1]), "sma5": float(sma5.iloc[-1]), "sma200": float(sma200.iloc[-1])},
                ["收盘 > SMA200", "RSI(2) < 5"],
                {"daily": chart(daily, 45, {"SMA5": sma5, "SMA200": sma200, "RSI2": rsi})},
                exit_rule="收盘高于SMA5、RSI(2)高于70或观察满10个交易日")
    return out
