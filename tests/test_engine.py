import unittest
import pandas as pd

from engine import trend, pattern, a_share_filter, a_start


def bars(closes, opens=None):
    opens = opens or closes
    return pd.DataFrame({
        "datetime": pd.date_range("2026-01-01", periods=len(closes), freq="D"),
        "open": opens, "high": [x + 1 for x in closes],
        "low": [x - 1 for x in closes], "close": closes,
        "amount": [100_000_000] * len(closes), "turnover": [1] * len(closes),
    })


class StrategyTests(unittest.TestCase):
    def test_four_close_trend_and_strict_comparisons(self):
        self.assertTrue(trend(bars([10, 12, 11, 13]))["ok"])
        self.assertFalse(trend(bars([10, 12, 10, 13]))["ok"])
        self.assertFalse(trend(bars([10, 12, 11, 12]))["ok"])

    def test_body_size_pattern_does_not_require_candle_direction(self):
        # Warm-up means are available only after the first 10 bars.
        closes = [10] * 10 + [12, 12.1, 14]
        opens = [9] * 10 + [10, 12, 12]
        self.assertEqual(pattern(bars(closes, opens)), "大小大")

    def test_a_share_limit_up_boundary(self):
        d = bars([10] * 58 + [11, 12.1])
        self.assertEqual(a_share_filter(d)[1], "近10日涨停达到2次")

    def test_crypto_day_starts_at_utc_midnight(self):
        self.assertEqual(a_start("2026-01-10", "D", "60m", "crypto"), pd.Timestamp("2026-01-10"))
        self.assertEqual(a_start("2026-01-10", "D", "60m", "ashare"), pd.Timestamp("2026-01-10 09:30"))


if __name__ == "__main__":
    unittest.main()
