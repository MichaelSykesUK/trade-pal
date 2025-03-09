import yfinance as yf
import pandas as pd
import numpy as np
import traceback


def process_data(data, ticker):
    """
    Process a DataFrame that may have MultiIndex columns.
    If a MultiIndex is detected, extract the sub-dataframe for the given ticker using xs().
    """
    print("process_data: Columns before processing:", data.columns)
    if isinstance(data.columns, pd.MultiIndex):
        try:
            # Use .xs() to extract the columns for the given ticker along the 'Ticker' level.
            data = data.xs(ticker, level="Ticker", axis=1)
        except Exception as e:
            raise ValueError(f"Error extracting ticker {ticker} with xs: {e}")
    return data


def convert_numpy_types(d):
    """
    Convert numpy types in a dictionary (of lists) to native Python types,
    and replace NaNs with None.
    """
    new_d = {}
    for key, lst in d.items():
        new_lst = []
        for item in lst:
            try:
                if isinstance(item, (np.integer,)):
                    new_lst.append(int(item))
                elif isinstance(item, (np.floating,)):
                    new_lst.append(float(item))
                elif pd.isna(item):
                    new_lst.append(None)
                else:
                    new_lst.append(item)
            except Exception as e:
                print(
                    f"Error converting item in key '{key}': {item}, error: {e}")
                new_lst.append(item)
        new_d[key] = new_lst
    return new_d


def get_stock_data(ticker: str, period: str = "1y", interval: str = "1d"):
    try:
        # Set auto_adjust=False to get raw prices.
        data = yf.download(ticker, period=period,
                           interval=interval, auto_adjust=False)
        print(f"get_stock_data: Downloaded data for {ticker}:\n", data.head())
    except Exception as e:
        traceback.print_exc()
        raise ValueError(f"Error downloading data for ticker {ticker}: {e}")

    if data.empty:
        raise ValueError("No data found for ticker: " + ticker +
                         ". Please check that you entered a valid ticker symbol.")

    try:
        data = process_data(data, ticker)
    except Exception as e:
        traceback.print_exc()
        raise ValueError(f"Error processing data for ticker {ticker}: {e}")

    data.reset_index(inplace=True)
    if "Date" in data.columns:
        data["Date"] = data["Date"].astype(str)
    else:
        data["Date"] = data.index.astype(str)

    data = data.where(pd.notnull(data), None)
    d = data.to_dict(orient="list")
    try:
        d = convert_numpy_types(d)
    except Exception as e:
        traceback.print_exc()
        raise ValueError("Conversion error: " + str(e))
    return d


def get_kpi_data(ticker: str):
    stock = yf.Ticker(ticker)
    info = stock.info
    kpi = {
        "peRatio": info.get("trailingPE", "N/A"),
        "weekHigh52": info.get("fiftyTwoWeekHigh", "N/A"),
        "weekLow52": info.get("fiftyTwoWeekLow", "N/A"),
    }
    return kpi

# --- Technical Indicator Functions ---


def compute_ma(prices, window):
    return prices.rolling(window=window).mean()


def compute_ema(prices, window):
    return prices.ewm(span=window, adjust=False).mean()


def compute_rsi(prices, window=14):
    delta = prices.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=window, min_periods=window).mean()
    avg_loss = loss.rolling(window=window, min_periods=window).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def compute_bollinger_bands(prices, window=20, num_std=2):
    rolling_mean = prices.rolling(window=window).mean()
    rolling_std = prices.rolling(window=window).std()
    upper_band = rolling_mean + (rolling_std * num_std)
    lower_band = rolling_mean - (rolling_std * num_std)
    return rolling_mean, upper_band, lower_band


def compute_momentum(prices, window=5):
    return (prices - prices.shift(window)) / prices.shift(window)


def compute_volatility(prices, window=20):
    return prices.rolling(window=window).std()


def compute_macd(prices, short_window=12, long_window=26, signal_window=9):
    ema_short = prices.ewm(span=short_window, adjust=False).mean()
    ema_long = prices.ewm(span=long_window, adjust=False).mean()
    macd = ema_short - ema_long
    signal = macd.ewm(span=signal_window, adjust=False).mean()
    return macd, signal


def compute_atr(high, low, close, window=14):
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.rolling(window=window).mean()
    return atr


def compute_obv(close, volume):
    obv = [0]
    for i in range(1, len(close)):
        if close.iloc[i] > close.iloc[i - 1]:
            obv.append(obv[-1] + volume.iloc[i])
        elif close.iloc[i] < close.iloc[i - 1]:
            obv.append(obv[-1] - volume.iloc[i])
        else:
            obv.append(obv[-1])
    return pd.Series(obv, index=close.index)


def get_technical_indicators(ticker: str, period: str = "1y", interval: str = "1d", ma_window: int = 50):
    try:
        data = yf.download(ticker, period=period,
                           interval=interval, auto_adjust=False)
        print(
            f"get_technical_indicators: Downloaded data for {ticker}:\n", data.head())
    except Exception as e:
        traceback.print_exc()
        raise ValueError(f"Error downloading data for ticker {ticker}: {e}")

    if data.empty:
        raise ValueError("No data for ticker: " + ticker)

    data.dropna(inplace=True)
    try:
        data = process_data(data, ticker)
    except Exception as e:
        traceback.print_exc()
        raise ValueError(f"Error processing data for ticker {ticker}: {e}")

    data.reset_index(inplace=True)
    if "Date" in data.columns:
        data["Date"] = data["Date"].astype(str)
    else:
        data["Date"] = data.index.astype(str)

    df = data.copy()
    df["MA"] = compute_ma(df["Close"], window=ma_window)
    df["EMA"] = compute_ema(df["Close"], window=ma_window)
    df["RSI"] = compute_rsi(df["Close"])
    ma_line, upper_band, lower_band = compute_bollinger_bands(df["Close"])
    df["Bollinger_MA"] = ma_line
    df["Upper_Band"] = upper_band
    df["Lower_Band"] = lower_band
    df["Momentum"] = compute_momentum(df["Close"])
    df["Volatility"] = compute_volatility(df["Close"])
    macd, signal = compute_macd(df["Close"])
    df["MACD"] = macd
    df["MACD_Signal"] = signal
    df["ATR"] = compute_atr(df["High"], df["Low"], df["Close"])
    df["OBV"] = compute_obv(df["Close"], df["Volume"])

    df = df.where(pd.notnull(df), None)
    d = df.to_dict(orient="list")
    try:
        d = convert_numpy_types(d)
    except Exception as e:
        traceback.print_exc()
        raise ValueError("Conversion error: " + str(e))
    return d
