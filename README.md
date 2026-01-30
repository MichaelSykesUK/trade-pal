# TradePal – Financial Markets Application

TradePal is a full-stack financial analytics app that provides interactive stock charts, market indicators, and ML-based forecasting — all powered by Yahoo Finance and FastAPI.

## 🚀 Features

- Live stock charting with technical overlays
- Market overview and customizable watchlist
- ML-driven price forecasting (XGBoost, ARIMA, etc.)
- Auto-complete ticker search
- Real-time financial news

## 📦 Requirements

- **Python 3.12+**
- **Node.js 18+**
- **Poetry** (recommended for the backend)

## ⚙️ Setup Instructions

### Backend (Poetry)
```bash
poetry install
```

### Frontend (Vite)
```bash
cd frontend-vite
npm install
```
If your backend does **not** run on `http://localhost:8000`, add a `.env.local`
file under `frontend-vite/` with:
```
VITE_API_BASE=https://your-api-host
```

## ▶️ Run the Application

Run the backend (FastAPI) and frontend (Vite) with one command:

```bash
chmod +x dev.sh
./dev.sh
```

Or use npm as a simple launcher from the repo root:
```bash
npm run dev
```

The dev script always uses `8000` (backend) and `5173` (frontend). If those
ports are already in use, it will stop the existing processes first, then
start fresh and wire the frontend to the backend automatically (forcing the
frontend to bind on `127.0.0.1`).

To do a quick health check (starts both servers, verifies they respond, opens
the frontend and backend docs in your browser, then stops them), run:
```bash
npm run check
```
It prints progress while waiting and logs server output to
`/tmp/tradepal-dev-check.log`.

If you prefer two terminals, you can still run:
```bash
poetry run uvicorn backend.api:app --reload --port 8000
cd frontend-vite && npm run dev
```

- Backend API: `http://127.0.0.1:8000`
- Frontend UI: `http://127.0.0.1:5173`

The frontend talks to the backend through REST calls; keep both processes running while you work.

## 🧪 How to Use

1. Type a stock ticker (e.g. AAPL) into the search bar
2. View interactive charts and technical indicators
3. Run machine learning projections
4. Add tickers to your watchlist
5. See real-time news for any stock

## 🗂️ Project Structure
```bash
/tradepal
│
├── backend/
│   ├── api.py              # FastAPI backend and endpoints
│   ├── tools.py            # Technical indicator logic
│   ├── ml.py               # Machine learning models and logic
│   └── requirements.txt    # Python dependencies
│
├── frontend-vite/
│   ├── src/                # React app source
│   ├── index.html          # Vite entry
│   └── vite.config.js      # Vite config
```

## 🧠 Developer Notes
- Yahoo Finance is rate-limited — requests are retried with exponential backoff and cached on the backend.
- The frontend fetches market/watchlist data via a single `/watchlist_data/batch` call and debounces autocomplete requests to stay under rate limits.
- The UI is implemented entirely in React (Vite); Lightweight Charts powers the charting components.
- ML model predictions support ARIMA, XGBoost, RandomForest, etc.

## 🧰 Screener Cache Warm-up
To prefill the S&P 500 screener cache (useful for large table views), run:
```bash
python backend/scripts/warm_sp500_cache.py --refresh
```
This loops through the universe gradually to avoid Yahoo rate limits.

## 📌 S&P 500 Universe Source
The backend attempts to fetch the live S&P 500 list from Wikipedia and caches
it for 24 hours. If that fails, it falls back to Yahoo’s `tickers_sp500()` or
the cached CSV under `backend/data/sp500.csv`.

## 📌 Updating Dependencies
If you add new Python packages:

```bash
pip install <package>
pip freeze > backend/requirements.txt
Commit requirements.txt after every dependency change.
```

## 🧾 License
MIT (or specify your preferred license)
