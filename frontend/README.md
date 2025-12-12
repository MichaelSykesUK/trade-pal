TradePal frontend (Next.js)
===========================

The legacy DOM/UI is now rendered through a minimal Next.js 14 app so you can
gradually convert features to React components.

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

## Legacy assets

- `pages/index.jsx` renders the original DOM structure so the script can keep running.
- `public/static/main.js` holds the legacy JavaScript bundle (loaded via `<Script>`).
- `public/static/style.css` contains the legacy CSS (served directly by Next).

Refactor those pieces into modern React components whenever you're ready.
