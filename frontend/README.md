TradePal frontend (Next.js)
===========================

The frontend is a full React/Next.js 14 experience: header, sidebar, chart,
market data, KPIs, and the ML controls are implemented as components while the
backend continues to expose FastAPI endpoints.

## Getting started

```bash
cd frontend
npm install
npm run dev          # dev server on http://localhost:3000
npm run build        # production build
npm run start        # serve .next build
```

## API base URL

API requests are routed to `process.env.NEXT_PUBLIC_API_BASE` (default:
`http://localhost:8000`). Create a `.env.local` file if you deploy the backend
somewhere else.

```env
NEXT_PUBLIC_API_BASE=https://your-backend-host
```

`_app.jsx` injects that value into `window.TRADEPAL_API_BASE`, which the legacy
`public/static/main.js` script reads before making requests.

## Architecture

- `pages/index.jsx` wires together the header, watchlist sidebar, chart panel,
  KPI table, ML controls, and news feed.
- `styles/globals.css` contains all styling (legacy CSS has been removed).
- Lightweight Charts is loaded globally in `_app.jsx` and used inside the
  `ChartPanel` component.
