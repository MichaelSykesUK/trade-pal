# 'TradePal' Financial Markets Application

This guide will help you set up and run the application, which consists of a backend API and a frontend user interface.

## Prerequisites

- **Python 3.8+**
- **Node.js 14+** (includes npm)
- **Virtual Environment (Recommended)**

---

## Setup

### 1. Create a Virtual Environment (Recommended)
```bash
python -m venv venv
source venv/bin/activate  # Linux/MacOS
venv\Scripts\activate   # Windows
```

### 2. Install Backend Dependencies
```bash
pip install -r backend/requirements.txt
```

### 3. Install Node.js Packages
```bash
cd frontend
npm install
```

### 2. Run the Project
```bash
cd ..
python backend/api.py
```
By default, the backend will be available at `http://127.0.0.1:8000`.
`

---

## Testing the Application
1. Start both the backend and frontend servers.
2. Open a browser and navigate to `http://127.0.0.1:8080`.
3. Test API interactions through the user interface.

---

## File Structure
```
/doc-query-app
  |-- backend/                  # Backend project directory
      |-- tools.py              # Backend tools
      |-- api.py                # Backend API script
      |-- requirements.txt      # Python dependencies
  |-- frontend/                 # Frontend project directory
      |-- package.json          # Node.js dependencies
      |-- package-lock.json     # Node.js dependencies lock
      |-- index.html            # Index HTML
      |-- main.js               # JavaScript
      |-- style.css             # Styles for frontend
```

---

## Notes
- Keep `requirements.txt` and `package.json` updated.
- For new Python packages, run:
  ```bash
  pip freeze > requirements.txt
  ```
- For new Node.js packages, run:
  ```bash
  npm install <package> --save
  ```
- Always commit both `requirements.txt` and `package-lock.json` to version control.

This setup guide ensures a smooth deployment and consistent development experience for your application.