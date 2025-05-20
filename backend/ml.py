# backend/ml.py

import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from xgboost import XGBRegressor
from statsmodels.tsa.arima.model import ARIMA


class StockPredictionModel:
    def __init__(
        self,
        ticker: str,
        period: str,
        interval: str,
        pre_days: int,
        test_days: int,
        seed: int,
        feature_flags: dict,
        scaler_type: str,
        model_type: str,
        zoom: int,
        start: int,
        ma1: int,
        ma2: int,
        ema1: int,
        arima_order: tuple[int, int, int],
    ):
        """Initialize the StockPredictionModel with parameters and load data."""
        self.ticker = ticker
        self.period = period
        self.interval = interval
        self.pre_days = pre_days
        self.test_days = test_days
        self.seed = seed
        self.feature_flags = feature_flags
        self.scaler_type = scaler_type
        self.model_type = model_type
        self.zoom = zoom
        self.start = start
        self.ma1 = ma1
        self.ma2 = ma2
        self.ema1 = ema1
        self.feature_start = max(ma1, ma2, ema1)
        self.arima_order = arima_order

        # Load and prepare data
        (
            self.real_prices,
            self.real_high_prices,
            self.real_low_prices,
            self.real_volumes,
        ) = self.load_data()

        # Compute features
        self.evaluate_all_features()

        # Build the model
        self.build_model()

    def load_data(self):
        """Load ticker data from Yahoo Finance."""
        try:
            data = yf.download(
                self.ticker, period=self.period, interval=self.interval)
            prices = data["Close"]
            high_prices = data["High"]
            low_prices = data["Low"]
            volumes = data["Volume"]
            return prices, high_prices, low_prices, volumes
        except Exception as e:
            raise ValueError(f"Error loading data for {self.ticker}: {e}")

    def evaluate_all_features(self):
        self.ma50 = self.compute_ma(self.real_prices, window=self.ma1)
        self.ma150 = self.compute_ma(self.real_prices, window=self.ma2)
        self.ema50 = self.compute_ema(self.real_prices, window=self.ema1)
        self.momentum = self.compute_momentum(self.real_prices, window=50)
        self.rsi = self.compute_rsi(self.real_prices)
        self.upper_band, self.lower_band = self.compute_bollinger_bands(
            self.real_prices)
        self.volatility = self.compute_volatility(self.real_prices)
        self.macd, self.macd_signal = self.compute_macd(self.real_prices)
        self.atr = self.compute_atr(
            self.real_high_prices, self.real_low_prices, self.real_prices)
        self.obv = self.compute_obv(self.real_prices, self.real_volumes)

    def compute_rsi(self, prices, window=14):
        delta = prices.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        avg_gain = gain.rolling(window=window, min_periods=window).mean()
        avg_loss = loss.rolling(window=window, min_periods=window).mean()
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def compute_bollinger_bands(self, prices, window=50, num_std_dev=2):
        rolling_mean = prices.rolling(window).mean()
        rolling_std = prices.rolling(window).std()
        upper = rolling_mean + (rolling_std * num_std_dev)
        lower = rolling_mean - (rolling_std * num_std_dev)
        return upper, lower

    def compute_ma(self, prices, window):
        return prices.rolling(window).mean()

    def compute_ema(self, prices, window):
        return prices.ewm(span=window, adjust=False).mean()

    def compute_momentum(self, prices, window=5):
        return (prices - prices.shift(window)) / prices.shift(window)

    def compute_volatility(self, prices, window=50):
        return prices.rolling(window).std()

    def compute_macd(self, prices, short_window=12, long_window=26, signal_window=9):
        ema_short = prices.ewm(span=short_window, adjust=False).mean()
        ema_long = prices.ewm(span=long_window, adjust=False).mean()
        macd = ema_short - ema_long
        signal = macd.ewm(span=signal_window, adjust=False).mean()
        return macd, signal

    def compute_atr(self, high_prices, low_prices, close_prices, window=14):
        ha = high_prices.to_numpy()
        la = low_prices.to_numpy()
        ca = close_prices.to_numpy()
        tr = np.maximum(
            ha[1:] - la[1:],
            np.maximum(
                np.abs(ha[1:] - ca[:-1]),
                np.abs(la[1:] - ca[:-1]),
            ),
        )
        tr = np.insert(tr, 0, np.nan)
        tr_series = pd.Series(tr, index=close_prices.index)
        atr = tr_series.rolling(
            window=window).mean().reindex_like(close_prices)
        return atr

    def compute_obv(self, prices, volumes):
        obv = [0]
        for i in range(1, len(prices)):
            if prices.iloc[i] > prices.iloc[i - 1]:
                obv.append(obv[-1] + volumes.iloc[i])
            elif prices.iloc[i] < prices.iloc[i - 1]:
                obv.append(obv[-1] - volumes.iloc[i])
            else:
                obv.append(obv[-1])
        return pd.Series(obv, index=prices.index)

    def build_model(self):
        # Prepare training set
        feats = self.evaluate_features(
            self.real_prices,
            self.real_high_prices,
            self.real_low_prices,
            self.real_volumes,
        )
        vals = np.array(list(feats.values()))
        X = []
        y = []
        for i in range(self.feature_start - 1, len(self.real_prices)):
            X.append(vals[:, i])
            y.append(self.real_prices.iloc[i])
        X = np.array(X)
        y = np.array(y)

        # Scaler
        if self.scaler_type == "minmax":
            scaler = MinMaxScaler(feature_range=(-1, 1))
        elif self.scaler_type == "standard":
            scaler = StandardScaler()
        else:
            scaler = None
        X_scaled = scaler.fit_transform(X) if scaler else X

        # Model selection
        if self.model_type == "XGBoost":
            self.model = XGBRegressor(random_state=self.seed)
        elif self.model_type == "RandomForest":
            self.model = RandomForestRegressor(random_state=self.seed)
        elif self.model_type == "GBR":
            self.model = GradientBoostingRegressor(random_state=self.seed)
        elif self.model_type == "LinearRegression":
            self.model = LinearRegression()
        elif self.model_type == "ARIMA":
            self.model = ARIMA(self.real_prices, order=self.arima_order).fit()
            return
        else:
            raise ValueError(f"Unknown model type: {self.model_type}")

        self.model.fit(X_scaled, y)
        self.X_scaled = X_scaled

    def iterate_projections(self):
        results = []
        last_feat = self.X_scaled[-1]
        for _ in range(self.pre_days):
            if self.model_type == "ARIMA":
                pred = float(self.model.forecast(steps=1).iloc[0])
            else:
                pred = float(self.model.predict([last_feat])[0])
            results.append(pred)
            # (feature update logic omitted for brevity)
        return pd.Series(results, name="Predicted")

    def iterate_test(self):
        results = []
        for _ in range(self.test_days):
            if self.model_type == "ARIMA":
                pred = float(self.model.forecast(steps=1).iloc[0])
            else:
                pred = float(self.model.predict([self.X_scaled[-1]])[0])
            results.append(pred)
        return pd.Series(results, name="Test")


def get_available_models():
    return ["XGBoost", "RandomForest", "GBR", "LinearRegression", "ARIMA"]


def run_ml_model(
    ticker: str,
    period: str,
    interval: str,
    model_type: str,
    pre_days: int,
    test_days: int,
    ma1: int,
    ma2: int,
    ema1: int,
    arima_order: tuple[int, int, int],
    scaler_type: str,
    feature_flags: dict,
):
    start_val = max(ma1, ma2, ema1)
    m = StockPredictionModel(
        ticker=ticker,
        period=period,
        interval=interval,
        pre_days=pre_days,
        test_days=test_days,
        seed=42,
        feature_flags=feature_flags,
        scaler_type=scaler_type,
        model_type=model_type,
        zoom=pre_days,
        start=start_val,
        ma1=ma1,
        ma2=ma2,
        ema1=ema1,
        arima_order=arima_order,
    )
    proj = m.iterate_projections()
    test = m.iterate_test()

    def series_to_dict(s: pd.Series):
        return {"Date": s.index.astype(str).tolist(), s.name: s.tolist()}

    return {"projected": series_to_dict(proj), "test": series_to_dict(test)}
