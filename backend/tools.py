# backend/tools.py

import time
import random
import json
from pathlib import Path
import pandas as pd
import numpy as np
import yfinance as yf
import requests
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
SP500_UNIVERSE_CACHE_PATH = Path(__file__).resolve().parent / "output" / "sp500_universe.json"
SP500_UNIVERSE_TTL = 86400  # 24 hours
WATCHLIST_CACHE_PATH = Path(__file__).resolve().parent / "output" / "watchlist_cache.json"
YF_STATE_PATH = Path(__file__).resolve().parent / "output" / "yf_state.json"
BUNDLE_CACHE_PATH = Path(__file__).resolve().parent / "output" / "bundle_cache.json"
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
_YF_COOLDOWN_SECONDS = 300

_WATCHLIST_CACHE_LOADED = False
_COOLDOWN_STATE_LOADED = False
_BUNDLE_CACHE_LOADED = False

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

SPARKLINE_PERIOD = "1y"
SPARKLINE_INTERVAL = "1wk"
SPARKLINE_POINTS = 52
SPARKLINE_PROFILES = {
    "1Y": {"period": "1y", "interval": "1wk", "points": 52},
    "6M": {"period": "6mo", "interval": "1wk", "points": 26},
    "1M": {"period": "1mo", "interval": "1d", "points": 22},
}
DEFAULT_SPARKLINE_PROFILE = "1Y"

# Singleflight queue to coalesce identical Yahoo calls across concurrent requests
_SF_LOCK = Lock()
_SF_WAIT: dict[tuple, dict] = {}

def _sf_keyify(v):
    if isinstance(v, dict):
        return tuple(sorted((k, _sf_keyify(val)) for k, val in v.items()))
    if isinstance(v, (list, tuple, set, frozenset)):
        return tuple(_sf_keyify(x) for x in list(v))
    return v


def _normalize_sparkline_period(value: str | None) -> str:
    if not value:
        return DEFAULT_SPARKLINE_PROFILE
    key = str(value).strip().upper().replace(" ", "")
    if key in SPARKLINE_PROFILES:
        return key
    if key in {"6MO", "6MON", "6M"}:
        return "6M"
    if key in {"1MO", "1MON", "1M"}:
        return "1M"
    if key in {"1YR", "1Y"}:
        return "1Y"
    return DEFAULT_SPARKLINE_PROFILE

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

def _cooldown_active() -> bool:
    if not _COOLDOWN_STATE_LOADED:
        _load_yf_cooldown_state()
    return time.time() < _YF_COOLDOWN_UNTIL


def _rate_limit_error(message: str | None = None) -> YFRateLimitError:
    """Create a YFRateLimitError without passing args (yfinance expects none)."""
    err = YFRateLimitError()
    if message:
        # Populate args for logging/debugging without breaking yfinance's init.
        err.args = (message,)
    return err


def _start_yf_cooldown(seconds: float = _YF_COOLDOWN_SECONDS):
    global _YF_COOLDOWN_UNTIL, _COOLDOWN_STATE_LOADED
    _YF_COOLDOWN_UNTIL = max(_YF_COOLDOWN_UNTIL, time.time() + seconds)
    _COOLDOWN_STATE_LOADED = True
    _persist_yf_cooldown_state()


def _cooldown_remaining_seconds() -> int:
    if not _cooldown_active():
        return 0
    return max(0, int(_YF_COOLDOWN_UNTIL - time.time()))


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


def _bundle_cache_key(ticker: str, period: str, interval: str) -> str:
    return f"{ticker}|{period}|{interval}"


def _ensure_bundle_cache_loaded():
    global _BUNDLE_CACHE_LOADED
    if _BUNDLE_CACHE_LOADED:
        return
    _BUNDLE_CACHE_LOADED = True
    try:
        if not BUNDLE_CACHE_PATH.exists():
            return
        payload = json.loads(BUNDLE_CACHE_PATH.read_text())
        stock_items = payload.get("stock", {})
        indicator_items = payload.get("indicators", {})
        kpi_items = payload.get("kpi", {})
        for key, entry in stock_items.items():
            ts = float(entry.get("ts", 0))
            data = entry.get("payload") or {}
            if ts > 0 and isinstance(data, dict):
                parts = key.split("|")
                if len(parts) == 3:
                    STOCK_CACHE[(parts[0], parts[1], parts[2])] = (ts, data)
        for key, entry in indicator_items.items():
            ts = float(entry.get("ts", 0))
            data = entry.get("payload") or {}
            if ts > 0 and isinstance(data, dict):
                parts = key.split("|")
                if len(parts) == 3:
                    INDICATOR_CACHE[(parts[0], parts[1], parts[2])] = (ts, data)
        for key, entry in kpi_items.items():
            ts = float(entry.get("ts", 0))
            data = entry.get("payload") or {}
            if ts > 0 and isinstance(data, dict):
                KPI_CACHE[(key,)] = (ts, data)
    except Exception:
        pass


def _persist_bundle_cache():
    try:
        BUNDLE_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "stock": {
                _bundle_cache_key(key[0], key[1], key[2]): {"ts": ts, "payload": data}
                for key, (ts, data) in STOCK_CACHE.items()
            },
            "indicators": {
                _bundle_cache_key(key[0], key[1], key[2]): {"ts": ts, "payload": data}
                for key, (ts, data) in INDICATOR_CACHE.items()
            },
            "kpi": {key[0]: {"ts": ts, "payload": data} for key, (ts, data) in KPI_CACHE.items()},
        }
        BUNDLE_CACHE_PATH.write_text(json.dumps(payload))
    except Exception:
        pass


def _load_yf_cooldown_state():
    global _YF_COOLDOWN_UNTIL, _COOLDOWN_STATE_LOADED
    _COOLDOWN_STATE_LOADED = True
    try:
        if not YF_STATE_PATH.exists():
            return
        payload = json.loads(YF_STATE_PATH.read_text())
        cooldown_until = float(payload.get("cooldown_until", 0))
        if cooldown_until > time.time():
            _YF_COOLDOWN_UNTIL = cooldown_until
    except Exception:
        pass


def _persist_yf_cooldown_state():
    try:
        YF_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        YF_STATE_PATH.write_text(json.dumps({"cooldown_until": _YF_COOLDOWN_UNTIL}))
    except Exception:
        pass


def _ensure_watchlist_cache_loaded():
    global _WATCHLIST_CACHE_LOADED
    if _WATCHLIST_CACHE_LOADED:
        return
    _WATCHLIST_CACHE_LOADED = True
    try:
        if not WATCHLIST_CACHE_PATH.exists():
            return
        payload = json.loads(WATCHLIST_CACHE_PATH.read_text())
        items = payload.get("items", {})
        for ticker, entry in items.items():
            ts = float(entry.get("ts", 0))
            data = entry.get("payload") or {}
            if ticker and isinstance(data, dict) and ts > 0:
                WATCHLIST_CACHE[str(ticker).upper()] = (ts, data)
    except Exception:
        pass


def _persist_watchlist_cache():
    try:
        WATCHLIST_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "items": {
                ticker: {"ts": ts, "payload": data}
                for ticker, (ts, data) in WATCHLIST_CACHE.items()
            }
        }
        WATCHLIST_CACHE_PATH.write_text(json.dumps(payload))
    except Exception:
        pass


def _get_ticker_info(ticker: str) -> dict:
    cache_key = (ticker,)
    cached = _cache_get(INFO_CACHE, cache_key, INFO_CACHE_TTL)
    if cached:
        return cached

    def _load_info():
        return yf.Ticker(ticker).info or {}

    if _cooldown_active():
        cached = _cache_get(INFO_CACHE, cache_key, INFO_CACHE_TTL)
        return cached or {}
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
        if _cooldown_active():
            raise _rate_limit_error("Yahoo Finance cooldown active.")
        wait = _MIN_CALL_INTERVAL - (time.time() - _LAST_YF_CALL)
        if wait > 0:
            time.sleep(wait + random.uniform(0.05, 0.3))
        try:
            return fn(*args, **kwargs)
        finally:
            _LAST_YF_CALL = time.time()
            if hasattr(yf_shared, "_ERRORS"):
                try:
                    yf_shared._ERRORS.clear()
                except Exception:
                    pass


def _download_prices(*args, retries: int = 5, **kwargs):
    backoff = 1.5
    last_err: Exception | None = None
    if "auto_adjust" not in kwargs:
        kwargs["auto_adjust"] = False
    if "progress" not in kwargs:
        kwargs["progress"] = False
    if _cooldown_active():
        raise _rate_limit_error("Yahoo Finance cooldown active.")
    for attempt in range(retries):
        try:
            data = _singleflight_run(("yf.download", args, kwargs), _throttled_call, yf.download, *args, **kwargs)
        except YFRateLimitError as exc:
            last_err = exc
            _start_yf_cooldown()
        except Exception as exc:
            last_err = exc
        else:
            if _rate_limit_detected():
                last_err = _rate_limit_error("Yahoo Finance rate limit exceeded.")
                _start_yf_cooldown()
            elif data.empty:
                last_err = ValueError("No data found for request.")
                break
            else:
                if hasattr(yf_shared, "_ERRORS"):
                    try:
                        yf_shared._ERRORS.clear()
                    except Exception:
                        pass
                return data
        time.sleep(backoff)
        backoff *= 1.5
        if isinstance(last_err, YFRateLimitError):
            _start_yf_cooldown()
    if isinstance(last_err, ValueError):
        raise last_err
    raise last_err or _rate_limit_error("Yahoo Finance rate limit exceeded.")


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
    _ensure_bundle_cache_loaded()
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
    _persist_bundle_cache()

    return {
        "stock": stock_payload,
        "indicators": indicator_payload,
        "kpi": kpi_payload,
    }

def get_stock_data(ticker: str, period: str = "1y", interval: str = "1d"):
    _ensure_bundle_cache_loaded()
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
    _persist_bundle_cache()
    return payload


def get_kpi_data(ticker: str, history: pd.DataFrame | None = None):
    _ensure_bundle_cache_loaded()
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
        hist = _singleflight_run(
            ("history-1d", ticker),
            _throttled_call,
            stock.history,
            period="1d",
            interval="1d",
            auto_adjust=False,
        )
        if not hist.empty:
            hist = hist.reset_index()
            open_price = _safe_price(hist["Open"].iloc[-1]) if not hist["Open"].empty else None
            day_low = _safe_price(hist["Low"].iloc[-1]) if not hist["Low"].empty else None
            day_high = _safe_price(hist["High"].iloc[-1]) if not hist["High"].empty else None

        hist_52w = _singleflight_run(
            ("history-1y", ticker),
            _throttled_call,
            stock.history,
            period="1y",
            interval="1d",
            auto_adjust=False,
        )
        if not hist_52w.empty:
            week_low_52 = _safe_price(hist_52w["Low"].min())
            week_high_52 = _safe_price(hist_52w["High"].max())
            avg_volume = _safe_price(hist_52w["Volume"].mean())

    forward_pe = info.get("forwardPE", "N/A")
    current_price = info.get("currentPrice") or info.get("regularMarketPrice") or previous_close or open_price
    shares_outstanding = info.get("sharesOutstanding", None)
    market_cap = info.get("marketCap", None)
    if market_cap is None and isinstance(current_price, (int, float)) and isinstance(shares_outstanding, (int, float)):
        market_cap = current_price * shares_outstanding
    free_cash_flow = info.get("freeCashflow", None)
    operating_cash_flow = info.get("operatingCashflow", None)
    total_cash = info.get("totalCash", None)
    total_debt = info.get("totalDebt", None)
    total_revenue = info.get("totalRevenue", None)
    ebitda = info.get("ebitda", None)
    ebit = info.get("ebit") or info.get("operatingIncome", None)
    interest_expense = info.get("interestExpense", None)
    interest_paid = info.get("interestPaid", None)
    net_income = info.get("netIncomeToCommon", None) or info.get("netIncome", None)
    capex = info.get("capitalExpenditures", None)
    preferred_equity = info.get("preferredStock", None) or info.get("preferredStockAndOtherAdjustments", None)
    minority_interest = info.get("minorityInterest", None)
    enterprise_value = info.get("enterpriseValue", None)
    price_to_sales = info.get("priceToSalesTrailing12Months", None) or info.get("priceToSales", None)
    price_to_book = info.get("priceToBook", None)
    peg_ratio = info.get("pegRatio", None)
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
    capex_abs = None
    if isinstance(capex, (int, float)):
        capex_abs = abs(capex)
    if free_cash_flow is None and isinstance(operating_cash_flow, (int, float)) and isinstance(capex_abs, (int, float)):
        free_cash_flow = operating_cash_flow - capex_abs
    fcf_yield = None
    if isinstance(free_cash_flow, (int, float)) and isinstance(market_cap, (int, float)) and market_cap:
        fcf_yield = free_cash_flow / market_cap
    fcf_margin = None
    if isinstance(free_cash_flow, (int, float)) and isinstance(total_revenue, (int, float)) and total_revenue:
        fcf_margin = free_cash_flow / total_revenue
    capex_to_revenue = None
    if isinstance(capex, (int, float)) and isinstance(total_revenue, (int, float)) and total_revenue:
        capex_to_revenue = capex / total_revenue
    fcf_to_capex = None
    if isinstance(free_cash_flow, (int, float)) and isinstance(capex_abs, (int, float)) and capex_abs:
        fcf_to_capex = free_cash_flow / capex_abs
    net_debt = None
    if isinstance(total_debt, (int, float)) and isinstance(total_cash, (int, float)):
        net_debt = total_debt - total_cash
    if enterprise_value is None:
        if isinstance(market_cap, (int, float)) and isinstance(total_debt, (int, float)):
            cash_component = total_cash if isinstance(total_cash, (int, float)) else 0
            pref_component = preferred_equity if isinstance(preferred_equity, (int, float)) else 0
            minority_component = minority_interest if isinstance(minority_interest, (int, float)) else 0
            enterprise_value = market_cap + total_debt + pref_component + minority_component - cash_component
    ev_to_ebitda = info.get("enterpriseToEbitda", None)
    if ev_to_ebitda is None and isinstance(enterprise_value, (int, float)) and isinstance(ebitda, (int, float)) and ebitda:
        ev_to_ebitda = enterprise_value / ebitda
    net_debt_to_ebitda = None
    if isinstance(net_debt, (int, float)) and isinstance(ebitda, (int, float)) and ebitda:
        net_debt_to_ebitda = net_debt / ebitda
    fcf_per_share = None
    if isinstance(free_cash_flow, (int, float)) and isinstance(shares_outstanding, (int, float)) and shares_outstanding:
        fcf_per_share = free_cash_flow / shares_outstanding
    p_to_fcf = None
    if isinstance(free_cash_flow, (int, float)) and free_cash_flow > 0 and isinstance(market_cap, (int, float)):
        p_to_fcf = market_cap / free_cash_flow
    p_to_fcf_per_share = None
    if isinstance(fcf_per_share, (int, float)) and fcf_per_share > 0 and isinstance(current_price, (int, float)):
        p_to_fcf_per_share = current_price / fcf_per_share
    ev_to_fcf = None
    if isinstance(free_cash_flow, (int, float)) and free_cash_flow > 0 and isinstance(enterprise_value, (int, float)):
        ev_to_fcf = enterprise_value / free_cash_flow
    interest_coverage_ebit = None
    if isinstance(ebit, (int, float)) and isinstance(interest_expense, (int, float)) and interest_expense:
        interest_coverage_ebit = ebit / abs(interest_expense)
    interest_coverage_cash = None
    if isinstance(operating_cash_flow, (int, float)) and isinstance(interest_paid, (int, float)) and interest_paid:
        interest_coverage_cash = operating_cash_flow / abs(interest_paid)
    fcf_conversion = None
    if isinstance(free_cash_flow, (int, float)) and isinstance(net_income, (int, float)) and net_income:
        fcf_conversion = free_cash_flow / net_income
    fcf_conversion_ebit = None
    if isinstance(free_cash_flow, (int, float)) and isinstance(ebit, (int, float)) and ebit:
        fcf_conversion_ebit = free_cash_flow / ebit
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
        "sharesOutstanding": shares_outstanding,
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
        "capitalExpenditures": capex,
        "enterpriseValue": enterprise_value,
        "evToEbitda": ev_to_ebitda,
        "priceToSales": price_to_sales,
        "priceToBook": price_to_book,
        "pegRatio": peg_ratio,
        "grossMargin": gross_margin,
        "operatingMargin": operating_margin,
        "profitMargin": profit_margin,
        "returnOnEquity": roe,
        "returnOnAssets": roa,
        "currentRatio": current_ratio,
        "fcfYield": fcf_yield,
        "fcfMargin": fcf_margin,
        "capexToRevenue": capex_to_revenue,
        "fcfToCapex": fcf_to_capex,
        "netDebt": net_debt,
        "netDebtToEbitda": net_debt_to_ebitda,
        "fcfPerShare": fcf_per_share,
        "priceToFcf": p_to_fcf,
        "priceToFcfPerShare": p_to_fcf_per_share,
        "evToFcf": ev_to_fcf,
        "interestCoverageEbit": interest_coverage_ebit,
        "interestCoverageCash": interest_coverage_cash,
        "fcfConversion": fcf_conversion,
        "fcfConversionEbit": fcf_conversion_ebit,
    }
    _cache_set(KPI_CACHE, cache_key, kpi)
    _persist_bundle_cache()
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
    _ensure_bundle_cache_loaded()
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
    _persist_bundle_cache()
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
        "sparkline": [],
    }


def _sparkline_from_df(df: pd.DataFrame, max_points: int = SPARKLINE_POINTS) -> list[float]:
    if df is None or df.empty or "Close" not in df.columns:
        return []
    series = df["Close"].dropna().astype(float).tolist()
    if not series:
        return []
    if max_points and len(series) > max_points:
        series = series[-max_points:]
    return [float(v) for v in series]


def _download_watchlist_sparklines(
    tickers: list[str],
    period: str = SPARKLINE_PERIOD,
    interval: str = SPARKLINE_INTERVAL,
    max_points: int = SPARKLINE_POINTS,
) -> dict[str, list[float]]:
    if not tickers:
        return {}
    if _cooldown_active():
        return {t: [] for t in tickers}
    try:
        hist = _download_prices(
            tickers,
            period=period,
            interval=interval,
            auto_adjust=False,
            group_by="ticker",
            threads=False,
        )
    except (YFRateLimitError, ValueError):
        _start_yf_cooldown()
        return {t: [] for t in tickers}

    if isinstance(hist, pd.Series):
        hist = hist.to_frame().T

    spark = {}
    for ticker in tickers:
        try:
            subset = process_data(hist.copy(), ticker)
        except Exception:
            subset = pd.DataFrame()
        spark[ticker] = _sparkline_from_df(subset, max_points=max_points)
    return spark


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


def get_watchlist_batch(tickers: list[str], sparkline_period: str | None = None) -> dict:
    """
    Fetch watchlist metrics while batching downloads, caching recent responses,
    and degrading gracefully on rate limits.
    """
    _ensure_watchlist_cache_loaded()
    clean = [t.strip().upper() for t in tickers if t and t.strip()]
    if not clean:
        return {}

    sparkline_key = _normalize_sparkline_period(sparkline_period)
    sparkline_profile = SPARKLINE_PROFILES.get(sparkline_key, {
        "period": SPARKLINE_PERIOD,
        "interval": SPARKLINE_INTERVAL,
        "points": SPARKLINE_POINTS,
    })

    if _cooldown_active():
        results = {}
        for t in clean:
            cached = WATCHLIST_CACHE.get(t)
            if cached:
                results[t] = cached[1]
            else:
                results[t] = _default_watchlist_payload()
        return results

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
            _start_yf_cooldown()
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
        if _cooldown_active():
            break
        time.sleep(2.5)

    for t in clean:
        results.setdefault(t, _default_watchlist_payload())

    missing_sparklines = []
    for t in clean:
        payload = results.get(t) or {}
        cached_key = str(payload.get("sparklinePeriod") or payload.get("sparkline_period") or "").upper()
        if "sparkline" not in payload or cached_key != sparkline_key:
            missing_sparklines.append(t)

    if missing_sparklines and not _cooldown_active():
        spark_payload = _download_watchlist_sparklines(
            missing_sparklines,
            period=sparkline_profile.get("period", SPARKLINE_PERIOD),
            interval=sparkline_profile.get("interval", SPARKLINE_INTERVAL),
            max_points=sparkline_profile.get("points", SPARKLINE_POINTS),
        )
        for ticker in missing_sparklines:
            payload = results.get(ticker) or _default_watchlist_payload()
            payload["sparkline"] = spark_payload.get(ticker, [])
            payload["sparklinePeriod"] = sparkline_key
            results[ticker] = payload
            WATCHLIST_CACHE[ticker] = (time.time(), payload)

    if results:
        _persist_watchlist_cache()

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
        _start_yf_cooldown()
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


def _load_sp500_universe_cache() -> list[str] | None:
    if SP500_UNIVERSE_CACHE_PATH.exists():
        try:
            payload = json.loads(SP500_UNIVERSE_CACHE_PATH.read_text())
            ts = float(payload.get("ts", 0))
            tickers = payload.get("tickers") or []
            if tickers and time.time() - ts < SP500_UNIVERSE_TTL:
                return [t.upper() for t in tickers if t]
        except Exception:
            pass
    return None


def _save_sp500_universe_cache(tickers: list[str]):
    try:
        SP500_UNIVERSE_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        SP500_UNIVERSE_CACHE_PATH.write_text(json.dumps({"ts": time.time(), "tickers": tickers}))
    except Exception:
        pass


def _parse_sp500_from_wikipedia() -> list[str]:
    resp = requests.get(
        "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=10,
    )
    resp.raise_for_status()
    tables = pd.read_html(resp.text)
    for table in tables:
        cols = [c.lower() for c in table.columns]
        symbol_col = None
        for idx, col in enumerate(cols):
            if "symbol" in col:
                symbol_col = table.columns[idx]
                break
        if symbol_col is None:
            continue
        tickers = [str(t).strip().upper().replace(".", "-") for t in table[symbol_col].tolist()]
        tickers = [t for t in tickers if t]
        if tickers:
            return tickers
    return []


def _load_sp500_universe(force_refresh: bool = False) -> list[str]:
    if not force_refresh:
        cached = _load_sp500_universe_cache()
        if cached:
            return cached
    try:
        tickers = _parse_sp500_from_wikipedia()
        if tickers:
            _save_sp500_universe_cache(tickers)
            SP500_UNIVERSE_PATH.parent.mkdir(parents=True, exist_ok=True)
            SP500_UNIVERSE_PATH.write_text("ticker\n" + "\n".join(tickers))
            return tickers
    except Exception:
        pass
    try:
        tickers = yf.tickers_sp500()
        if isinstance(tickers, (list, tuple)) and tickers:
            cleaned = [t.strip().upper().replace(".", "-") for t in tickers if t and t.strip()]
            if cleaned:
                _save_sp500_universe_cache(cleaned)
                SP500_UNIVERSE_PATH.parent.mkdir(parents=True, exist_ok=True)
                SP500_UNIVERSE_PATH.write_text("ticker\n" + "\n".join(cleaned))
                return cleaned
    except Exception:
        pass
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
    current_price = info.get("currentPrice") or info.get("regularMarketPrice")
    shares_outstanding = info.get("sharesOutstanding")
    market_cap = info.get("marketCap")
    if market_cap is None and isinstance(current_price, (int, float)) and isinstance(shares_outstanding, (int, float)):
        market_cap = current_price * shares_outstanding
    free_cf = info.get("freeCashflow")
    op_cf = info.get("operatingCashflow")
    total_cash = info.get("totalCash")
    total_debt = info.get("totalDebt")
    equity = info.get("totalStockholderEquity")
    revenue = info.get("totalRevenue")
    ebitda = info.get("ebitda")
    ebit = info.get("ebit") or info.get("operatingIncome")
    interest_expense = info.get("interestExpense")
    interest_paid = info.get("interestPaid")
    net_income = info.get("netIncomeToCommon") or info.get("netIncome")
    capex = info.get("capitalExpenditures")
    preferred_equity = info.get("preferredStock") or info.get("preferredStockAndOtherAdjustments")
    minority_interest = info.get("minorityInterest")
    enterprise_value = info.get("enterpriseValue")
    price_to_sales = info.get("priceToSalesTrailing12Months") or info.get("priceToSales")
    price_to_book = info.get("priceToBook")
    peg_ratio = info.get("pegRatio")
    gross_margin = info.get("grossMargins")
    operating_margin = info.get("operatingMargins")
    profit_margin = info.get("profitMargins")
    roe = info.get("returnOnEquity")
    roa = info.get("returnOnAssets")
    current_ratio = info.get("currentRatio")
    debt_to_equity = None
    if isinstance(total_debt, (int, float)) and isinstance(equity, (int, float)) and equity:
        debt_to_equity = total_debt / equity
    capex_abs = None
    if isinstance(capex, (int, float)):
        capex_abs = abs(capex)
    if free_cf is None and isinstance(op_cf, (int, float)) and isinstance(capex_abs, (int, float)):
        free_cf = op_cf - capex_abs
    fcf_yield = None
    if isinstance(free_cf, (int, float)) and isinstance(market_cap, (int, float)) and market_cap:
        fcf_yield = free_cf / market_cap
    fcf_margin = None
    if isinstance(free_cf, (int, float)) and isinstance(revenue, (int, float)) and revenue:
        fcf_margin = free_cf / revenue
    capex_to_revenue = None
    if isinstance(capex, (int, float)) and isinstance(revenue, (int, float)) and revenue:
        capex_to_revenue = capex / revenue
    fcf_to_capex = None
    if isinstance(free_cf, (int, float)) and isinstance(capex_abs, (int, float)) and capex_abs:
        fcf_to_capex = free_cf / capex_abs
    net_debt = None
    if isinstance(total_debt, (int, float)) and isinstance(total_cash, (int, float)):
        net_debt = total_debt - total_cash
    if enterprise_value is None:
        if isinstance(market_cap, (int, float)) and isinstance(total_debt, (int, float)):
            cash_component = total_cash if isinstance(total_cash, (int, float)) else 0
            pref_component = preferred_equity if isinstance(preferred_equity, (int, float)) else 0
            minority_component = minority_interest if isinstance(minority_interest, (int, float)) else 0
            enterprise_value = market_cap + total_debt + pref_component + minority_component - cash_component
    ev_to_ebitda = info.get("enterpriseToEbitda")
    if ev_to_ebitda is None and isinstance(enterprise_value, (int, float)) and isinstance(ebitda, (int, float)) and ebitda:
        ev_to_ebitda = enterprise_value / ebitda
    net_debt_to_ebitda = None
    if isinstance(net_debt, (int, float)) and isinstance(ebitda, (int, float)) and ebitda:
        net_debt_to_ebitda = net_debt / ebitda
    fcf_per_share = None
    if isinstance(free_cf, (int, float)) and isinstance(shares_outstanding, (int, float)) and shares_outstanding:
        fcf_per_share = free_cf / shares_outstanding
    p_to_fcf = None
    if isinstance(free_cf, (int, float)) and free_cf > 0 and isinstance(market_cap, (int, float)):
        p_to_fcf = market_cap / free_cf
    p_to_fcf_per_share = None
    if isinstance(fcf_per_share, (int, float)) and fcf_per_share > 0 and isinstance(current_price, (int, float)):
        p_to_fcf_per_share = current_price / fcf_per_share
    ev_to_fcf = None
    if isinstance(free_cf, (int, float)) and free_cf > 0 and isinstance(enterprise_value, (int, float)):
        ev_to_fcf = enterprise_value / free_cf
    interest_coverage_ebit = None
    if isinstance(ebit, (int, float)) and isinstance(interest_expense, (int, float)) and interest_expense:
        interest_coverage_ebit = ebit / abs(interest_expense)
    interest_coverage_cash = None
    if isinstance(op_cf, (int, float)) and isinstance(interest_paid, (int, float)) and interest_paid:
        interest_coverage_cash = op_cf / abs(interest_paid)
    fcf_conversion = None
    if isinstance(free_cf, (int, float)) and isinstance(net_income, (int, float)) and net_income:
        fcf_conversion = free_cf / net_income
    fcf_conversion_ebit = None
    if isinstance(free_cf, (int, float)) and isinstance(ebit, (int, float)) and ebit:
        fcf_conversion_ebit = free_cf / ebit
    return {
        "companyName": info.get("shortName") or info.get("longName") or info.get("displayName") or "Unknown",
        "exchange": info.get("exchange") or info.get("fullExchangeName") or "",
        "sector": info.get("sector") or "",
        "industry": info.get("industry") or "",
        "marketCap": market_cap,
        "sharesOutstanding": shares_outstanding,
        "freeCashflow": free_cf,
        "operatingCashflow": op_cf,
        "totalCash": total_cash,
        "totalDebt": total_debt,
        "debtToEquity": debt_to_equity,
        "totalRevenue": revenue,
        "ebitda": ebitda,
        "capitalExpenditures": capex,
        "enterpriseValue": enterprise_value,
        "evToEbitda": ev_to_ebitda,
        "priceToSales": price_to_sales,
        "priceToBook": price_to_book,
        "pegRatio": peg_ratio,
        "grossMargin": gross_margin,
        "operatingMargin": operating_margin,
        "profitMargin": profit_margin,
        "returnOnEquity": roe,
        "returnOnAssets": roa,
        "currentRatio": current_ratio,
        "fcfYield": fcf_yield,
        "fcfMargin": fcf_margin,
        "capexToRevenue": capex_to_revenue,
        "fcfToCapex": fcf_to_capex,
        "netDebt": net_debt,
        "netDebtToEbitda": net_debt_to_ebitda,
        "fcfPerShare": fcf_per_share,
        "priceToFcf": p_to_fcf,
        "priceToFcfPerShare": p_to_fcf_per_share,
        "evToFcf": ev_to_fcf,
        "interestCoverageEbit": interest_coverage_ebit,
        "interestCoverageCash": interest_coverage_cash,
        "fcfConversion": fcf_conversion,
        "fcfConversionEbit": fcf_conversion_ebit,
        "trailingPE": info.get("trailingPE"),
        "forwardPE": info.get("forwardPE"),
    }


def get_sp500_screener(metric: str = "freeCashflow", order: str = "desc", limit: int = 20, refresh: bool = False) -> dict:
    metric = (metric or "freeCashflow").strip()
    order = (order or "desc").lower()
    raw_limit = int(limit or 50)
    if raw_limit <= 0:
        limit = 0
    else:
        limit = max(20, min(raw_limit, 200))

    universe = _load_sp500_universe(force_refresh=refresh)
    cache = _load_sp500_cache()
    data = cache.get("data") or {}
    if refresh:
        cache["ts"] = 0

    missing = [t for t in universe if t not in data]
    if not _cooldown_active():
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
        rows.append({
            "ticker": ticker,
            "metricValue": value,
            **metrics,
        })

    rows.sort(key=lambda r: (r["metricValue"] is None, r["metricValue"]), reverse=(order != "asc"))
    if limit:
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
        "cooldown": _cooldown_active(),
        "cooldownSeconds": _cooldown_remaining_seconds(),
    }


_load_yf_cooldown_state()
