from __future__ import annotations

import json
import time
from io import StringIO
from pathlib import Path
from threading import Lock

import pandas as pd
import numpy as np
import requests

from backend.tools import download_prices

MACRO_CACHE_TTL = 60 * 60 * 24  # 24 hours
MACRO_CACHE_PATH = Path(__file__).resolve().parent / "output" / "macro_cache.csv"
MACRO_META_PATH = Path(__file__).resolve().parent / "output" / "macro_meta.json"

# Core macro series (FRED). Transforms are applied per-series before resampling.
MACRO_SERIES = [
    {
        "key": "sp500_ret",
        "source": "fred",
        "series_id": "SP500",
        "label": "S&P 500 (1D %)",
        "transform": "pct_change",
    },
    {
        "key": "fed_funds",
        "source": "fred",
        "series_id": "FEDFUNDS",
        "label": "Fed Funds Rate",
        "transform": "level",
    },
    {
        "key": "cpi_yoy",
        "source": "fred",
        "series_id": "CPIAUCSL",
        "label": "CPI (YoY %)",
        "transform": "yoy",
    },
    {
        "key": "pce_yoy",
        "source": "fred",
        "series_id": "PCEPI",
        "label": "PCE (YoY %)",
        "transform": "yoy",
    },
    {
        "key": "dgs10",
        "source": "fred",
        "series_id": "DGS10",
        "label": "10Y Treasury Yield",
        "transform": "level",
    },
    {
        "key": "dgs2",
        "source": "fred",
        "series_id": "DGS2",
        "label": "2Y Treasury Yield",
        "transform": "level",
    },
    {
        "key": "vix_ret",
        "source": "fred",
        "series_id": "VIXCLS",
        "label": "VIX (1D %)",
        "transform": "pct_change",
    },
    {
        "key": "wti_ret",
        "source": "fred",
        "series_id": "DCOILWTICO",
        "label": "WTI Oil (1D %)",
        "transform": "pct_change",
    },
    {
        "key": "usd_ret",
        "source": "fred",
        "series_id": "DTWEXBGS",
        "label": "USD Broad Index (1D %)",
        "transform": "pct_change",
    },
    {
        "key": "gold_ret",
        "source": "yahoo",
        "ticker": "GLD",
        "label": "Gold (GLD, 1D %)",
        "transform": "pct_change",
    },
    {
        "key": "silver_ret",
        "source": "yahoo",
        "ticker": "SLV",
        "label": "Silver (SLV, 1D %)",
        "transform": "pct_change",
    },
]

# Derived macro features from the core series.
DERIVED_FEATURES = [
    {
        "key": "yield_curve_10y_2y",
        "label": "10Y-2Y Yield Curve",
    }
]

_MACRO_CACHE: tuple[float, pd.DataFrame] | None = None
_MACRO_LOCK = Lock()


def get_macro_feature_specs() -> list[dict]:
    return [
        {k: v for k, v in spec.items() if k not in ("series_id", "ticker")}
        for spec in MACRO_SERIES
    ] + DERIVED_FEATURES.copy()


def _fred_csv_url(series_id: str) -> str:
    return f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"


def _fetch_fred_series(series_id: str) -> pd.Series:
    resp = requests.get(
        _fred_csv_url(series_id),
        timeout=10,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    resp.raise_for_status()
    df = pd.read_csv(StringIO(resp.text))
    if df.empty or len(df.columns) < 2:
        raise ValueError(f"Unexpected FRED response for {series_id}")

    date_col = None
    for col in df.columns:
        if str(col).strip().upper() == "DATE":
            date_col = col
            break
    if date_col is None:
        date_col = df.columns[0]

    value_col = series_id if series_id in df.columns else None
    if value_col is None:
        for col in df.columns:
            if col != date_col:
                value_col = col
                break
    if value_col is None:
        raise ValueError(f"Unexpected FRED response for {series_id}")

    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df[value_col] = pd.to_numeric(df[value_col], errors="coerce")
    df = df.dropna(subset=[date_col]).set_index(date_col)
    series = df[value_col]
    return series


def _fetch_yahoo_series(ticker: str) -> pd.Series:
    data = download_prices(ticker, period="max", interval="1d", auto_adjust=False)
    if data is None or data.empty:
        raise ValueError(f"No Yahoo data for {ticker}")
    if isinstance(data.columns, pd.MultiIndex):
        try:
            subset = data.xs(ticker, level=-1, axis=1)
        except Exception:
            subset = data
    else:
        subset = data
    if "Close" not in subset.columns:
        raise ValueError(f"Yahoo data missing Close for {ticker}")
    series = subset["Close"].dropna()
    series.name = ticker
    return series


def _apply_transform(series: pd.Series, transform: str) -> pd.Series:
    series = series.astype(float)
    if transform == "level":
        return series.replace([np.inf, -np.inf], np.nan)
    if transform == "pct_change":
        return series.pct_change().replace([np.inf, -np.inf], np.nan)
    if transform == "yoy":
        return series.pct_change(12).replace([np.inf, -np.inf], np.nan)
    raise ValueError(f"Unknown macro transform: {transform}")


def _build_macro_frame() -> tuple[pd.DataFrame, dict]:
    frames: list[pd.DataFrame] = []
    meta: dict[str, str] = {}
    for spec in MACRO_SERIES:
        key = spec["key"]
        try:
            source = spec.get("source", "fred")
            if source == "fred":
                raw = _fetch_fred_series(spec["series_id"])
            elif source == "yahoo":
                raw = _fetch_yahoo_series(spec["ticker"])
            else:
                raise ValueError(f"Unknown macro source: {source}")
            transformed = _apply_transform(raw, spec["transform"])
            frame = transformed.to_frame(name=key).resample("D").ffill()
            frames.append(frame)
            meta[key] = "ok"
        except Exception as exc:
            meta[key] = f"error: {exc}"
    if not frames:
        return pd.DataFrame(), meta
    df = pd.concat(frames, axis=1).sort_index()
    if "dgs10" in df.columns and "dgs2" in df.columns:
        df["yield_curve_10y_2y"] = df["dgs10"] - df["dgs2"]
    return df, meta


def _save_macro_cache(df: pd.DataFrame, meta: dict):
    try:
        MACRO_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = df.copy()
        payload.index.name = "Date"
        payload.to_csv(MACRO_CACHE_PATH)
        meta_payload = {
            "ts": time.time(),
            "series": meta,
        }
        MACRO_META_PATH.write_text(json.dumps(meta_payload, indent=2))
    except Exception:
        # Non-fatal: keep serving from memory if available.
        pass


def _load_macro_cache() -> pd.DataFrame | None:
    if not MACRO_CACHE_PATH.exists():
        return None
    age = time.time() - MACRO_CACHE_PATH.stat().st_mtime
    if age > MACRO_CACHE_TTL:
        return None
    try:
        df = pd.read_csv(MACRO_CACHE_PATH, parse_dates=["Date"])
        df = df.set_index("Date")
        return df
    except Exception:
        return None


def update_macro_cache(force: bool = False) -> pd.DataFrame:
    if not force:
        cached = _load_macro_cache()
        if cached is not None:
            return cached
    df, meta = _build_macro_frame()
    if not df.empty:
        _save_macro_cache(df, meta)
    return df


def get_macro_frame(force: bool = False) -> pd.DataFrame:
    global _MACRO_CACHE
    with _MACRO_LOCK:
        if _MACRO_CACHE and not force:
            ts, df = _MACRO_CACHE
            if time.time() - ts < MACRO_CACHE_TTL:
                return df
    cached = update_macro_cache(force=force)
    with _MACRO_LOCK:
        _MACRO_CACHE = (time.time(), cached)
    return cached


def align_macro_to_index(index: pd.Index, lag_days: int = 1) -> pd.DataFrame:
    df = get_macro_frame()
    if df.empty:
        return pd.DataFrame(index=index)
    aligned = df.reindex(pd.to_datetime(index)).ffill()
    if lag_days:
        aligned = aligned.shift(lag_days).ffill()
    return aligned


def warm_macro_cache():
    try:
        get_macro_frame(force=False)
    except Exception:
        pass
