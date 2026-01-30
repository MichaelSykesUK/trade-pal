# backend/ml.py

from pathlib import Path
import json
import time
from threading import Lock
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import GradientBoostingRegressor
from xgboost import XGBRegressor
from backend.tools import download_prices, get_extended_period, _cooldown_active, _cooldown_remaining_seconds
from yfinance.exceptions import YFRateLimitError
from backend.macro import align_macro_to_index

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

AUTO_MODEL_POOL = ["XGBoost", "RandomForest", "GBR"]
ML_QUALITY_MIN_R2 = 0.05
ML_QUALITY_MIN_IMPROVEMENT = 0.01  # 1% better than baseline RMSE

ML_CACHE_TTL = 60 * 60 * 24
ML_CACHE: dict[tuple, tuple[float, dict]] = {}
ML_CACHE_LOCK = Lock()

DEFAULT_FEATURE_FLAGS = {
    "ma50": True,
    "ma100": False,
    "ma150": True,
    "ma200": False,
    "ema50": False,
    "bollinger": True,
    "rsi": True,
    "obv": True,
    "atr": False,
    "macd": True,
    "volatility": False,
    "momentum": True,
    "sp500_ret": False,
    "fed_funds": False,
    "dgs10": False,
    "dgs2": False,
    "yield_curve_10y_2y": False,
    "cpi_yoy": False,
    "pce_yoy": False,
    "vix_ret": False,
    "wti_ret": False,
    "usd_ret": False,
    "gold_ret": False,
    "silver_ret": False,
}

def _regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    if y_true.size == 0:
        return {}
    mae = float(np.mean(np.abs(y_true - y_pred)))
    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))
    ss_res = float(np.sum((y_true - y_pred) ** 2))
    ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
    r2 = 0.0 if ss_tot == 0 else 1 - (ss_res / ss_tot)
    denom = np.abs(y_true) + np.abs(y_pred)
    smape = float(np.mean(np.where(denom == 0, 0.0, 2 * np.abs(y_pred - y_true) / denom)) * 100.0)
    return {"mae": mae, "rmse": rmse, "smape": smape, "r2": r2, "n": int(y_true.size)}


def _build_validation(metrics: dict | None) -> dict | None:
    if not metrics or "model" not in metrics or "baseline_last" not in metrics:
        return None
    model = metrics["model"] or {}
    baseline = metrics["baseline_last"] or {}
    model_rmse = model.get("rmse")
    baseline_rmse = baseline.get("rmse")
    model_r2 = model.get("r2")
    threshold_rmse = None
    improvement_pct = None
    passed = True
    messages = []

    if isinstance(baseline_rmse, (int, float)) and baseline_rmse:
        threshold_rmse = baseline_rmse * (1 - ML_QUALITY_MIN_IMPROVEMENT)
        if isinstance(model_rmse, (int, float)):
            improvement_pct = (baseline_rmse - model_rmse) / baseline_rmse * 100.0
            if model_rmse <= threshold_rmse:
                messages.append(
                    f"RMSE {model_rmse:.4f} meets threshold {threshold_rmse:.4f} (baseline {baseline_rmse:.4f})."
                )
            else:
                passed = False
                messages.append(
                    f"RMSE {model_rmse:.4f} not below threshold {threshold_rmse:.4f} (baseline {baseline_rmse:.4f})."
                )

    if isinstance(model_r2, (int, float)):
        if model_r2 >= ML_QUALITY_MIN_R2:
            messages.append(f"R² {model_r2:.3f} meets threshold {ML_QUALITY_MIN_R2:.2f}.")
        else:
            passed = False
            messages.append(f"R² {model_r2:.3f} below threshold {ML_QUALITY_MIN_R2:.2f}.")

    return {
        "passed": passed,
        "metric": "rmse",
        "score": model_rmse,
        "baseline": baseline_rmse,
        "threshold": threshold_rmse,
        "improvement_pct": improvement_pct,
        "r2": model_r2,
        "r2_threshold": ML_QUALITY_MIN_R2,
        "note": " ".join(messages).strip(),
    }


def _param_grid(model_type: str) -> list[dict]:
    if model_type == "XGBoost":
        return [
            {"n_estimators": 200, "max_depth": 3, "learning_rate": 0.05, "subsample": 0.8, "colsample_bytree": 0.8},
            {"n_estimators": 300, "max_depth": 4, "learning_rate": 0.05, "subsample": 0.8, "colsample_bytree": 0.8},
            {"n_estimators": 200, "max_depth": 5, "learning_rate": 0.1, "subsample": 0.9, "colsample_bytree": 0.9},
        ]
    if model_type == "RandomForest":
        return [
            {"n_estimators": 200, "max_depth": None, "min_samples_leaf": 1, "max_features": "sqrt"},
            {"n_estimators": 300, "max_depth": 10, "min_samples_leaf": 2, "max_features": "sqrt"},
            {"n_estimators": 300, "max_depth": 16, "min_samples_leaf": 3, "max_features": "sqrt"},
        ]
    if model_type == "GBR":
        return [
            {"n_estimators": 200, "learning_rate": 0.05, "max_depth": 2},
            {"n_estimators": 300, "learning_rate": 0.05, "max_depth": 3},
            {"n_estimators": 200, "learning_rate": 0.1, "max_depth": 3},
        ]
    return [{}]


def _cache_key(
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
) -> tuple:
    flags = tuple(sorted((k, bool(v)) for k, v in (feature_flags or {}).items()))
    return (
        ticker.upper(),
        period,
        interval,
        model_type,
        pre_days,
        test_days,
        ma1,
        ma2,
        ema1,
        arima_order,
        scaler_type,
        flags,
    )


def _cache_get(key: tuple) -> dict | None:
    with ML_CACHE_LOCK:
        entry = ML_CACHE.get(key)
        if not entry:
            return None
        ts, payload = entry
        if time.time() - ts < ML_CACHE_TTL:
            return payload
        return None


def _cache_set(key: tuple, payload: dict):
    with ML_CACHE_LOCK:
        ML_CACHE[key] = (time.time(), payload)


def _load_watchlist_config() -> list[str]:
    config_path = Path(__file__).resolve().parent / "config.json"
    if not config_path.exists():
        return []
    try:
        payload = json.loads(config_path.read_text())
        watchlist = payload.get("watchlist") or []
        return [str(item).upper() for item in watchlist if item]
    except Exception:
        return []


def warm_ml_cache_for_watchlist(
    period: str = "1y",
    interval: str = "1d",
    model_type: str = "XGBoost",
    pre_days: int = 20,
    test_days: int = 10,
    ma1: int = 50,
    ma2: int = 150,
    ema1: int = 50,
    scaler_type: str = "standard",
):
    tickers = _load_watchlist_config()
    if not tickers:
        return
    yf_period = get_extended_period(period, interval)
    for ticker in tickers:
        if _cooldown_active():
            time.sleep(max(30, _cooldown_remaining_seconds()))
            break
        try:
            run_ml_model(
                ticker=ticker,
                period=yf_period,
                interval=interval,
                model_type=model_type,
                pre_days=pre_days,
                test_days=test_days,
                ma1=ma1,
                ma2=ma2,
                ema1=ema1,
                arima_order=(5, 1, 0),
                scaler_type=scaler_type,
                feature_flags=DEFAULT_FEATURE_FLAGS,
                use_cache=False,
            )
        except YFRateLimitError:
            time.sleep(60)
            continue
        except Exception:
            continue
        time.sleep(2)


def start_ml_cache_scheduler(interval_seconds: int = 60 * 60 * 24):
    while True:
        try:
            warm_ml_cache_for_watchlist()
        except Exception:
            pass
        time.sleep(interval_seconds)


class StockPredictionModel:
    def __init__(
        self,
        ticker,
        period,
        interval,
        pre_days,
        test_days,
        seed,
        feature_flags,
        scaler_type,
        model_type,
        zoom,
        start,
        ma1,
        ma2,
        ema1,
        arima_order,
        price_data=None,
        model_params=None,
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
        self.model_params = model_params or {}
        self.scaler = self.get_scaler_type()
        self.model = self.get_model_type()
        self.ma1 = ma1
        self.ma2 = ma2
        self.ema1 = ema1
        # The day where all features available (respect toggled long-window features)
        self.feature_start = max(ma1, ma2, ema1)
        if self.feature_flags and self.feature_flags.get("ma100", True):
            self.feature_start = max(self.feature_start, 100)
        if self.feature_flags and self.feature_flags.get("ma200", True):
            self.feature_start = max(self.feature_start, 200)
        self.arima_order = arima_order
        self.feature_keys: list[str] = []

        # Load and prepare the data
        if price_data is not None:
            (
                self.real_prices,
                self.real_high_prices,
                self.real_low_prices,
                self.real_volumes,
            ) = price_data
        else:
            (
                self.real_prices,
                self.real_high_prices,
                self.real_low_prices,
                self.real_volumes,
            ) = self.load_data()

        # Compute features based on the loaded data
        self.evaluate_all_features()

        # Build and configure the model
        self.build_model()

    def load_data(self):
        """Load ticker data from Yahoo Finance."""
        try:
            data = download_prices(
                self.ticker, period=self.period, interval=self.interval)
            if data.empty:
                raise ValueError("No price history returned")

            # yfinance returns single-level columns for one ticker and a
            # MultiIndex when multiple tickers are requested. Support both
            # layouts so the ML endpoints work again.
            if isinstance(data.columns, pd.MultiIndex):
                try:
                    subset = data.xs(self.ticker, level=-1, axis=1)
                except KeyError as exc:
                    raise ValueError(
                        f"{self.ticker} not present in downloaded data") from exc
            else:
                subset = data

            required = ("Close", "High", "Low", "Volume")
            missing = [col for col in required if col not in subset.columns]
            if missing:
                raise ValueError(f"Missing columns: {', '.join(missing)}")

            prices = subset["Close"]
            high_prices = subset["High"]
            low_prices = subset["Low"]
            volumes = subset["Volume"]
            return prices, high_prices, low_prices, volumes

        except Exception as e:
            raise ValueError(f"Error loading data for {self.ticker}: {e}")

    def evaluate_all_features(self):
        """Compute and store all selected features."""
        self.ma50 = self.compute_ma(self.real_prices, window=self.ma1)
        self.ma150 = self.compute_ma(self.real_prices, window=self.ma2)
        self.ema50 = self.compute_ema(self.real_prices, window=self.ema1)
        self.momentum = self.compute_momentum(self.real_prices, window=50)
        self.rsi = self.compute_rsi(self.real_prices)
        self.upper_band, self.lower_band = self.compute_bollinger_bands(
            self.real_prices
        )
        self.volatility = self.compute_volatility(self.real_prices)
        self.macd, self.macd_signal = self.compute_macd(self.real_prices)
        self.atr = self.compute_atr(
            self.real_high_prices, self.real_low_prices, self.real_prices
        )
        self.obv = self.compute_obv(self.real_prices, self.real_volumes)

    def compute_rsi(self, prices, window=14):
        """Compute the Relative Strength Index (RSI)."""
        delta = prices.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        avg_gain = gain.rolling(window=window, min_periods=window).mean()
        avg_loss = loss.rolling(window=window, min_periods=window).mean()
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    def compute_bollinger_bands(self, prices, window=50, num_std_dev=2):
        """Compute Bollinger Bands."""
        rolling_mean = prices.rolling(window).mean()
        rolling_std = prices.rolling(window).std()
        upper_band = rolling_mean + (rolling_std * num_std_dev)
        lower_band = rolling_mean - (rolling_std * num_std_dev)
        return upper_band, lower_band

    def compute_ma(self, prices, window):
        """Compute the Moving Average."""
        return prices.rolling(window).mean()

    def compute_ema(self, prices, window):
        """Compute the Exponential Moving Average."""
        return prices.ewm(span=window, adjust=False).mean()

    def compute_momentum(self, prices, window=5):
        """Compute momentum as a percentage change."""
        return (prices - prices.shift(window)) / prices.shift(window)

    def compute_volatility(self, prices, window=50):
        """Compute the rolling standard deviation as volatility."""
        return prices.rolling(window).std()

    def compute_macd(self, prices, short_window=12, long_window=26, signal_window=9):
        """Compute the Moving Average Convergence Divergence (MACD)."""
        ema_short = prices.ewm(span=short_window, adjust=False).mean()
        ema_long = prices.ewm(span=long_window, adjust=False).mean()
        macd = ema_short - ema_long
        signal = macd.ewm(span=signal_window, adjust=False).mean()
        return macd, signal

    def compute_atr(self, high_prices, low_prices, close_prices, window=14):
        """Compute the Average True Range (ATR)."""

        # Convert to NumPy arrays to avoid issues with index-based element-wise operations
        high_prices_a = high_prices.to_numpy()
        low_prices_a = low_prices.to_numpy()
        close_prices_a = close_prices.to_numpy()

        # Calculate the True Range (TR) based on position, not index
        tr = np.maximum(
            high_prices_a[1:] - low_prices_a[1:],  # High-Low range
            np.maximum(
                np.abs(
                    high_prices_a[1:] - close_prices_a[:-1]
                ),  # Current high to previous close
                np.abs(
                    low_prices_a[1:] - close_prices_a[:-1]
                ),  # Current low to previous close
            ),
        )

        # Insert NaN at the beginning to align with the original data length
        tr = np.insert(tr, 0, np.nan)  # Align array with the original data

        # Create a pandas Series for `tr` with the same index as close_prices
        tr_series = pd.Series(tr, index=close_prices.index)

        # Apply rolling mean
        atr = tr_series.rolling(
            window=window
        ).mean()  # starts at 15h value because of nan at tr[0]

        # Ensure ATR is aligned with the original close_prices (offset by window size)
        atr = atr.reindex_like(close_prices)

        # Length checks: raise an error if there are any mismatches
        if len(close_prices) != len(tr) or len(tr) != len(atr):
            raise ValueError(
                f"Length mismatch: close_prices({len(close_prices)})"
                f", tr({len(tr)}), atr({len(atr)})")

        if len(high_prices) != len(low_prices) or len(high_prices) != len(close_prices):
            raise ValueError(
                f"Length mismatch between high_prices({len(high_prices)})"
                f", low_prices({len(low_prices)}), and close_prices({len(close_prices)})")

        return atr

    def compute_obv(self, prices, volumes):
        """Compute the On-Balance Volume (OBV)."""
        obv = [0]  # Initialize OBV list with the first value set to 0
        for i in range(1, len(prices)):
            if (
                prices.iloc[i] > prices.iloc[i - 1]
            ):  # Use .iloc for position-based indexing
                obv.append(obv[-1] + volumes.iloc[i])
            elif prices.iloc[i] < prices.iloc[i - 1]:
                obv.append(obv[-1] - volumes.iloc[i])
            else:
                obv.append(obv[-1])
        # Align OBV with the prices index
        return pd.Series(obv, index=prices.index)

    def evaluate_features(
        self,
        prices: list[float],
        high_prices: list[float],
        low_prices: list[float],
        volumes: list[float],
    ) -> dict[str, list[float]]:
        """
        Evaluate key metrics for use as model features.

        Parameters:
            prices (list[float]): List of closing prices.
            high_prices (list[float]): List of high prices.
            low_prices (list[float]): List of low prices.
            volumes (list[float]): List of trading volumes.

        Returns:
            dict[str, list[float]]: A dictionary containing computed feature arrays.

        Raises:
            ValueError: If feature lengths do not match the expected length.
        """
        # Define features and their computation methods
        features = {
            "ma50": lambda: self.compute_ma(prices, window=self.ma1),
            "ma100": lambda: self.compute_ma(prices, window=100),
            "ma150": lambda: self.compute_ma(prices, window=self.ma2),
            "ma200": lambda: self.compute_ma(prices, window=200),
            "ema50": lambda: self.compute_ema(prices, window=self.ema1),
            "momentum": lambda: self.compute_momentum(prices),
            "rsi": lambda: self.compute_rsi(prices),
            "upper_band": lambda: self.compute_bollinger_bands(prices)[0],
            "lower_band": lambda: self.compute_bollinger_bands(prices)[1],
            "volatility": lambda: self.compute_volatility(prices),
            "macd": lambda: self.compute_macd(prices)[0],
            "macd_signal": lambda: self.compute_macd(prices)[1],
            "atr": lambda: self.compute_atr(high_prices, low_prices, prices),
            "obv": lambda: self.compute_obv(prices, volumes),
        }

        # Compute features dynamically
        computed_features = {name: func() for name, func in features.items()}

        # Add aligned macro features (lagged to reduce look-ahead bias)
        macro_df = align_macro_to_index(prices.index, lag_days=1)
        if not macro_df.empty:
            for col in macro_df.columns:
                computed_features[col] = macro_df[col]

        # Validate feature lengths
        lengths = {name: len(values)
                   for name, values in computed_features.items()}
        expected_length = next(iter(lengths.values()))

        mismatches = [
            f"{name}: {length} (expected {expected_length})"
            for name, length in lengths.items()
            if length != expected_length
        ]
        if mismatches:
            raise ValueError(
                f"⚠️ Length mismatches found: {', '.join(mismatches)}")

        return computed_features

    @staticmethod
    def _feature_flag_groups() -> dict[str, list[str]]:
        return {
            "bollinger": ["upper_band", "lower_band"],
            "macd": ["macd", "macd_signal"],
        }

    def _flag_for_feature(self, feature_key: str) -> str:
        for flag, keys in self._feature_flag_groups().items():
            if feature_key in keys:
                return flag
        return feature_key

    def _is_feature_enabled(self, feature_key: str) -> bool:
        if not self.feature_flags:
            return True
        flag_key = self._flag_for_feature(feature_key)
        return bool(self.feature_flags.get(flag_key, True))

    def _apply_feature_flags_to_matrix(self, X: np.ndarray, feature_keys: list[str]) -> np.ndarray:
        if not self.feature_flags:
            return X
        X_weighted = X.copy()
        for idx, feature_key in enumerate(feature_keys):
            if not self._is_feature_enabled(feature_key):
                X_weighted[:, idx] = 0
        return X_weighted

    def walk_forward_metrics(self, test_days: int) -> dict | None:
        if test_days <= 0:
            return None
        if self.model_type == "ARIMA":
            series = self.real_prices.dropna()
            if len(series) <= test_days + 30:
                return None
            start_idx = len(series) - test_days
            preds, actuals, baseline = [], [], []
            for i in range(start_idx, len(series)):
                train_series = series.iloc[:i]
                model = None
                try:
                    from statsmodels.tsa.arima.model import ARIMA
                    model = ARIMA(train_series, order=self.arima_order).fit()
                    pred = float(model.forecast(steps=1).iloc[0])
                except Exception:
                    pred = float(train_series.iloc[-1])
                preds.append(pred)
                actuals.append(float(series.iloc[i]))
                baseline.append(float(train_series.iloc[-1]))
            return {
                "test_days": test_days,
                "model": _regression_metrics(np.array(actuals), np.array(preds)),
                "baseline_last": _regression_metrics(np.array(actuals), np.array(baseline)),
            }

        features = self.evaluate_features(
            prices=self.real_prices,
            high_prices=self.real_high_prices,
            low_prices=self.real_low_prices,
            volumes=self.real_volumes,
        )
        feature_keys = list(features.keys())
        feature_df = pd.concat(features, axis=1)
        feature_df["target"] = self.real_prices.shift(-1)
        feature_df["baseline"] = self.real_prices
        feature_df = feature_df.dropna()
        if len(feature_df) <= test_days + 30:
            return None

        start_idx = len(feature_df) - test_days
        preds, actuals, baseline = [], [], []
        for i in range(start_idx, len(feature_df)):
            train_df = feature_df.iloc[:i]
            test_row = feature_df.iloc[i:i + 1]
            X_train = train_df[feature_keys].values
            y_train = train_df["target"].values
            X_test = test_row[feature_keys].values
            scaler = self.get_scaler_type()
            if scaler:
                X_train = scaler.fit_transform(X_train)
                X_test = scaler.transform(X_test)
            X_train = self._apply_feature_flags_to_matrix(X_train, feature_keys)
            X_test = self._apply_feature_flags_to_matrix(X_test, feature_keys)
            model = self.get_model_type()
            model.fit(X_train, y_train)
            pred = float(model.predict(X_test)[0])
            preds.append(pred)
            actuals.append(float(test_row["target"].iloc[0]))
            baseline.append(float(test_row["baseline"].iloc[0]))
        return {
            "test_days": test_days,
            "model": _regression_metrics(np.array(actuals), np.array(preds)),
            "baseline_last": _regression_metrics(np.array(actuals), np.array(baseline)),
        }

    def build_model(self):
        """
        Evaluates features and builds training set X (real features) and y (real prices).
        Uses dynamic feature computation for flexibility and scalability.
        """
        # Initialize lists for features and target values
        self.X_list, self.y_list = [], []

        # Evaluate features dynamically
        features = self.evaluate_features(
            prices=self.real_prices,
            high_prices=self.real_high_prices,
            low_prices=self.real_low_prices,
            volumes=self.real_volumes,
        )

        # Ensure all feature arrays are aligned
        self.feature_keys = list(features.keys())
        feature_values = np.array([features[key] for key in self.feature_keys])
        if not all(len(arr) == feature_values.shape[1] for arr in feature_values):
            raise ValueError("Feature lengths are not aligned for training.")

        # Build feature vectors
        for i in range(self.feature_start - 1, len(self.real_prices)):
            # Extract the feature vector for the current index
            feature_vector = feature_values[:, i]
            self.X_list.append(feature_vector)
            self.y_list.append(self.real_prices.iloc[i])

        if not self.X_list:
            raise ValueError("Not enough history to build the training set for selected features.")

        # Convert lists to NumPy arrays
        X = np.array(self.X_list)
        y = np.array(self.y_list)

        # Save results to CSV
        results_df = pd.DataFrame(self.X_list)
        results_df.to_csv(OUTPUT_DIR / "X_list.csv", index=True, header=False)

        # Scale features if a scaler is provided
        if self.scaler:
            print(f"Scaler: {self.scaler}")
            X_scaled = self.scaler.fit_transform(X)
        else:
            X_scaled = X
            print("Scaler: None")

        # Apply feature weighting if feature_flags are provided
        if hasattr(self, "feature_flags") and self.feature_flags:
            X_weighted = X_scaled.copy()
            for idx, feature_key in enumerate(self.feature_keys):
                if not self._is_feature_enabled(feature_key):
                    X_weighted[:, idx] = 0
        else:
            X_weighted = X_scaled

        # Save results to CSV
        results_df = pd.DataFrame(X_weighted)
        results_df.to_csv(OUTPUT_DIR / "X_weighted.csv", index=True, header=False)

        # Train the model
        print(f"Model: {self.model}")
        if self.model_type == "ARIMA":
            from statsmodels.tsa.arima.model import ARIMA

            print("Training ARIMA model...")
            # Example order, tune as needed
            self.model = ARIMA(self.real_prices, order=self.arima_order)
            self.model = self.model.fit()
            self.X_weighted = None  # Not applicable for ARIMA
        else:
            self.model = self.get_model_type()
            self.model.fit(X_weighted, y)

        # Store results
        self.X = X
        self.X_weighted = X_weighted

    def update_projected_data(self, prices, high_prices, low_prices, volumes, prediction):
        """
        Append a single day of projected data, preserving the DatetimeIndex.
        """
        last_date = prices.index[-1]
        next_date = last_date + pd.Timedelta(days=1)

        # carry forward volume
        volumes = pd.concat(
            [volumes, pd.Series([volumes.iloc[-1]], index=[next_date])]
        )
        # estimate high/low around the prediction
        high_delta = high_prices.iloc[-1] - prices.iloc[-1]
        low_delta = prices.iloc[-1] - low_prices.iloc[-1]
        high_prices = pd.concat(
            [high_prices, pd.Series(
                [prediction + high_delta], index=[next_date])]
        )
        low_prices = pd.concat(
            [low_prices, pd.Series(
                [prediction - low_delta], index=[next_date])]
        )
        # append the predicted close
        prices = pd.concat(
            [prices, pd.Series([prediction], index=[next_date])]
        )

        return prices, high_prices, low_prices, volumes

    def get_price_data(self):
        return (
            self.real_prices.copy(),
            self.real_high_prices.copy(),
            self.real_low_prices.copy(),
            self.real_volumes.copy(),
        )

    def recalculate_features(self, prices, high_prices, low_prices, volumes):
        """
        Recalculate features dynamically for the given data.
        """
        features = self.evaluate_features(
            prices, high_prices, low_prices, volumes)
        if self.feature_keys:
            feature_vector = np.array(
                [features[key].iloc[-1] for key in self.feature_keys]
            )
        else:
            feature_vector = np.array(
                [values.iloc[-1] for values in features.values()]
            )
        return feature_vector

    def weight_last_feature(self, list, last_feature_vector):
        # Append feature vector
        list.append(last_feature_vector)
        X = np.array(list)

        # Scale and weight features
        if self.scaler:
            # avoid fit_transform as needs more data than 1 sample
            X_scaled = self.scaler.transform(X)  # Transform only
        else:
            X_scaled = X.copy()

        X_weighted = X_scaled.copy()

        print(f"X_scaled: {X_weighted}")

        for idx, feature_key in enumerate(self.feature_keys):
            if not self._is_feature_enabled(feature_key):
                X_weighted[:, idx] = 0

        last_feature_vector = X_weighted[-1]

        return last_feature_vector

    def iterate_forwards(
        self,
        prices,
        high_prices,
        low_prices,
        volumes,
        X_list,
        last_feature_vector,
        days,
        name,
    ):
        """
        Iteratively project prices for a given number of days (`pre_days`).

        Returns:
            pd.Series: Projected prices for the specified number of days.
        """

        results = []

        for i in range(1, days + 1):
            print(f"Performing prediction iteration: {i}/{days}")

            if self.model_type == "ARIMA":
                from statsmodels.tsa.arima.model import ARIMA

                prediction = self.model.forecast(steps=1).iloc[0]
                print(f"ARIMA forecast output: {prediction}")
                results.append(prediction)
                # prices = prices.append(pd.Series([prediction], index=[len(prices)]))
                prices = pd.concat(
                    [prices, pd.Series([prediction], index=[len(prices)])]
                )
                self.model = ARIMA(prices, order=self.arima_order).fit()
            else:
                prediction = self.model.predict([last_feature_vector])[0]

                # Update projected data
                (
                    prices,
                    high_prices,
                    low_prices,
                    volumes,
                ) = self.update_projected_data(
                    prices, high_prices, low_prices, volumes, prediction
                )

                # Recalculate features
                next_feature_vector = self.recalculate_features(
                    prices, high_prices, low_prices, volumes
                )

                # Scale and weight features
                next_feature_vector = self.weight_last_feature(
                    X_list, next_feature_vector
                )
                last_feature_vector = next_feature_vector

                # Store results
                row = {
                    f"{name} Iteration": i,
                    "Predicted_Price": prediction,
                    "Last Feature Vector": last_feature_vector,
                    "New Feature Vector": next_feature_vector,
                }

                results.append(row)

        if self.model_type != "ARIMA":
            # Save results to CSV
            results_df = pd.DataFrame(results)
            results_df.to_csv(OUTPUT_DIR / f"{name}_projection_results.csv", index=False)

        return prices

    def iterate_projections(self) -> pd.Series:
        """
        Iteratively project prices for a given number of days (`pre_days`).

        Returns:
            pd.Series: Projected prices for the specified number of days.
        """
        # Initialize prices
        prices = self.real_prices.copy()
        high_prices = self.real_high_prices.copy()
        low_prices = self.real_low_prices.copy()
        volumes = self.real_volumes.copy()

        # Initialize features
        X_list = self.X_list.copy()
        last_feature_vector = self.X_weighted[-1].copy()
        days = self.pre_days
        name = "Projected"

        prices = self.iterate_forwards(
            prices,
            high_prices,
            low_prices,
            volumes,
            X_list,
            last_feature_vector,
            days,
            name,
        )

        return prices

    def get_scaler_type(self):
        """Returns the appropriate scaler based on user input."""
        if self.scaler_type == "auto":
            if self.model_type in {"XGBoost", "RandomForest", "GBR", "ARIMA"}:
                return None
            return StandardScaler()
        if self.scaler_type == "minmax":
            return MinMaxScaler(feature_range=(-1, 1))
        elif self.scaler_type == "standard":
            return StandardScaler()
        elif self.scaler_type == "none":
            return None
        else:
            raise ValueError(f"Unknown scaler type: {self.scaler_type}")

    def get_model_type(self):
        """Returns the appropriate model based on user input."""
        if self.model_type == "XGBoost":
            params = {"random_state": self.seed}
            params.update(self.model_params or {})
            return XGBRegressor(**params)
        elif self.model_type == "RandomForest":
            params = {"random_state": self.seed}
            params.update(self.model_params or {})
            return RandomForestRegressor(**params)
        elif self.model_type == "GBR":
            params = {"random_state": self.seed}
            params.update(self.model_params or {})
            return GradientBoostingRegressor(**params)
        elif self.model_type == "LinearRegression":
            return LinearRegression()
        elif self.model_type == "ARIMA":
            return None  # ARIMA doesn't require initialization here
        else:
            raise ValueError(f"Unknown model type: {self.model_type}")


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
    use_cache: bool = True,
):

    cache_key = _cache_key(
        ticker,
        period,
        interval,
        model_type,
        pre_days,
        test_days,
        ma1,
        ma2,
        ema1,
        arima_order,
        scaler_type,
        feature_flags,
    )
    if use_cache:
        cached = _cache_get(cache_key)
        if cached:
            return cached | {"cached": True}

    def _train_model(selected_model: str, price_data=None, model_params: dict | None = None):
        start_val = max(ma1, ma2, ema1)
        model = StockPredictionModel(
            ticker=ticker,
            period=period,
            interval=interval,
            pre_days=pre_days,
            test_days=test_days,
            seed=42,
            feature_flags=feature_flags,
            scaler_type=scaler_type,
            model_type=selected_model,
            zoom=pre_days,
            start=start_val,
            ma1=ma1,
            ma2=ma2,
            ema1=ema1,
            arima_order=arima_order,
            price_data=price_data,
            model_params=model_params,
        )
        preds = model.iterate_projections()
        metrics = model.walk_forward_metrics(test_days=test_days)
        validation = _build_validation(metrics)
        return model, preds, metrics, validation

    base_model, base_preds, base_metrics, base_validation = _train_model(model_type)
    best = {
        "model_type": model_type,
        "model": base_model,
        "preds": base_preds,
        "metrics": base_metrics,
        "validation": base_validation,
        "params": None,
    }
    auto_retrained = False
    tuned = False
    search_summary = None

    if model_type != "ARIMA" and base_validation and not base_validation.get("passed", True):
        price_data = base_model.get_price_data()
        best_rmse = base_metrics.get("model", {}).get("rmse", float("inf")) if base_metrics else float("inf")
        for candidate in AUTO_MODEL_POOL:
            if candidate == model_type:
                continue
            grid = _param_grid(candidate)
            total_candidates = len(grid)
            local_best = None
            local_best_rmse = float("inf")
            local_best_metrics = None
            local_best_validation = None
            local_best_params = None
            for params in grid:
                try:
                    cand_model, cand_preds, cand_metrics, cand_validation = _train_model(
                        candidate, price_data=price_data, model_params=params
                    )
                except Exception:
                    continue
                cand_rmse = cand_metrics.get("model", {}).get("rmse", float("inf")) if cand_metrics else float("inf")
                if cand_rmse < local_best_rmse:
                    local_best_rmse = cand_rmse
                    local_best = (cand_model, cand_preds)
                    local_best_metrics = cand_metrics
                    local_best_validation = cand_validation
                    local_best_params = params
            if local_best and local_best_rmse < best_rmse:
                best_rmse = local_best_rmse
                best = {
                    "model_type": candidate,
                    "model": local_best[0],
                    "preds": local_best[1],
                    "metrics": local_best_metrics,
                    "validation": local_best_validation,
                    "params": local_best_params,
                }
                auto_retrained = True
                tuned = True
                search_summary = {
                    "searched": True,
                    "model": candidate,
                    "candidates": total_candidates,
                    "best_params": local_best_params,
                }

    predictions = best["preds"]

    payload = {
        "projected": {
            "Date": predictions.index.astype(str).tolist(),
            "Predicted": predictions.tolist(),
        },
        "metrics": best["metrics"],
        "validation": best["validation"],
        "requested_model": model_type,
        "model_used": best["model_type"],
        "auto_retrained": auto_retrained,
        "tuned": tuned,
        "search": search_summary,
    }
    _cache_set(cache_key, payload)
    return payload
