import traceback
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from tools import get_stock_data, get_kpi_data, get_technical_indicators

app = FastAPI()

# Allow requests from any origin (you can restrict this to your frontend URL if desired)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/stock/{ticker}")
def stock_data(ticker: str, period: str = "1y", interval: str = "1d"):
    try:
        data = get_stock_data(ticker, period, interval)
        return jsonable_encoder(data)
    except ValueError as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/kpi/{ticker}")
def kpi_data(ticker: str):
    try:
        data = get_kpi_data(ticker)
        return jsonable_encoder(data)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/indicators/{ticker}")
def indicators(ticker: str, period: str = "1y", interval: str = "1d", ma: int = 50):
    try:
        data = get_technical_indicators(ticker, period, interval, ma)
        return jsonable_encoder(data)
    except ValueError as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
