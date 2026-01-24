# backend/api.py

import json
import time
import traceback
from pathlib import Path

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from yfinance.exceptions import YFRateLimitError

from backend.tools import (
    get_stock_data,
    get_kpi_data,
    get_technical_indicators,
    slice_indicator_data,
    get_extended_period,
    get_watchlist_batch,
    get_stock_bundle,
    download_prices,
    get_sp500_screener,
)
from backend.ml import get_available_models, run_ml_model


app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global store for indicator data
INDICATOR_DATA_STORE = {}
NEWS_CACHE_TTL = 300
NEWS_CACHE: dict[str, tuple[float, list]] = {}
AUTOCOMPLETE_CACHE_TTL = 180
AUTOCOMPLETE_CACHE: dict[str, tuple[float, dict]] = {}


class WatchlistBatchRequest(BaseModel):
    tickers: list[str]


@app.get("/autocomplete")
def yahoo_autocomplete(q: str):
    try:
        cache_key = (q or "").strip().lower()
        cached = AUTOCOMPLETE_CACHE.get(cache_key)
        if cached and time.time() - cached[0] < AUTOCOMPLETE_CACHE_TTL:
            return cached[1]

        resp = requests.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={"q": q, "lang": "en-US", "region": "US", "quotesCount": 6, "newsCount": 0},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5,
        )
        resp.raise_for_status()
        payload = resp.json()
        AUTOCOMPLETE_CACHE[cache_key] = (time.time(), payload)
        return payload
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def _fetch_news(ticker: str):
    cache_key = (ticker or "").upper().strip()
    cached = NEWS_CACHE.get(cache_key)
    if cached and time.time() - cached[0] < NEWS_CACHE_TTL:
        return cached[1]

    resp = requests.get(
        "https://query2.finance.yahoo.com/v1/finance/search",
        params={"q": ticker, "lang": "en-US", "region": "US", "quotesCount": 0, "newsCount": 10},
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=5,
    )
    resp.raise_for_status()
    news = resp.json().get("news", [])
    NEWS_CACHE[cache_key] = (time.time(), news)
    return news


@app.get("/news/{ticker}")
def get_news(ticker: str):
    try:
        return _fetch_news(ticker)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stock/{ticker}")
def stock_data(ticker: str, period: str = "1y", interval: str = "1d"):
    """
    Fetches historical stock data and preloads max-range indicators,
    retrying up to 3 times on YF rate‐limit errors.
    """
    # Normalize inputs so "1Y" / "1D" work
    period = (period or "").lower().strip()
    interval = (interval or "").lower().strip()

    max_retries = 3
    backoff = 0.5

    for attempt in range(max_retries):
        try:
            # 1) get the sliced stock data
            data = get_stock_data(ticker, period, interval)

            return data

        except YFRateLimitError:
            # if we're not on our last try, sleep & retry
            if attempt < max_retries - 1:
                time.sleep(backoff)
                backoff *= 2
                continue
            # final failure: service unavailable
            raise HTTPException(
                status_code=503,
                detail="Yahoo Finance rate limit exceeded. Please try again later.",
            )

        except ValueError as e:
            # bad ticker / no data → client error
            raise HTTPException(status_code=400, detail=str(e))

        except Exception as e:
            # unexpected → server error
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Internal Server Error: {e}")


@app.get("/kpi/{ticker}")
def kpi_data_endpoint(ticker: str):
    """
    Fetch KPI data with up to 3 retries on YF rate-limit.
    Falls back to default-N/A values if rate-limited.
    """
    max_retries = 3
    backoff = 0.5

    for attempt in range(max_retries):
        try:
            return get_kpi_data(ticker)

        except YFRateLimitError:
            if attempt < max_retries - 1:
                time.sleep(backoff)
                backoff *= 2
                continue
            # on final failure, return a safe default KPI object:
            return {
                "companyName": "N/A",
                "exchange": "",
                "currency": "",
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

        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))


@app.get("/indicators/{ticker}")
def indicators(ticker: str, period: str = "1y", interval: str = "1d"):
    # Normalize inputs
    period = (period or "").lower().strip()
    interval = (interval or "").lower().strip()

    global INDICATOR_DATA_STORE
    try:
        if ticker not in INDICATOR_DATA_STORE:
            INDICATOR_DATA_STORE[ticker] = get_technical_indicators(ticker, period="max", interval=interval)
        return slice_indicator_data(INDICATOR_DATA_STORE[ticker], period)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/watchlist_data/{ticker}")
def watchlist_data(ticker: str):
    """
    Fetch daily & YTD change + company name, with up to 3 retries on YF rate limits.
    Falls back to zeros if still failing.
    """
    try:
        batch = get_watchlist_batch([ticker])
        payload = batch.get(ticker)
        if payload:
            return payload
    except YFRateLimitError:
        pass
    except Exception:
        traceback.print_exc()

    return JSONResponse(
        status_code=200,
        content={
            "companyName": "Unknown",
            "currentPrice": 0.0,
            "dailyChange": 0.0,
            "dailyPct": 0.0,
            "ytdChange": 0.0,
            "ytdPct": 0.0,
        },
    )


@app.post("/watchlist_data/batch")
def watchlist_data_batch(payload: WatchlistBatchRequest):
    tickers = payload.tickers or []
    if not tickers:
        raise HTTPException(status_code=400, detail="Provide at least one ticker.")
    try:
        return get_watchlist_batch(tickers)
    except YFRateLimitError:
        raise HTTPException(
            status_code=503,
            detail="Yahoo Finance rate limit exceeded. Please try again later.",
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/screener/sp500")
def sp500_screener(metric: str = "freeCashflow", order: str = "desc", limit: int = 20, refresh: bool = False):
    try:
        return get_sp500_screener(metric=metric, order=order, limit=limit, refresh=refresh)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/bundle/{ticker}")
def bundle_data(
    ticker: str,
    period: str = "1y",
    interval: str = "1d",
    include_news: bool = True,
):
    period = (period or "").lower().strip()
    interval = (interval or "").lower().strip()

    try:
        bundle = get_stock_bundle(ticker, period, interval)
    except YFRateLimitError:
        raise HTTPException(
            status_code=503,
            detail="Yahoo Finance rate limit exceeded. Please try again later.",
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

    news_payload = []
    if include_news:
        try:
            news_payload = _fetch_news(ticker)
        except Exception:
            cached = NEWS_CACHE.get((ticker or "").upper().strip())
            news_payload = cached[1] if cached else []

    return {
        "stock": bundle.get("stock", {}),
        "indicators": bundle.get("indicators", {}),
        "kpi": bundle.get("kpi", {}),
        "news": news_payload,
    }


@app.get("/ml/models")
def ml_models():
    return get_available_models()


@app.get("/ml/{ticker}")
def ml_predictions(
    ticker: str,
    period: str = "1y",
    interval: str = "1d",
    model: str = "XGBoost",
    pre_days: int = 10,
    test_days: int = 10,
    ma1: int = 50,
    ma2: int = 150,
    ema1: int = 50,
    arima_order: str = "5,1,0",
    scaler_type: str = "standard",
    features: str | None = None,
):
    # Normalize inputs for yfinance
    period = (period or "").lower().strip()
    interval = (interval or "").lower().strip()
    yf_period = get_extended_period(period, interval)

    # Parse ARIMA order
    try:
        order = tuple(int(x) for x in arima_order.split(","))
    except Exception:
        raise HTTPException(400, "Invalid arima_order; must be 'p,d,q'.")

    # Parse and validate feature flags (ARIMA doesn't require them)
    flags = {}
    if model != "ARIMA":
        if not features:
            raise HTTPException(400, "You must select at least one feature.")
        try:
            flags = json.loads(features)
        except json.JSONDecodeError:
            raise HTTPException(400, "Invalid JSON in 'features' parameter.")
        if not any(flags.values()):
            raise HTTPException(400, "You must select at least one feature.")
    else:
        if features:
            try:
                flags = json.loads(features)
            except json.JSONDecodeError:
                flags = {}

    # Retry loop on Yahoo rate-limit
    max_retries = 3
    backoff = 0.5
    for attempt in range(max_retries):
        try:
            return run_ml_model(
                ticker=ticker,
                period=yf_period,
                interval=interval,
                model_type=model,
                pre_days=pre_days,
                test_days=test_days,
                ma1=ma1,
                ma2=ma2,
                ema1=ema1,
                arima_order=order,
                scaler_type=scaler_type,
                feature_flags=flags,
            )
        except YFRateLimitError:
            if attempt < max_retries - 1:
                time.sleep(backoff)
                backoff *= 2
                continue
            raise HTTPException(503, "Rate limit exceeded; try again shortly.")
        except ValueError as e:
            raise HTTPException(400, detail=str(e))
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(500, f"ML Error: {e}")


# ---------- Static files ----------
# Detect whichever frontend build exists (Vite, Next, or legacy) to avoid hard failures.
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_CANDIDATES = [
    BASE_DIR / "frontend-vite" / "dist",
    BASE_DIR / "frontend-vite",
    BASE_DIR / "frontend-next" / "out",
    BASE_DIR / "frontend-next",
    BASE_DIR / "frontend",
]
STATIC_DIR = next((candidate for candidate in STATIC_CANDIDATES if candidate.exists()), None)


@app.get("/")
def read_index():
    if not STATIC_DIR:
        raise HTTPException(404, "No frontend build directory found.")
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(404, f"Missing index.html in {STATIC_DIR}")
    return FileResponse(index_path)


if STATIC_DIR:
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
