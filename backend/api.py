from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import uvicorn
import traceback
import requests
import yfinance as yf
from yfinance.exceptions import YFRateLimitError
from backend.tools import (
    get_stock_data,
    get_kpi_data,
    get_technical_indicators,
    slice_indicator_data,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    global INDICATOR_DATA_STORE
    try:
        data = get_stock_data(ticker, period, interval)
        max_indicators = get_technical_indicators(
            ticker, period="max", interval=interval)
        INDICATOR_DATA_STORE[ticker] = max_indicators
        return data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"Internal Server Error: {e}")


@app.get("/kpi/{ticker}")
def kpi_data_endpoint(ticker: str):
    try:
        return get_kpi_data(ticker)
    except Exception as e:
        traceback.print_exc()
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
    print(f"Fetching data for: {ticker}")
    try:
        import time

        yf_data = yf.Ticker(ticker)
        # Retry history fetch on rate limit
        max_retries = 3
        backoff = 0.5
        hist = None
        for attempt in range(max_retries):
            try:
                hist = yf_data.history(period="7d", interval="1d")
                break
            except YFRateLimitError:
                print(
                    f"Rate limit on history for {ticker}, retrying in {backoff}s...")
                time.sleep(backoff)
                backoff *= 2
        # Fallback if still failed
        if hist is None or hist.empty or "Close" not in hist.columns:
            raise ValueError("Empty or malformed historical data")

        latest = hist.iloc[-1]
        prev = hist.iloc[-2] if len(hist) > 1 else latest

        current_price = float(latest.get("Close", 0.0))
        prev_close = float(prev.get("Close", 0.0))
        daily_change = current_price - prev_close
        daily_pct = (daily_change / prev_close * 100) if prev_close else 0.0

        ytd_price = float(hist.iloc[0].get("Close", current_price))
        ytd_change = current_price - ytd_price
        ytd_pct = (ytd_change / ytd_price * 100) if ytd_price else 0.0

        # Retry info fetch on rate limit
        info = {}
        backoff = 0.5
        for attempt in range(max_retries):
            try:
                info = yf_data.info or {}
                break
            except YFRateLimitError:
                print(
                    f"Rate limit on info for {ticker}, retrying in {backoff}s...")
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

    except Exception as e:
        print(f"[ERROR] {ticker}: {e}")
        return JSONResponse(status_code=200, content={
            "companyName": "Unknown",
            "currentPrice": 0.0,
            "dailyChange": 0.0,
            "dailyPct": 0.0,
            "ytdChange": 0.0,
            "ytdPct": 0.0,
        })


# Mount static files last, after API routes
app.mount("/", StaticFiles(directory="frontend", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
