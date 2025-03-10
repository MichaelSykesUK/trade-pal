import yfinance as yf
import pandas as pd
import numpy as np
import traceback
from datetime import datetime, timedelta


def process_data(data, ticker):
    """
    If a MultiIndex is detected, extract the sub-dataframe for the given ticker using xs().
    """
    if isinstance(data.columns, pd.MultiIndex):
        try:
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


def get_extended_period(user_period: str) -> str:
    """
    Return a 'larger' period string for yfinance to fetch, 
    so we have enough data to handle warm-up periods for indicators.
    Adjust as you prefer.
    """
    user_period = user_period.upper()
    # Map user request to an extended period
    # (You can tweak these values as you see fit.)
    mapping = {
        "1D":  "1y",
        "5D":  "1y",
        "1M":  "1y",
        "6M":  "2y",
        "YTD": "2y",
        "1Y":  "2y",
        "5Y":  "10y",
        "MAX": "max",
    }
    return mapping.get(user_period, "2y")  # default to "2y" if not found


def slice_to_requested_period(df: pd.DataFrame, user_period: str) -> pd.DataFrame:
    """
    Slice the DataFrame to only the last portion that corresponds to the user's requested period.
    If user_period is '1Y', we keep only the last 365 days, etc.

    If there's not enough data, we simply return whatever we have (or raise an error).
    """
    user_period = user_period.upper()
    if df.empty:
        return df

    # We'll interpret user_period into a "timedelta" of how many days to keep
    now = df["Date"].iloc[-1]  # last date in the DataFrame (as a string)
    last_date = pd.to_datetime(now)

    # We'll define a function to convert user_period to number of days
    # for slicing. This is approximate. Adjust as you like.
    def period_to_days(period: str) -> int:
        if period == "1D":
            return 1
        elif period == "5D":
            return 5
        elif period == "1M":
            return 30
        elif period == "6M":
            return 180
        elif period == "YTD":
            # from Jan 1st of current year
            year_start = datetime(last_date.year, 1, 1)
            return (last_date - year_start).days
        elif period == "1Y":
            return 365
        elif period == "5Y":
            return 365 * 5
        elif period == "MAX":
            return 999999  # basically all
        else:
            return 365  # fallback

    ndays = period_to_days(user_period)
    cutoff = last_date - timedelta(days=ndays)

    # Now slice df so that df["Date"] >= cutoff
    df["Date_dt"] = pd.to_datetime(df["Date"])
    sliced = df[df["Date_dt"] >= cutoff].copy()
    sliced.drop(columns=["Date_dt"], inplace=True, errors="ignore")
    if sliced.empty:
        # If there's no data in that slice, return the entire df or raise an error
        # raise ValueError(f"Not enough data to fulfill period {user_period}")
        return df
    return sliced


def check_enough_data(df: pd.DataFrame, min_days_required: int):
    """
    Check if the DataFrame has at least min_days_required rows.
    If not, raise an error or return gracefully.
    """
    if len(df) < min_days_required:
        raise ValueError(
            f"Not enough historical data ({len(df)} days) to compute "
            f"a {min_days_required}-day indicator. Please try a longer period or a different indicator."
        )


def get_kpi_data(ticker: str):
    """
    Fetch KPI data for the specified ticker, including companyName, marketCap, etc.
    """
    stock = yf.Ticker(ticker)
    info = stock.info or {}

    kpi = {
        "companyName": info.get("longName", "N/A"),
        "peRatio": info.get("trailingPE", "N/A"),
        "weekHigh52": info.get("fiftyTwoWeekHigh", "N/A"),
        "weekLow52": info.get("fiftyTwoWeekLow", "N/A"),
        "marketCap": info.get("marketCap", "N/A"),
        "beta": info.get("beta", "N/A"),
        "eps": info.get("trailingEps", "N/A"),
        "dividend": info.get("dividendRate", "N/A"),
        "exDividendDate": str(info.get("exDividendDate", "N/A")),
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
    # OBV is cumulative from the first data point
    obv = [0]
    for i in range(1, len(close)):
        if close.iloc[i] is None or close.iloc[i-1] is None:
            # if missing data, just carry forward
            obv.append(obv[-1])
            continue
        if close.iloc[i] > close.iloc[i - 1]:
            obv.append(obv[-1] + (volume.iloc[i] if volume.iloc[i] else 0))
        elif close.iloc[i] < close.iloc[i - 1]:
            obv.append(obv[-1] - (volume.iloc[i] if volume.iloc[i] else 0))
        else:
            obv.append(obv[-1])
    return pd.Series(obv, index=close.index)


def get_stock_data(ticker: str, period: str = "1y", interval: str = "1d"):
    """
    1) Convert user 'period' to a bigger fetch period (e.g. 1Y -> 2Y).
    2) Fetch data from yfinance for that extended period.
    3) Process data, no big indicators are computed here, but we could.
    4) Slice to the actual user period (the last portion).
    5) Return the final dictionary.
    """
    extended_period = get_extended_period(period)
    try:
        data = yf.download(ticker, period=extended_period,
                           interval=interval, auto_adjust=False)
    except Exception as e:
        traceback.print_exc()
        raise ValueError(f"Error downloading data for ticker {ticker}: {e}")

    if data.empty:
        raise ValueError(
            f"No data found for {ticker} in extended period {extended_period}.")

    # If multi-index, reduce
    data = process_data(data, ticker)

    data.reset_index(inplace=True)
    if "Date" not in data.columns:
        data["Date"] = data.index.astype(str)
    else:
        data["Date"] = data["Date"].astype(str)

    # Convert to normal python types
    data = data.where(pd.notnull(data), None)

    # Now slice to the actual user period
    data = slice_to_requested_period(data, period)

    # Convert to dict
    d = data.to_dict(orient="list")
    d = convert_numpy_types(d)
    return d


def get_technical_indicators(ticker: str, period: str = "1y", interval: str = "1d", ma_window: int = 50):
    """
    1) Convert user 'period' to a bigger fetch period to allow warm-up.
    2) Fetch data from yfinance for that extended period.
    3) Compute all indicators on the full dataset.
    4) Slice to the actual user period.
    5) Return final dictionary with columns for RSI, OBV, etc.
    6) If not enough data for the largest needed window, raise an error.
    """
    extended_period = get_extended_period(period)
    try:
        data = yf.download(ticker, period=extended_period,
                           interval=interval, auto_adjust=False)
    except Exception as e:
        traceback.print_exc()
        raise ValueError(f"Error downloading data for ticker {ticker}: {e}")

    if data.empty:
        raise ValueError(
            f"No data found for {ticker} in extended period {extended_period}.")

    # If multi-index, reduce
    data = process_data(data, ticker)
    data.dropna(subset=["Close"], inplace=True)  # ensure we have valid close

    # Check if we have enough rows to handle the largest indicator window
    # For instance, if ma_window=200, we need at least 200 data points, etc.
    # We'll also consider RSI(14) or Bollinger(20), whichever is largest.
    # For demonstration, we assume ma_window is the largest we might need.
    min_days = ma_window  # you can also incorporate other indicator windows if needed
    if len(data) < min_days:
        raise ValueError(
            f"Not enough data ({len(data)} rows) to compute a {ma_window}-day indicator. "
            "Try a longer period or a smaller window."
        )

    # Convert index to column for slicing
    data.reset_index(inplace=True)
    if "Date" not in data.columns:
        data["Date"] = data.index.astype(str)
    else:
        data["Date"] = data["Date"].astype(str)

    # Compute all the indicators on the entire extended dataset
    df = data.copy()

    # For convenience
    close = df["Close"].astype(float)
    high = df["High"].astype(float)
    low = df["Low"].astype(float)
    vol = df["Volume"].fillna(0).astype(float)

    # MA and EMA
    df["MA"] = compute_ma(close, window=ma_window)
    df["EMA"] = compute_ema(close, window=ma_window)

    # RSI
    df["RSI"] = compute_rsi(close, window=14)

    # Bollinger
    ma_line, upper_band, lower_band = compute_bollinger_bands(
        close, window=20, num_std=2)
    df["Bollinger_MA"] = ma_line
    df["Upper_Band"] = upper_band
    df["Lower_Band"] = lower_band

    # Momentum
    df["Momentum"] = compute_momentum(close, window=5)

    # Volatility
    df["Volatility"] = compute_volatility(close, window=20)

    # MACD
    macd_line, signal_line = compute_macd(
        close, short_window=12, long_window=26, signal_window=9)
    df["MACD"] = macd_line
    df["MACD_Signal"] = signal_line

    # ATR
    df["ATR"] = compute_atr(high, low, close, window=14)

    # OBV
    df["OBV"] = compute_obv(close, vol)

    # Now slice to the actual user period
    df = df.where(pd.notnull(df), None)
    df = slice_to_requested_period(df, period)

    # Convert to dict
    d = df.to_dict(orient="list")
    d = convert_numpy_types(d)
    return d
