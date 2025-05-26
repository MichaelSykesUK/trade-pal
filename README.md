# TradePal – Financial Markets Application

TradePal is a full-stack financial analytics app that provides interactive stock charts, market indicators, and ML-based forecasting — all powered by Yahoo Finance and FastAPI.

## 🚀 Features

- Live stock charting with technical overlays
- Market overview and customizable watchlist
- ML-driven price forecasting (XGBoost, ARIMA, etc.)
- Auto-complete ticker search
- Real-time financial news

## 📦 Requirements

- **Python 3.8+**
- **Virtual environment** (recommended)

## ⚙️ Setup Instructions

### 1. Clone the Repository and Create a Virtual Environment
```bash
git clone https://github.com/your-org/tradepal.git
cd tradepal
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

```

### 2. Install Backend Dependencies
```bash
pip install -r backend/requirements.txt
```

## ▶️ Run the Application

```bash
uvicorn backend.api:app --reload
```

By default, the application will be available at:

```bash
http://127.0.0.1:8000
```

The UI will load automatically — it's served as static files via FastAPI.

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
│   ├── index.html          # Main app UI
│   ├── style.css           # Custom styling
│   └── main.js             # JavaScript logic and chart rendering
```

## 🧠 Developer Notes
Yahoo Finance is rate-limited — all requests are serialized and retried politely.

The frontend is fully static — no build step or JavaScript framework needed.

ML model predictions support ARIMA, XGBoost, RandomForest, etc.

## 📌 Updating Dependencies
If you add new Python packages:

```bash
pip install <package>
pip freeze > backend/requirements.txt
Commit requirements.txt after every dependency change.
```

## 🧾 License
MIT (or specify your preferred license)
