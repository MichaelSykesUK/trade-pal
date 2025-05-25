# backend/ml.py

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import GradientBoostingRegressor
from xgboost import XGBRegressor
import yfinance as yf


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
        self.scaler = self.get_scaler_type()
        self.model = self.get_model_type()
        self.ma1 = ma1
        self.ma2 = ma2
        self.ema1 = ema1
        # The day where all features available
        self.feature_start = max(ma1, ma2, ema1)
        self.arima_order = arima_order

        # Load and prepare the data
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
            data = yf.download(
                self.ticker, period=self.period, interval=self.interval)

            # Extract relevant multiindex columns for the specific ticker
            prices = data[("Close", self.ticker)]
            high_prices = data[("High", self.ticker)]
            low_prices = data[("Low", self.ticker)]
            volumes = data[("Volume", self.ticker)]
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
            "ma150": lambda: self.compute_ma(prices, window=self.ma2),
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
        feature_values = np.array(list(features.values()))
        if not all(len(arr) == feature_values.shape[1] for arr in feature_values):
            raise ValueError("Feature lengths are not aligned for training.")

        # Build feature vectors
        for i in range(self.feature_start - 1, len(self.real_prices)):
            # Extract the feature vector for the current index
            feature_vector = feature_values[:, i]
            self.X_list.append(feature_vector)
            self.y_list.append(self.real_prices.iloc[i])

        # Convert lists to NumPy arrays
        X = np.array(self.X_list)
        y = np.array(self.y_list)

        # Save results to CSV
        results_df = pd.DataFrame(self.X_list)
        results_df.to_csv("X_list.csv", index=True, header=False)

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
            for idx, feature_flag in enumerate(self.feature_flags.values()):
                if not feature_flag:
                    X_weighted[:, idx] = 0
        else:
            X_weighted = X_scaled

        # Save results to CSV
        results_df = pd.DataFrame(X_weighted)
        results_df.to_csv("X_weighted.csv", index=True, header=False)

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

    def recalculate_features(self, prices, high_prices, low_prices, volumes):
        """
        Recalculate features dynamically for the given data.
        """
        features = self.evaluate_features(
            prices, high_prices, low_prices, volumes)
        feature_vector = np.array([values.iloc[-1]
                                   for values in features.values()])
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

        for idx, feature_flag in enumerate(self.feature_flags.values()):
            if not feature_flag:
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
            results_df.to_csv(f"{name}_projection_results.csv", index=False)

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
            return XGBRegressor(random_state=self.seed)
        elif self.model_type == "RandomForest":
            return RandomForestRegressor(random_state=self.seed)
        elif self.model_type == "GBR":
            return GradientBoostingRegressor(random_state=self.seed)
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
    predictions = m.iterate_projections()

    return {
        "projected": {
            "Date":      predictions.index.astype(str).tolist(),
            "Predicted": predictions.tolist()
        }
    }
