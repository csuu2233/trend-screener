import unittest
import pandas as pd

from strategies import scan_strategies, scan_reversion_pool


def bars(prices):
    dates = pd.bdate_range("2024-01-02", periods=len(prices))
    return pd.DataFrame({"datetime": dates, "open": prices, "high": [x + 1 for x in prices],
                         "low": [x - 1 for x in prices], "close": prices,
                         "amount": [100_000_000] * len(prices), "turnover": [1.] * len(prices)})


class StrategyTests(unittest.TestCase):
    def test_long_ma_and_momentum(self):
        found = scan_strategies(bars([100 + i * .1 for i in range(500)]), "us")
        self.assertIn("long_ma_filter", found)
        self.assertIn("absolute_momentum_12m", found)
        self.assertEqual(len(found["absolute_momentum_12m"]["chart"]["monthly"]), 13)

    def test_insufficient_history(self):
        self.assertEqual(scan_strategies(bars([100.] * 60), "us"), {})

    def test_bollinger_reentry(self):
        prices = [100.] * 210 + [90., 99.]
        found = scan_strategies(bars(prices), "us")
        self.assertNotIn("bollinger_rebound", found)  # below SMA200 trend guard

    def test_reversion_pool_uses_own_candles(self):
        daily = bars([100 + i * .1 for i in range(250)])
        weekly = bars([100.] * 30 + [90., 99.])
        found = scan_reversion_pool(weekly, daily, "us", "weekly")
        self.assertIn("bollinger_rebound", found)
        self.assertIn("weekly", found["bollinger_rebound"]["chart"])


if __name__ == "__main__":
    unittest.main()
