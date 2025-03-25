from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import traceback
import requests
from tools import (
    get_stock_data,
    get_kpi_data,
    get_technical_indicators,
    slice_indicator_data,
)
import yfinance as yf
from datetime import datetime

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
            ticker, period="max", interval=interval
        )
        INDICATOR_DATA_STORE[ticker] = max_indicators
        return data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"Internal Server Error: {str(e)}"
        )


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
                ticker, period="max", interval=interval
            )
            INDICATOR_DATA_STORE[ticker] = max_indicators
        d = slice_indicator_data(INDICATOR_DATA_STORE[ticker], period)
        return d
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/watchlist_data/{ticker}")
def watchlist_data(ticker: str):
    """
    Fetch minimal data for watchlist: current price, daily change, YTD change, etc.
    We'll fetch ~7 days for daily_data so we (hopefully) have at least 2 trading days.
    """
    response = {
        "ticker": ticker,
        "companyName": "Unknown",
        "currentPrice": 0.0,
        "dailyChange": 0.0,
        "dailyPct": 0.0,
        "ytdChange": 0.0,
        "ytdPct": 0.0,
    }

    try:
        # Fetch ~7 days for daily data
        daily_data = yf.download(
            ticker, period="7d", interval="1d", auto_adjust=False)
        if daily_data.empty:
            return response

        # For YTD data
        ytd_start = datetime(datetime.now().year, 1, 1)
        ytd_data = yf.download(ticker, start=ytd_start,
                               interval="1d", auto_adjust=False)

        # Current price from last row
        current_price = daily_data["Close"].iloc[-1]
        if current_price is not None:
            response["currentPrice"] = float(current_price)

        # If we have at least 2 days, compute daily change
        if len(daily_data) >= 2:
            prev_close = daily_data["Close"].iloc[-2]
            if prev_close and prev_close != 0:
                daily_change = current_price - prev_close
                daily_pct = (daily_change / prev_close) * 100
                response["dailyChange"] = float(daily_change)
                response["dailyPct"] = float(daily_pct)

        # YTD change if we have data
        if not ytd_data.empty:
            ytd_start_price = ytd_data["Close"].iloc[0]
            if ytd_start_price and ytd_start_price != 0:
                ytd_change = current_price - ytd_start_price
                ytd_pct = (ytd_change / ytd_start_price) * 100
                response["ytdChange"] = float(ytd_change)
                response["ytdPct"] = float(ytd_pct)

        # Try to get a company name from yfinance
        stock = yf.Ticker(ticker)
        info = stock.info or {}
        if "longName" in info:
            response["companyName"] = info["longName"]

    except Exception:
        traceback.print_exc()
        pass

    return response


# Mount static files
app.mount("/", StaticFiles(directory="frontend", html=True), name="static")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
