import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
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
                f"Length mismatch: close_prices({
                    len(close_prices)}), tr({len(tr)}), atr({len(atr)})"
            )

        if len(high_prices) != len(low_prices) or len(high_prices) != len(close_prices):
            raise ValueError(
                f"Length mismatch between high_prices({len(high_prices)}), low_prices({
                    len(low_prices)}), and close_prices({len(close_prices)})"
            )

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
            raise ValueError(f"⚠️ Length mismatches found: {
                             ', '.join(mismatches)}")

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

    def update_projected_data(
        self, prices, high_prices, low_prices, volumes, prediction
    ):
        """
        Update projected data based on the new prediction.
        """
        volumes = pd.concat(
            [volumes, pd.Series([volumes.iloc[-1]])], ignore_index=True)
        high_prices = pd.concat(
            [
                high_prices,
                pd.Series(
                    [prediction + (high_prices.iloc[-1] - prices.iloc[-1])]),
            ],
            ignore_index=True,
        )
        low_prices = pd.concat(
            [
                low_prices,
                pd.Series(
                    [prediction - (prices.iloc[-1] - low_prices.iloc[-1])]),
            ],
            ignore_index=True,
        )
        prices = pd.concat(
            [prices, pd.Series([prediction])], ignore_index=True)
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

    def iterate_test(self):
        """Iteratively test the model by comparing predicted prices against real data.

        Returns:
            pd.Series: Test prices for the specified number of days.
        """
        # Initialize
        prices = self.real_prices[: self.start].copy()
        high_prices = self.real_high_prices[: self.start].copy()
        low_prices = self.real_low_prices[: self.start].copy()
        volumes = self.real_volumes[: self.start].copy()

        # Initialize features
        X_list = self.X_list[: self.start - self.feature_start].copy()
        last_feature_vector = self.X_weighted[
            self.start - 1 - self.feature_start + 1
        ].copy()
        days = self.test_days
        name = "Test"

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

    def plot_results(self, predictions, test_predictions):
        """
        Plot the results of predictions and test predictions.

        Args:
            predictions (np.array): Array of projected prices (future predictions).
            test_predictions (np.array): Array of test predictions for evaluation.
        """
        zoom = self.zoom
        start = self.start
        real_days_count = len(self.real_prices)

        # Define ranges
        # 1-indexed days for real data
        real_days = range(1, real_days_count + 1)
        predicted_days = range(
            real_days_count, real_days_count + self.pre_days + 1)
        real_test_days = range(1, start + self.test_days + 1)
        test_days = range(start, start + self.test_days + 1)

        # Logging details
        print(f"Real days count: {real_days_count}")
        print(f"Predicted days count: {self.pre_days}")
        print(f"Real days range: {list(real_days)}")
        print(f"Predicted days range: {list(predicted_days)}")
        print(f"Real test days range: {list(real_test_days)}")
        print(f"Test days range: {list(test_days)}")

        # Start plotting
        plt.figure(figsize=(14, 12))

        # Full prediction plot (top-left)
        plt.subplot(2, 2, 1)
        self._plot_full_predictions(real_days, predictions, predicted_days)
        plt.title(f"{self.ticker} Price Prediction (Full Range)")

        # Last zoomed days plot (top-right)
        plt.subplot(2, 2, 2)
        self._plot_zoomed_predictions(real_days, predictions, zoom)
        plt.title(f"{self.ticker} Last Zoomed Days (Simulated + Predicted)")

        # Test predictions plot (bottom-left)
        plt.subplot(2, 2, 3)
        self._plot_test_predictions(
            real_test_days, test_predictions, test_days)
        plt.title(f"{self.ticker} Test Predictions vs Actual")

        # Show the plots
        plt.tight_layout()
        plt.show()

    def _plot_full_predictions(self, real_days, predictions, predicted_days):
        """
        Plot the full range of real prices and predictions.
        """
        plt.plot(real_days, self.real_prices, label="Actual Prices")
        plt.plot(real_days, self.ma50[: len(
            real_days)], label="MA50", linestyle="--")
        plt.plot(real_days, self.ma150[: len(
            real_days)], label="MA150", linestyle="--")
        plt.plot(
            predicted_days,
            predictions[len(real_days) - 1:],
            label="Predicted Prices",
            linestyle="-",
            color="green",
        )
        plt.xlabel("Days")
        plt.ylabel("Price")
        plt.legend()
        plt.ylim(0, max(self.real_prices) * 1.1)

    def _plot_zoomed_predictions(self, real_days, predictions, zoom):
        """
        Plot the zoomed-in range of real prices and predictions.
        """
        zoomed_real_days = real_days[-zoom:]
        zoomed_predicted_days = range(
            len(real_days), len(real_days) + zoom + 1)
        plt.plot(
            zoomed_real_days, self.real_prices[-zoom:
                                               ], label="Actual Prices (Zoomed)"
        )
        plt.plot(zoomed_real_days,
                 self.ma50[-zoom:], label="MA50", linestyle="--")
        plt.plot(zoomed_real_days,
                 self.ma150[-zoom:], label="MA150", linestyle="--")
        plt.plot(
            zoomed_predicted_days,
            predictions[len(real_days) - 1: len(real_days) + zoom],
            label="Predicted Prices",
            linestyle="-",
            color="green",
        )
        plt.xlabel("Days")
        plt.ylabel("Price")
        plt.legend()

    def _plot_test_predictions(self, real_test_days, test_predictions, test_days):
        """
        Plot test predictions against the actual prices.
        """
        plt.plot(
            real_test_days,
            self.real_prices[: len(real_test_days)],
            label="Actual Prices",
        )
        plt.plot(
            test_days,
            test_predictions[self.start - 1: self.start + self.test_days + 1],
            label="Predicted Prices",
            linestyle="-",
            color="green",
        )
        plt.xlabel("Days")
        plt.ylabel("Price")
        plt.legend()
        plt.ylim(0, max(self.real_prices) * 1.1)

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


def main():
    # Configuration settings
    config = {
        "ticker": "TSLA",
        "period": "2y",
        "interval": "1d",
        "pre_days": 10,
        "test_days": 10,
        "seed": 42,
        "start": 150,
        "zoom": 10,  # Should typically match pre_days
        "ma1": 50,
        "ma2": 150,
        "ema1": 50,
        "arima_order": (5, 1, 0),
        "feature_flags": {
            "ma50": True,
            "ma150": True,
            "ema50": True,
            "momentum": True,
            "rsi": True,
            "upper_band": True,
            "lower_band": True,
            "volatility": True,
            "macd": True,
            "macd_signal": True,
            "atr": True,
            "obv": True,
        },
        "scaler_type": "standard",  # Options: "none", "standard", "minmax"
        # Options: "XGBoost", "RandomForest", "GBR", "LinearRegression", "ARIMA"
        "model_type": "XGBoost",
    }

    # Log configuration for debugging
    print("Configuration Settings:")
    for key, value in config.items():
        if isinstance(value, dict):
            print(f"{key}:")
            for sub_key, sub_value in value.items():
                print(f"  {sub_key}: {sub_value}")
        else:
            print(f"{key}: {value}")
    print("\n")

    # Initialize the StockPredictionModel
    model = StockPredictionModel(
        ticker=config["ticker"],
        period=config["period"],
        interval=config["interval"],
        pre_days=config["pre_days"],
        test_days=config["test_days"],
        seed=config["seed"],
        feature_flags=config["feature_flags"],
        scaler_type=config["scaler_type"],
        model_type=config["model_type"],
        zoom=config["zoom"],
        start=config["start"],
        ma1=config["ma1"],
        ma2=config["ma2"],
        ema1=config["ema1"],
        arima_order=config["arima_order"],
    )

    # Generate projections and test predictions
    print("Starting projection iterations...")
    projected_predictions = model.iterate_projections()
    print("Projection iterations complete.\n")

    print("Starting test iterations...")
    test_predictions = model.iterate_test()
    print("Test iterations complete.\n")

    # Plot the results
    print("Plotting results...")
    model.plot_results(projected_predictions, test_predictions)
    print("Plotting complete.")


if __name__ == "__main__":
    main()
