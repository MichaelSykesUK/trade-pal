# TradePal – Financial Markets Application

TradePal is a full-stack financial analytics app that provides interactive stock charts, market indicators, and ML-based forecasting — all powered by Yahoo Finance and FastAPI.

## 🚀 Features

- Live stock charting with technical overlays
- Market overview and customizable watchlist
- ML-driven price forecasting (XGBoost, ARIMA, etc.)
- Auto-complete ticker search
- Real-time financial news

## 📦 Requirements

- **Python 3.10+**
- **Node.js 18+**
- **Virtual environment** (Conda or `venv`) for the backend

## ⚙️ Setup Instructions

### Backend
```bash
conda env create -f backend/environment.yml
conda activate tradepal
# or: python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
```

### Frontend
```bash
cd frontend
npm install
```
If your backend does **not** run on `http://localhost:8000`, add a `.env.local`
file under `frontend/` with:
```
NEXT_PUBLIC_API_BASE=https://your-api-host
```

## ▶️ Run the Application

Run the backend (FastAPI) and frontend (Next.js) in two terminals:

```bash
# Terminal 1
conda activate tradepal  # or source your venv
uvicorn backend.api:app --reload --port 8000

# Terminal 2
cd frontend
npm run dev
```

- Backend API: `http://127.0.0.1:8000`
- Frontend UI: `http://127.0.0.1:3000`

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
├── frontend/
│   ├── pages/              # Next.js routes (legacy DOM rendered in React)
│   ├── public/static/      # Legacy JS bundle and assets
│   └── styles/             # Global CSS imported by `_app.jsx`
```

## 🧠 Developer Notes
- Yahoo Finance is rate-limited — requests are retried with exponential backoff and cached on the backend.
- The frontend fetches market/watchlist data via a single `/watchlist_data/batch` call and debounces autocomplete requests to stay under rate limits.
- The UI is implemented entirely in React/Next.js (header, sidebar, charts, KPI, ML controls); Lightweight Charts is loaded globally in `_app.jsx`.
- ML model predictions support ARIMA, XGBoost, RandomForest, etc.

## 📌 Updating Dependencies
If you add new Python packages:

```bash
pip install <package>
pip freeze > backend/requirements.txt
Commit requirements.txt after every dependency change.
```

## 🧾 License
MIT (or specify your preferred license)
