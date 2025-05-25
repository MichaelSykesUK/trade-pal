import json
import yfinance as yf
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import traceback
import requests
import time
from yfinance.exceptions import YFRateLimitError
from backend.tools import (
    get_stock_data,
    get_kpi_data,
    get_technical_indicators,
    slice_indicator_data,
    get_extended_period
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


@app.get("/autocomplete")
def yahoo_autocomplete(q: str):
    try:
        resp = requests.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={"q": q, "lang": "en-US", "region": "US",
                    "quotesCount": 6, "newsCount": 0},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/news/{ticker}")
def get_news(ticker: str):
    try:
        resp = requests.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={"q": ticker, "lang": "en-US", "region": "US",
                    "quotesCount": 0, "newsCount": 10},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5
        )
        resp.raise_for_status()
        return resp.json().get("news", [])
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/stock/{ticker}")
def stock_data(ticker: str, period: str = "1y", interval: str = "1d"):
    """
    Fetches historical stock data and preloads max-range indicators,
    retrying up to 3 times on YF rate‐limit errors.
    """
    max_retries = 3
    backoff = 0.5

    for attempt in range(max_retries):
        try:
            # 1) get the sliced stock data
            data = get_stock_data(ticker, period, interval)

            # 2) fetch & cache the full-range technical indicators
            max_ind = get_technical_indicators(
                ticker, period="max", interval=interval)
            INDICATOR_DATA_STORE[ticker] = max_ind

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
                detail="Yahoo Finance rate limit exceeded. Please try again later."
            )

        except ValueError as e:
            # bad ticker / no data → client error
            raise HTTPException(status_code=400, detail=str(e))

        except Exception as e:
            # unexpected → server error
            raise HTTPException(
                status_code=500, detail=f"Internal Server Error: {e}")


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
                "companyName": "N/A", "exchange": "", "currency": "",
                "peRatio": "N/A", "forwardPE": "N/A", "nextEarningsDate": "N/A",
                "weekHigh52": None, "weekLow52": None, "marketCap": "N/A",
                "beta": "N/A", "eps": "N/A", "dividend": "N/A",
                "exDividendDate": "N/A", "openPrice": None, "previousClose": None,
                "daysRange": "N/A", "weekRange": "N/A", "avgVolume": None
            }

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.get("/indicators/{ticker}")
def indicators(ticker: str, period: str = "1y", interval: str = "1d"):
    global INDICATOR_DATA_STORE
    try:
        if ticker not in INDICATOR_DATA_STORE:
            INDICATOR_DATA_STORE[ticker] = get_technical_indicators(
                ticker, period="max", interval=interval)
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
    max_retries = 3
    backoff = 0.5

    for attempt in range(max_retries):
        try:
            yf_data = yf.Ticker(ticker)

            # 1) Get 7-day history
            hist = yf_data.history(period="7d", interval="1d")
            if hist is None or hist.empty or "Close" not in hist.columns:
                raise ValueError("Empty or malformed historical data")

            latest = hist.iloc[-1]
            prev = hist.iloc[-2] if len(hist) > 1 else latest

            current_price = float(latest["Close"])
            prev_close = float(prev["Close"])
            daily_change = current_price - prev_close
            daily_pct = (daily_change / prev_close *
                         100) if prev_close else 0.0

            ytd_price = float(hist.iloc[0]["Close"])
            ytd_change = current_price - ytd_price
            ytd_pct = (ytd_change / ytd_price * 100) if ytd_price else 0.0

            # 2) Get company info (also with its own mini‐retry)
            info = {}
            for i in range(max_retries):
                try:
                    info = yf_data.info or {}
                    break
                except YFRateLimitError:
                    time.sleep(backoff)
                    backoff *= 2

            name = info.get("shortName") or info.get("longName") or "Unknown"

            return {
                "companyName": name,
                "currentPrice": current_price,
                "dailyChange": daily_change,
                "dailyPct": daily_pct,
                "ytdChange": ytd_change,
                "ytdPct": ytd_pct,
            }

        except YFRateLimitError:
            # exponential backoff on rate‐limit
            if attempt < max_retries - 1:
                time.sleep(backoff)
                backoff *= 2
                continue
            # give up after retries
            break

        except Exception:
            # any other error → give up
            break

    # fallback response if we never returned above
    return JSONResponse(status_code=200, content={
        "companyName": "Unknown",
        "currentPrice": 0.0,
        "dailyChange": 0.0,
        "dailyPct": 0.0,
        "ytdChange": 0.0,
        "ytdPct": 0.0,
    })


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
    features: str = None,
):
    # Normalize period for yfinance
    yf_period = get_extended_period(period)

    # Parse ARIMA order
    try:
        order = tuple(int(x) for x in arima_order.split(","))
    except Exception:
        raise HTTPException(400, "Invalid arima_order; must be 'p,d,q'.")

    # Quick check for historical data
    tmp = yf.download(ticker, period=yf_period, interval=interval)
    if tmp.empty:
        raise HTTPException(
            400, f"No historical data found for '{ticker}' over period '{period}'")

    # Parse and validate feature flags
    if not features:
        raise HTTPException(400, "You must select at least one feature.")
    try:
        flags = json.loads(features)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON in 'features' parameter.")
    if not any(flags.values()):
        raise HTTPException(400, "You must select at least one feature.")

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


# Mount static files last
app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
