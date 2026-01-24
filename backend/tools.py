# backend/tools.py

import time
import random
import json
from pathlib import Path
import pandas as pd
import numpy as np
import yfinance as yf
from yfinance import shared as yf_shared
from yfinance.exceptions import YFRateLimitError
from datetime import datetime, timedelta
from threading import Lock, Condition

STOCK_CACHE_TTL = 180  # seconds
INDICATOR_CACHE_TTL = 600
WATCHLIST_CACHE_TTL = 3600
WATCHLIST_CHUNK = 8
WATCHLIST_INFO_LIMIT = 5
KPI_CACHE_TTL = 900
INFO_CACHE_TTL = 7200
PLACEHOLDER_TTL = 90
SP500_CACHE_TTL = 21600  # 6 hours
SP500_FETCH_CHUNK = 4
SP500_CACHE_PATH = Path(__file__).resolve().parent / "output" / "sp500_cache.json"
SP500_UNIVERSE_PATH = Path(__file__).resolve().parent / "data" / "sp500.csv"
DEFAULT_SP500 = [
    "AAPL", "MSFT", "AMZN", "GOOGL", "GOOG", "META", "NVDA", "BRK-B", "TSLA",
    "JPM", "V", "JNJ", "UNH", "XOM", "PG", "MA", "LLY", "AVGO", "HD", "COST",
    "PEP", "ADBE", "KO", "CSCO", "MRK", "CRM", "BAC", "ABBV", "WMT", "DIS",
]
STOCK_CACHE: dict[tuple[str, str, str], tuple[float, dict]] = {}
INDICATOR_CACHE: dict[tuple[str, str, str], tuple[float, dict]] = {}
WATCHLIST_CACHE: dict[str, tuple[float, dict]] = {}
KPI_CACHE: dict[tuple[str], tuple[float, dict]] = {}
INFO_CACHE: dict[tuple[str], tuple[float, dict]] = {}
STOCK_PLACEHOLDERS: dict[tuple[str, str, str], float] = {}
INDICATOR_PLACEHOLDERS: dict[tuple[str, str, str], float] = {}

_YF_LOCK = Lock()
_LAST_YF_CALL = 0.0
_MIN_CALL_INTERVAL = 4.0
_YF_COOLDOWN_UNTIL = 0.0
_YF_COOLDOWN_SECONDS = 60

INTRADAY_INTERVAL_MAX_DAYS = {
    "1m": 7,
    "2m": 60,
    "5m": 60,
    "15m": 60,
    "30m": 60,
    "60m": 60,
    "90m": 60,
    "1h": 60,
}
INTRADAY_MIN_DAYS = 30

INDEX_TICKER_LABELS = {
    "^GSPC": ("S&P 500", "Index"),
    "^IXIC": ("Nasdaq Composite", "Index"),
    "^DJI": ("Dow Jones Industrial Average", "Index"),
}

# Singleflight queue to coalesce identical Yahoo calls across concurrent requests
_SF_LOCK = Lock()
_SF_WAIT: dict[tuple, dict] = {}

def _sf_keyify(v):
    if isinstance(v, dict):
        return tuple(sorted((k, _sf_keyify(val)) for k, val in v.items()))
    if isinstance(v, (list, tuple, set, frozenset)):
        return tuple(_sf_keyify(x) for x in list(v))
    return v

def _singleflight_run(key: tuple, fn, *args, **kwargs):
    key = _sf_keyify(key)
    with _SF_LOCK:
        entry = _SF_WAIT.get(key)
        if entry is None:
            entry = {"cv": Condition(Lock()), "done": False, "res": None, "err": None}
            _SF_WAIT[key] = entry
            leader = True
        else:
            leader = False
    if leader:
        try:
            res = fn(*args, **kwargs)
            err = None
        except Exception as e:
            res, err = None, e
        finally:
            with entry["cv"]:
                entry["res"], entry["err"], entry["done"] = res, err, True
                entry["cv"].notify_all()
            with _SF_LOCK:
                _SF_WAIT.pop(key, None)
        if err is not None:
            raise err
        return res
    else:
        with entry["cv"]:
            while not entry["done"]:
                entry["cv"].wait()
            if entry["err"] is not None:
                raise entry["err"]
            return entry["res"]
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


def _normalize_interval(interval: str | None) -> str | None:
    if not interval:
        return None
    return interval.lower().strip()


def _start_yf_cooldown(seconds: float = _YF_COOLDOWN_SECONDS):
    global _YF_COOLDOWN_UNTIL
    _YF_COOLDOWN_UNTIL = max(_YF_COOLDOWN_UNTIL, time.time() + seconds)


def get_extended_period(user_period: str, interval: str | None = None) -> str:
    """
    Map user-friendly period (e.g. "5D", "YTD") to an extended period string
    for yfinance. When using intraday intervals, cap the max history to avoid
    oversized requests and Yahoo rate limits.
    """
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
    base_period = mapping.get(user_period, "2y")
    interval = _normalize_interval(interval)
    if interval in INTRADAY_INTERVAL_MAX_DAYS:
        max_days = INTRADAY_INTERVAL_MAX_DAYS[interval]
        desired_days = period_to_days(user_period)
        if desired_days < 0:
            desired_days = max_days
        min_days = min(INTRADAY_MIN_DAYS, max_days)
        desired_days = max(desired_days, min_days)
        desired_days = min(desired_days, max_days)
        return f"{desired_days}d"
    return base_period


def period_to_days(period: str) -> int:
    p = period.upper()
    if p == "1D":
        return 1
    elif p == "5D":
        return 5
    elif p == "1M":
        return 30
    elif p == "6M":
        return 180
    elif p == "YTD":
        return -99999  # special value for YTD; see slice_to_requested_period below
    elif p == "1Y":
        return 365
    elif p == "5Y":
        return 365 * 5
    elif p == "MAX":
        return 999999
    else:
        return 365


def slice_to_requested_period(df: pd.DataFrame, user_period: str) -> pd.DataFrame:
    """
    Slice the DataFrame to the requested period.
    For YTD, slice from Jan 1 of the last date’s year.
    If the slice is empty, return the full DataFrame.
    """
    if df.empty:
        return df
    user_period = user_period.upper()
    last_date = pd.to_datetime(df["Date"].iloc[-1])
    if user_period == "YTD":
        year_start = datetime(last_date.year, 1, 1)
        df["Date_dt"] = pd.to_datetime(df["Date"])
        sliced = df[df["Date_dt"] >= year_start].copy()
        df.drop(columns=["Date_dt"], inplace=True, errors="ignore")
        if sliced.empty:
            return df
        sliced.drop(columns=["Date_dt"], inplace=True, errors="ignore")
        return sliced

    ndays = period_to_days(user_period)
    if ndays == -99999:
        return df

    cutoff = last_date - timedelta(days=ndays)
    df["Date_dt"] = pd.to_datetime(df["Date"])
    sliced = df[df["Date_dt"] >= cutoff].copy()
    sliced.drop(columns=["Date_dt"], inplace=True, errors="ignore")
    if sliced.empty:
        return df
    return sliced


def process_data(data, ticker):
    if isinstance(data.columns, pd.MultiIndex):
        try:
            level_name = None
            for name in data.columns.names:
                if name and name.lower() in ("ticker", "tickers", "symbol", "symbols"):
                    level_name = name
                    break
            if level_name:
                data = data.xs(ticker, level=level_name, axis=1)
            else:
                data = data.xs(ticker, level=-1, axis=1)
        except Exception as e:
            raise ValueError(f"Error extracting ticker {ticker}: {e}")
    return data


def _cache_get(cache: dict, key: tuple, ttl: int | None):
    entry = cache.get(key)
    if not entry:
        return None
    timestamp, value = entry
    if ttl is None or time.time() - timestamp < ttl:
        return value
    return None


def _placeholder_active(store: dict, key: tuple) -> bool:
    ts = store.get(key)
    if not ts:
        return False
    if time.time() - ts < PLACEHOLDER_TTL:
        return True
    store.pop(key, None)
    return False


def _set_placeholder(store: dict, key: tuple):
    store[key] = time.time()


def _cache_set(cache: dict, key: tuple, value: dict):
    cache[key] = (time.time(), value)


def _get_ticker_info(ticker: str) -> dict:
    cache_key = (ticker,)
    cached = _cache_get(INFO_CACHE, cache_key, INFO_CACHE_TTL)
    if cached:
        return cached

    def _load_info():
        return yf.Ticker(ticker).info or {}

    try:
        info = _singleflight_run(("info", ticker), _throttled_call, _load_info)
    except YFRateLimitError:
        _start_yf_cooldown()
        info = {}
    except Exception:
        info = {}
    _cache_set(INFO_CACHE, cache_key, info)
    return info


def _normalize_history_df(data: pd.DataFrame, ticker: str) -> pd.DataFrame:
    data = process_data(data, ticker)
    data = data.copy()
    data.reset_index(inplace=True)
    if "Date" not in data.columns:
        data["Date"] = data.index.astype(str)
    else:
        data["Date"] = data["Date"].astype(str)
    return data


def _stock_payload_from_df(data: pd.DataFrame, period: str) -> dict:
    if data is None or data.empty:
        return _empty_stock_payload()
    sliced = slice_to_requested_period(data.copy(), period)
    d = sliced.to_dict(orient="list")
    d = convert_numpy_types(d)
    return d


def _indicators_from_df(data: pd.DataFrame) -> dict:
    if data is None or data.empty or "Close" not in data.columns:
        return _empty_indicator_payload()

    df = data.copy()
    df.dropna(subset=["Close"], inplace=True)
    if df.empty:
        return _empty_indicator_payload()

    if "Date" not in df.columns:
        df["Date"] = df.index.astype(str)
    else:
        df["Date"] = df["Date"].astype(str)

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
    macd_line, signal_line = compute_macd(
        close, short_window=12, long_window=26, signal_window=9)
    df["MACD"] = macd_line
    df["MACD_Signal"] = signal_line
    df["ATR"] = compute_atr(high, low, close, window=14)
    df["OBV"] = compute_obv(close, vol)
    df = df.where(pd.notnull(df), None)
    d = df.to_dict(orient="list")
    d = convert_numpy_types(d)
    return d


def _throttled_call(fn, *args, **kwargs):
    global _LAST_YF_CALL
    with _YF_LOCK:
        if time.time() < _YF_COOLDOWN_UNTIL:
            raise YFRateLimitError("Yahoo Finance cooldown active.")
        wait = _MIN_CALL_INTERVAL - (time.time() - _LAST_YF_CALL)
        if wait > 0:
            time.sleep(wait + random.uniform(0.05, 0.3))
        try:
            return fn(*args, **kwargs)
        finally:
            _LAST_YF_CALL = time.time()


def _download_prices(*args, retries: int = 5, **kwargs):
    backoff = 1.5
    last_err: Exception | None = None
    if time.time() < _YF_COOLDOWN_UNTIL:
        raise YFRateLimitError("Yahoo Finance cooldown active.")
    for attempt in range(retries):
        try:
            data = _singleflight_run(("yf.download", args, kwargs), _throttled_call, yf.download, *args, **kwargs)
        except Exception as exc:
            last_err = exc
        else:
            if _rate_limit_detected():
                last_err = YFRateLimitError("Yahoo Finance rate limit exceeded.")
                _start_yf_cooldown()
            elif data.empty:
                last_err = ValueError("No data found for request.")
                break
            else:
                return data
        time.sleep(backoff)
        backoff *= 1.5
        if isinstance(last_err, YFRateLimitError):
            _start_yf_cooldown()
    if isinstance(last_err, ValueError):
        raise last_err
    raise last_err or YFRateLimitError("Yahoo Finance rate limit exceeded.")


def _empty_stock_payload():
    return {"Date": [], "Open": [], "High": [], "Low": [], "Close": [], "Volume": []}


def _empty_indicator_payload():
    return {"Date": []}


def _empty_kpi_payload():
    return {
        "companyName": "N/A",
        "exchange": "N/A",
        "currency": "N/A",
        "peRatio": "N/A",
        "forwardPE": "N/A",
        "nextEarningsDate": "N/A",
        "weekHigh52": None,
        "weekLow52": None,
        "marketCap": "N/A",
        "beta": "N/A",
        "eps": "N/A",
        "dividend": "N/A",
        "exDividendDate": "N/A",
        "openPrice": None,
        "previousClose": None,
        "daysRange": "N/A",
        "weekRange": "N/A",
        "avgVolume": None,
    }


def get_stock_bundle(ticker: str, period: str = "1y", interval: str = "1d") -> dict:
    cache_key = (ticker, period, interval)
    cached_stock = _cache_get(STOCK_CACHE, cache_key, STOCK_CACHE_TTL)
    cached_indicators = _cache_get(INDICATOR_CACHE, cache_key, INDICATOR_CACHE_TTL)
    cached_kpi = _cache_get(KPI_CACHE, (ticker,), KPI_CACHE_TTL)
    if cached_stock and cached_indicators and cached_kpi:
        return {
            "stock": cached_stock,
            "indicators": cached_indicators,
            "kpi": cached_kpi,
        }

    stale_stock = _cache_get(STOCK_CACHE, cache_key, None)
    stale_indicators = _cache_get(INDICATOR_CACHE, cache_key, None)
    stale_kpi = _cache_get(KPI_CACHE, (ticker,), None)

    if _placeholder_active(STOCK_PLACEHOLDERS, cache_key):
        return {
            "stock": stale_stock or _empty_stock_payload(),
            "indicators": stale_indicators or _empty_indicator_payload(),
            "kpi": stale_kpi or _empty_kpi_payload(),
        }

    extended_period = get_extended_period(period, interval)
    try:
        data = _download_prices(
            ticker, period=extended_period, interval=interval, auto_adjust=False
        )
    except (YFRateLimitError, ValueError):
        _set_placeholder(STOCK_PLACEHOLDERS, cache_key)
        return {
            "stock": stale_stock or _empty_stock_payload(),
            "indicators": stale_indicators or _empty_indicator_payload(),
            "kpi": stale_kpi or _empty_kpi_payload(),
        }

    data = _normalize_history_df(data, ticker)
    stock_payload = _stock_payload_from_df(data, period)
    indicator_payload = _indicators_from_df(data)
    indicator_payload = slice_indicator_data(indicator_payload, period)
    kpi_payload = get_kpi_data(ticker, history=data)

    _cache_set(STOCK_CACHE, cache_key, stock_payload)
    _cache_set(INDICATOR_CACHE, cache_key, indicator_payload)
    _cache_set(KPI_CACHE, (ticker,), kpi_payload)

    return {
        "stock": stock_payload,
        "indicators": indicator_payload,
        "kpi": kpi_payload,
    }

def get_stock_data(ticker: str, period: str = "1y", interval: str = "1d"):
    extended_period = get_extended_period(period, interval)
    cache_key = (ticker, period, interval)
    if _placeholder_active(STOCK_PLACEHOLDERS, cache_key):
        return _empty_stock_payload()
    cached = _cache_get(STOCK_CACHE, cache_key, STOCK_CACHE_TTL)
    if cached:
        return cached
    stale = _cache_get(STOCK_CACHE, cache_key, None)
    try:
        data = _download_prices(
            ticker, period=extended_period, interval=interval, auto_adjust=False
        )
    except (YFRateLimitError, ValueError):
        if stale:
            return stale
        _set_placeholder(STOCK_PLACEHOLDERS, cache_key)
        return _empty_stock_payload()
    data = _normalize_history_df(data, ticker)
    payload = _stock_payload_from_df(data, period)
    _cache_set(STOCK_CACHE, cache_key, payload)
    return payload


def get_kpi_data(ticker: str, history: pd.DataFrame | None = None):
    cache_key = (ticker,)
    cached = _cache_get(KPI_CACHE, cache_key, KPI_CACHE_TTL)
    if cached:
        return cached

    info = _get_ticker_info(ticker)

    open_price = None
    previous_close = info.get("previousClose", None)
    day_low = None
    day_high = None
    week_low_52 = None
    week_high_52 = None
    avg_volume = None

    if history is not None and not history.empty:
        hist = history.copy()
        if "Date" not in hist.columns:
            hist["Date"] = hist.index.astype(str)
        date_series = pd.to_datetime(hist["Date"], errors="coerce")
        if date_series.notna().any():
            latest_idx = date_series.idxmax()
        else:
            latest_idx = hist.index[-1]
        latest = hist.loc[latest_idx]
        open_price = _safe_price(latest.get("Open"))
        day_low = _safe_price(latest.get("Low"))
        day_high = _safe_price(latest.get("High"))

        if date_series.notna().any():
            cutoff = date_series.max() - timedelta(days=365)
            hist_52w = hist[date_series >= cutoff]
        else:
            hist_52w = hist

        if not hist_52w.empty:
            week_low_52 = _safe_price(hist_52w["Low"].min())
            week_high_52 = _safe_price(hist_52w["High"].max())
            avg_volume = _safe_price(hist_52w["Volume"].mean())
    else:
        stock = yf.Ticker(ticker)
        hist = _singleflight_run(("history-1d", ticker), _throttled_call, stock.history, period="1d", interval="1d")
        if not hist.empty:
            hist = hist.reset_index()
            open_price = _safe_price(hist["Open"].iloc[-1]) if not hist["Open"].empty else None
            day_low = _safe_price(hist["Low"].iloc[-1]) if not hist["Low"].empty else None
            day_high = _safe_price(hist["High"].iloc[-1]) if not hist["High"].empty else None

        hist_52w = _singleflight_run(("history-1y", ticker), _throttled_call, stock.history, period="1y", interval="1d")
        if not hist_52w.empty:
            week_low_52 = _safe_price(hist_52w["Low"].min())
            week_high_52 = _safe_price(hist_52w["High"].max())
            avg_volume = _safe_price(hist_52w["Volume"].mean())

    forward_pe = info.get("forwardPE", "N/A")
    market_cap = info.get("marketCap", "N/A")
    free_cash_flow = info.get("freeCashflow", None)
    operating_cash_flow = info.get("operatingCashflow", None)
    total_cash = info.get("totalCash", None)
    total_debt = info.get("totalDebt", None)
    total_revenue = info.get("totalRevenue", None)
    ebitda = info.get("ebitda", None)
    gross_margin = info.get("grossMargins", None)
    operating_margin = info.get("operatingMargins", None)
    profit_margin = info.get("profitMargins", None)
    roe = info.get("returnOnEquity", None)
    roa = info.get("returnOnAssets", None)
    current_ratio = info.get("currentRatio", None)
    equity = info.get("totalStockholderEquity", None)
    debt_to_equity = None
    if isinstance(total_debt, (int, float)) and isinstance(equity, (int, float)) and equity:
        debt_to_equity = total_debt / equity
    fcf_yield = None
    if isinstance(free_cash_flow, (int, float)) and isinstance(market_cap, (int, float)) and market_cap:
        fcf_yield = free_cash_flow / market_cap
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
        "marketCap": market_cap,
        "beta": info.get("beta", "N/A"),
        "eps": info.get("trailingEps", "N/A"),
        "dividend": info.get("dividendRate", "N/A"),
        "exDividendDate": str(info.get("exDividendDate", "N/A")),
        "openPrice": open_price,
        "previousClose": previous_close,
        "daysRange": f"{day_low:.2f} - {day_high:.2f}" if (day_low and day_high) else "N/A",
        "weekRange": f"{week_low_52:.2f} - {week_high_52:.2f}" if (week_low_52 and week_high_52) else "N/A",
        "avgVolume": avg_volume,
        "freeCashflow": free_cash_flow,
        "operatingCashflow": operating_cash_flow,
        "totalCash": total_cash,
        "totalDebt": total_debt,
        "debtToEquity": debt_to_equity,
        "totalRevenue": total_revenue,
        "ebitda": ebitda,
        "grossMargin": gross_margin,
        "operatingMargin": operating_margin,
        "profitMargin": profit_margin,
        "returnOnEquity": roe,
        "returnOnAssets": roa,
        "currentRatio": current_ratio,
        "fcfYield": fcf_yield,
    }
    _cache_set(KPI_CACHE, cache_key, kpi)
    return kpi


def compute_ma(prices, window):
    return prices.rolling(window=window).mean()


def compute_ema(prices, window):
    return prices.ewm(span=window, adjust=False).mean()


def compute_rsi(prices, window=14):
    delta = prices.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=window, min_periods=1).mean()
    avg_loss = loss.rolling(window=window, min_periods=1).mean()
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
        if close.iloc[i] > close.iloc[i-1]:
            obv.append(obv[-1] + (volume.iloc[i] if volume.iloc[i] else 0))
        elif close.iloc[i] < close.iloc[i-1]:
            obv.append(obv[-1] - (volume.iloc[i] if volume.iloc[i] else 0))
        else:
            obv.append(obv[-1])
    return pd.Series(obv, index=close.index)


def get_technical_indicators(
    ticker: str,
    period: str = "1y",
    interval: str = "1d",
    data: pd.DataFrame | None = None,
):
    cache_key = (ticker, period, interval)
    if _placeholder_active(INDICATOR_PLACEHOLDERS, cache_key):
        return _empty_indicator_payload()
    cached = _cache_get(INDICATOR_CACHE, cache_key, INDICATOR_CACHE_TTL)
    if cached:
        return cached
    stale = _cache_get(INDICATOR_CACHE, cache_key, None)
    if data is None:
        try:
            extended_period = get_extended_period(period, interval)
            data = _download_prices(
                ticker, period=extended_period, interval=interval, auto_adjust=False
            )
        except (YFRateLimitError, ValueError):
            if stale:
                return stale
            _set_placeholder(INDICATOR_PLACEHOLDERS, cache_key)
            return _empty_indicator_payload()
        data = _normalize_history_df(data, ticker)

    payload = _indicators_from_df(data)
    _cache_set(INDICATOR_CACHE, cache_key, payload)
    return payload


def slice_indicator_data(indicator_data: dict, user_period: str) -> dict:
    df = pd.DataFrame(indicator_data)
    if df.empty:
        return indicator_data
    df = slice_to_requested_period(df, user_period)
    d = df.to_dict(orient="list")
    d = convert_numpy_types(d)
    return d


def _safe_price(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _default_watchlist_payload():
    return {
        "companyName": "Unknown",
        "exchange": "",
        "currentPrice": 0.0,
        "dailyChange": 0.0,
        "dailyPct": 0.0,
        "ytdChange": 0.0,
        "ytdPct": 0.0,
    }


def _compute_watchlist_payload(df: pd.DataFrame) -> dict:
    if df is None or df.empty or "Close" not in df.columns:
        return _default_watchlist_payload()

    df = df.dropna(subset=["Close"])
    if df.empty:
        return _default_watchlist_payload()

    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else latest
    ytd_row = df.iloc[0]

    current_price = _safe_price(latest.get("Close"))
    prev_close = _safe_price(prev.get("Close")) or current_price
    ytd_price = _safe_price(ytd_row.get("Close")) or current_price

    if current_price is None:
        return _default_watchlist_payload()

    daily_change = current_price - (prev_close or 0.0)
    daily_pct = (daily_change / prev_close * 100.0) if prev_close else 0.0
    ytd_change = current_price - (ytd_price or 0.0)
    ytd_pct = (ytd_change / ytd_price * 100.0) if ytd_price else 0.0

    return {
        "companyName": "Unknown",
        "exchange": "",
        "currentPrice": current_price,
        "dailyChange": daily_change,
        "dailyPct": daily_pct,
        "ytdChange": ytd_change,
        "ytdPct": ytd_pct,
    }


def _info_snapshot_for_watchlist(ticker: str) -> tuple[str | None, str | None]:
    if ticker in INDEX_TICKER_LABELS:
        return INDEX_TICKER_LABELS[ticker]
    cached = _cache_get(INFO_CACHE, (ticker,), INFO_CACHE_TTL)
    if cached:
        name = cached.get("shortName") or cached.get("longName") or cached.get("displayName")
        exchange = cached.get("fullExchangeName") or cached.get("exchange")
    else:
        name = None
        exchange = None
    if ticker.startswith("^") and not exchange:
        exchange = "Index"
    return name, exchange


def get_watchlist_batch(tickers: list[str]) -> dict:
    """
    Fetch watchlist metrics while batching downloads, caching recent responses,
    and degrading gracefully on rate limits.
    """
    clean = [t.strip().upper() for t in tickers if t and t.strip()]
    if not clean:
        return {}

    now = time.time()
    results: dict[str, dict] = {}
    missing: list[str] = []

    for t in clean:
        cached = WATCHLIST_CACHE.get(t)
        if cached and now - cached[0] < WATCHLIST_CACHE_TTL:
            results[t] = cached[1]
        else:
            missing.append(t)

    info_budget = WATCHLIST_INFO_LIMIT

    for i in range(0, len(missing), WATCHLIST_CHUNK):
        chunk = missing[i: i + WATCHLIST_CHUNK]
        if not chunk:
            continue
        try:
            chunk_payload = _download_watchlist_chunk(chunk)
        except (YFRateLimitError, ValueError):
            chunk_payload = {}
            for ticker in chunk:
                cached_entry = WATCHLIST_CACHE.get(ticker)
                if cached_entry:
                    chunk_payload[ticker] = cached_entry[1]
                else:
                    chunk_payload[ticker] = _default_watchlist_payload()
        for ticker, payload in chunk_payload.items():
            if info_budget > 0 and (not payload.get("companyName") or payload.get("companyName") == ticker):
                try:
                    info = _get_ticker_info(ticker)
                    payload["companyName"] = info.get("shortName") or info.get("longName") or payload.get("companyName")
                    payload["exchange"] = info.get("exchange") or info.get("fullExchangeName") or payload.get("exchange")
                    info_budget -= 1
                except Exception:
                    pass
            results[ticker] = payload
            WATCHLIST_CACHE[ticker] = (time.time(), payload)
        time.sleep(2.5)

    for t in clean:
        results.setdefault(t, _default_watchlist_payload())

    return results


def _download_watchlist_chunk(tickers: list[str]) -> dict[str, dict]:
    if not tickers:
        return {}
    try:
        hist = _download_prices(
            tickers,
            period="7d",
            interval="1d",
            auto_adjust=False,
            group_by="ticker",
            threads=False,
        )
    except (YFRateLimitError, ValueError):
        fallback = {}
        for t in tickers:
            name, exchange = _info_snapshot_for_watchlist(t)
            fallback[t] = _default_watchlist_payload() | {
                "companyName": name or t,
                "exchange": exchange or "",
            }
        return fallback

    if isinstance(hist, pd.Series):
        hist = hist.to_frame().T

    chunk_results = {}
    for ticker in tickers:
        try:
            subset = process_data(hist.copy(), ticker)
        except Exception:
            subset = pd.DataFrame()
        payload = _compute_watchlist_payload(subset)
        name, exchange = _info_snapshot_for_watchlist(ticker)
        payload["companyName"] = name or payload.get("companyName") or ticker
        payload["exchange"] = exchange or payload.get("exchange") or ""
        chunk_results[ticker] = payload
    return chunk_results


def _rate_limit_detected() -> bool:
    """
    Inspect yfinance's shared error log to see if the last download was
    rate-limited. yfinance swallows some YFRateLimitError exceptions and only
    records them in shared._ERRORS, so we surface that here.
    """
    errors = getattr(yf_shared, "_ERRORS", None)
    if not errors:
        return False
    for err in list(errors):
        if isinstance(err, dict):
            msg = err.get("error") or err.get("message") or ""
        else:
            msg = str(err)
        msg = (msg or "").lower()
        if "rate limit" in msg or "too many requests" in msg:
            try:
                errors.clear()
            except Exception:
                pass
            return True
    return False


# Public helper to download prices with throttling + singleflight + retries
def download_prices(tickers, period: str, interval: str, **kwargs):
    return _download_prices(tickers, period=period, interval=interval, **kwargs)


def _load_sp500_universe() -> list[str]:
    if SP500_UNIVERSE_PATH.exists():
        try:
            rows = SP500_UNIVERSE_PATH.read_text().splitlines()
            tickers = []
            for row in rows:
                if not row.strip():
                    continue
                if row.lower().startswith("ticker"):
                    continue
                parts = [p.strip() for p in row.split(",")]
                if parts and parts[0]:
                    tickers.append(parts[0].upper())
            if tickers:
                return tickers
        except Exception:
            pass
    return DEFAULT_SP500


def _load_sp500_cache() -> dict:
    if SP500_CACHE_PATH.exists():
        try:
            return json.loads(SP500_CACHE_PATH.read_text())
        except Exception:
            pass
    return {"ts": 0, "data": {}}


def _save_sp500_cache(cache: dict):
    try:
        SP500_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        SP500_CACHE_PATH.write_text(json.dumps(cache))
    except Exception:
        pass


def _extract_investor_metrics(info: dict) -> dict:
    market_cap = info.get("marketCap")
    free_cf = info.get("freeCashflow")
    op_cf = info.get("operatingCashflow")
    total_cash = info.get("totalCash")
    total_debt = info.get("totalDebt")
    equity = info.get("totalStockholderEquity")
    revenue = info.get("totalRevenue")
    ebitda = info.get("ebitda")
    gross_margin = info.get("grossMargins")
    operating_margin = info.get("operatingMargins")
    profit_margin = info.get("profitMargins")
    roe = info.get("returnOnEquity")
    roa = info.get("returnOnAssets")
    current_ratio = info.get("currentRatio")
    debt_to_equity = None
    if isinstance(total_debt, (int, float)) and isinstance(equity, (int, float)) and equity:
        debt_to_equity = total_debt / equity
    fcf_yield = None
    if isinstance(free_cf, (int, float)) and isinstance(market_cap, (int, float)) and market_cap:
        fcf_yield = free_cf / market_cap
    return {
        "companyName": info.get("shortName") or info.get("longName") or info.get("displayName") or "Unknown",
        "exchange": info.get("exchange") or info.get("fullExchangeName") or "",
        "sector": info.get("sector") or "",
        "industry": info.get("industry") or "",
        "marketCap": market_cap,
        "freeCashflow": free_cf,
        "operatingCashflow": op_cf,
        "totalCash": total_cash,
        "totalDebt": total_debt,
        "debtToEquity": debt_to_equity,
        "totalRevenue": revenue,
        "ebitda": ebitda,
        "grossMargin": gross_margin,
        "operatingMargin": operating_margin,
        "profitMargin": profit_margin,
        "returnOnEquity": roe,
        "returnOnAssets": roa,
        "currentRatio": current_ratio,
        "fcfYield": fcf_yield,
        "trailingPE": info.get("trailingPE"),
        "forwardPE": info.get("forwardPE"),
        "priceToBook": info.get("priceToBook"),
    }


def get_sp500_screener(metric: str = "freeCashflow", order: str = "desc", limit: int = 20, refresh: bool = False) -> dict:
    metric = (metric or "freeCashflow").strip()
    order = (order or "desc").lower()
    limit = max(5, min(int(limit or 20), 100))

    universe = _load_sp500_universe()
    cache = _load_sp500_cache()
    data = cache.get("data") or {}
    if refresh:
        cache["ts"] = 0

    missing = [t for t in universe if t not in data]
    fetch_count = min(len(missing), SP500_FETCH_CHUNK)
    for ticker in missing[:fetch_count]:
        try:
            info = _get_ticker_info(ticker)
            data[ticker] = _extract_investor_metrics(info)
        except Exception:
            data[ticker] = _extract_investor_metrics({})

    cache["data"] = data
    cache["ts"] = time.time()
    _save_sp500_cache(cache)

    rows = []
    for ticker, metrics in data.items():
        value = metrics.get(metric)
        if value is None:
            continue
        rows.append({
            "ticker": ticker,
            "metricValue": value,
            **metrics,
        })

    rows.sort(key=lambda r: (r["metricValue"] is None, r["metricValue"]), reverse=(order != "asc"))
    rows = rows[:limit]

    remaining = max(len(universe) - len(data), 0)
    return {
        "metric": metric,
        "order": order,
        "limit": limit,
        "rows": rows,
        "complete": remaining == 0,
        "remaining": remaining,
        "universeSize": len(universe),
    }
