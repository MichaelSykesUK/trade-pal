from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import traceback
import requests
from tools import (
    get_stock_data,
    get_kpi_data,
    get_technical_indicators,
    slice_indicator_data,
)

app = FastAPI()

origins = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]
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
    base_url = "https://query2.finance.yahoo.com/v1/finance/search"
    params = {
        "q": q,
        "lang": "en-US",
        "region": "US",
        "quotesCount": 6,
        "newsCount": 0
    }
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        resp = requests.get(base_url, params=params,
                            headers=headers, timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/news/{ticker}")
def get_news(ticker: str):
    base_url = "https://query2.finance.yahoo.com/v1/finance/search"
    params = {
        "q": ticker,
        "lang": "en-US",
        "region": "US",
        "quotesCount": 0,
        "newsCount": 10
    }
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        resp = requests.get(base_url, params=params,
                            headers=headers, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        news = data.get("news", [])
        return news
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
            status_code=500, detail=f"Internal Server Error: {str(e)}")


@app.get("/kpi/{ticker}")
def kpi_data_endpoint(ticker: str):
    try:
        data = get_kpi_data(ticker)
        return data
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/indicators/{ticker}")
def indicators(ticker: str, period: str = "1y", interval: str = "1d"):
    global INDICATOR_DATA_STORE
    try:
        if ticker not in INDICATOR_DATA_STORE:
            max_indicators = get_technical_indicators(
                ticker, period="max", interval=interval)
            INDICATOR_DATA_STORE[ticker] = max_indicators
        d = slice_indicator_data(INDICATOR_DATA_STORE[ticker], period)
        return d
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
