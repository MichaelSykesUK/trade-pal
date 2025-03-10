import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta


def process_data(data, ticker):
    if isinstance(data.columns, pd.MultiIndex):
        try:
            data = data.xs(ticker, level="Ticker", axis=1)
        except Exception as e:
            raise ValueError(f"Error extracting ticker {ticker} with xs: {e}")
    return data


def convert_numpy_types(d):
    new_d = {}
    for key, lst in d.items():
        new_lst = []
        for item in lst:
            try:
                if isinstance(item, (np.integer,)):
                    new_lst.append(int(item))
                elif isinstance(item, (np.floating,)):
                    new_lst.append(float(item) if not pd.isna(item) else None)
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
    user_period = user_period.upper()
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
    return mapping.get(user_period, "2y")


def slice_to_requested_period(df: pd.DataFrame, user_period: str) -> pd.DataFrame:
    user_period = user_period.upper()
    if df.empty:
        return df
    now = df["Date"].iloc[-1]
    last_date = pd.to_datetime(now)

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
            year_start = datetime(last_date.year, 1, 1)
            return (last_date - year_start).days
        elif period == "1Y":
            return 365
        elif period == "5Y":
            return 365 * 5
        elif period == "MAX":
            return 999999
        else:
            return 365

    ndays = period_to_days(user_period)
    cutoff = last_date - timedelta(days=ndays)
    df["Date_dt"] = pd.to_datetime(df["Date"])
    sliced = df[df["Date_dt"] >= cutoff].copy()
    sliced.drop(columns=["Date_dt"], inplace=True, errors="ignore")
    if sliced.empty:
        return df
    return sliced


def get_kpi_data(ticker: str):
    stock = yf.Ticker(ticker)
    info = stock.info or {}
    hist = stock.history(period="1d", interval="1d")
    if not hist.empty:
        hist = hist.reset_index()
        open_price = hist["Open"].iloc[-1] if not hist["Open"].empty else None
        previous_close = info.get("previousClose", None)
        day_low = hist["Low"].iloc[-1] if not hist["Low"].empty else None
        day_high = hist["High"].iloc[-1] if not hist["High"].empty else None
    else:
        open_price = None
        previous_close = None
        day_low = None
        day_high = None

    hist_52w = stock.history(period="1y", interval="1d")
    if not hist_52w.empty:
        week_low_52 = hist_52w["Low"].min()
        week_high_52 = hist_52w["High"].max()
        avg_volume = hist_52w["Volume"].mean()
    else:
        week_low_52 = None
        week_high_52 = None
        avg_volume = None

    # Use forwardPE and earningsTimestamp (if available) for additional KPIs.
    forward_pe = info.get("forwardPE", "N/A")
    earnings_ts = info.get("earningsTimestamp", None)
    if earnings_ts:
        try:
            next_earnings = datetime.fromtimestamp(
                earnings_ts).strftime("%Y-%m-%d")
        except Exception:
            next_earnings = str(earnings_ts)
    else:
        next_earnings = "N/A"

    kpi = {
        "companyName": info.get("longName", "N/A"),
        "exchange": info.get("exchange", ""),
        "currency": info.get("currency", ""),
        "peRatio": info.get("trailingPE", "N/A"),
        "forwardPE": forward_pe,
        "nextEarningsDate": next_earnings,
        "weekHigh52": week_high_52,
        "weekLow52": week_low_52,
        "marketCap": info.get("marketCap", "N/A"),
        "beta": info.get("beta", "N/A"),
        "eps": info.get("trailingEps", "N/A"),
        "dividend": info.get("dividendRate", "N/A"),
        "exDividendDate": str(info.get("exDividendDate", "N/A")),
        "openPrice": open_price,
        "previousClose": previous_close,
        "daysRange": f"{day_low:.2f} - {day_high:.2f}" if day_low and day_high else "N/A",
        "weekRange": f"{week_low_52:.2f} - {week_high_52:.2f}" if week_low_52 and week_high_52 else "N/A",
        "avgVolume": avg_volume,
    }
    return kpi


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
        if pd.isna(close.iloc[i]) or pd.isna(close.iloc[i-1]):
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
    if period == "1d":
        data = yf.download(ticker, period="1d", interval="1m")
    else:
        extended_period = get_extended_period(period)
        data = yf.download(ticker, period=extended_period,
                           interval=interval, auto_adjust=False)
    if data.empty:
        raise ValueError(f"No data found for {ticker} in period {period}.")
    data = process_data(data, ticker)
    data.reset_index(inplace=True)
    if "Date" not in data.columns:
        data["Date"] = data.index.astype(str)
    else:
        data["Date"] = data["Date"].astype(str)
    data = data.where(pd.notnull(data), None)
    data = slice_to_requested_period(data, period)
    d = data.to_dict(orient="list")
    d = convert_numpy_types(d)
    return d


def get_technical_indicators(ticker: str, period: str = "1y", interval: str = "1d"):
    data = yf.download(ticker, period=period,
                       interval=interval, auto_adjust=False)
    if data.empty:
        raise ValueError(f"No data found for {ticker} in period {period}.")
    data = process_data(data, ticker)
    data.dropna(subset=["Close"], inplace=True)
    if len(data) < 200:
        raise ValueError(
            f"Not enough data ({len(data)}) to compute a 200-day indicator.")
    data.reset_index(inplace=True)
    if "Date" not in data.columns:
        data["Date"] = data.index.astype(str)
    else:
        data["Date"] = data["Date"].astype(str)
    df = data.copy()
    close = df["Close"].astype(float)
    high = df["High"].astype(float)
    low = df["Low"].astype(float)
    vol = df["Volume"].fillna(0).astype(float)
    df["MA50"] = compute_ma(close, window=50)
    df["MA100"] = compute_ma(close, window=100)
    df["MA150"] = compute_ma(close, window=150)
    df["MA200"] = compute_ma(close, window=200)
    df["RSI"] = compute_rsi(close, window=14)
    ma_line, upper_band, lower_band = compute_bollinger_bands(
        close, window=20, num_std=2)
    df["Bollinger_MA"] = ma_line
    df["Upper_Band"] = upper_band
    df["Lower_Band"] = lower_band
    df["Momentum"] = compute_momentum(close, window=5)
    df["Volatility"] = compute_volatility(close, window=20)
    macd_line, signal_line = compute_macd(close, 12, 26, 9)
    df["MACD"] = macd_line
    df["MACD_Signal"] = signal_line
    df["ATR"] = compute_atr(high, low, close, window=14)
    df["OBV"] = compute_obv(close, vol)
    df = df.where(pd.notnull(df), None)
    d = df.to_dict(orient="list")
    d = convert_numpy_types(d)
    return d


def slice_indicator_data(indicator_data: dict, user_period: str) -> dict:
    df = pd.DataFrame(indicator_data)
    if df.empty:
        return indicator_data
    df = slice_to_requested_period(df, user_period)
    d = df.to_dict(orient="list")
    d = convert_numpy_types(d)
    return d
