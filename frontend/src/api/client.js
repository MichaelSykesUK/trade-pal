function buildUrl(apiBase, path) {
  return `${apiBase}${path}`
}

async function requestJson(apiBase, path, options = {}) {
  const resp = await fetch(buildUrl(apiBase, path), options)
  const payload = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(payload.detail || resp.statusText)
  }
  return payload
}

export function fetchTickerBundle(apiBase, { ticker, period, interval, signal }) {
  const path = `/bundle/${encodeURIComponent(ticker)}?period=${period}&interval=${interval}&include_news=0`
  return requestJson(apiBase, path, { signal })
}

export function fetchNews(apiBase, { ticker, signal }) {
  const path = `/news/${encodeURIComponent(ticker)}`
  return requestJson(apiBase, path, { signal })
}

export function getWatchlist(apiBase) {
  return requestJson(apiBase, '/config/watchlist')
}

export function saveWatchlist(apiBase, tickers) {
  return requestJson(apiBase, '/config/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickers }),
  })
}

export function fetchSnapshots(apiBase, tickers, sparklinePeriod) {
  const params = new URLSearchParams()
  if (sparklinePeriod) {
    params.set('sparkline_period', sparklinePeriod)
  }
  const path = params.toString() ? `/watchlist_data/batch?${params.toString()}` : '/watchlist_data/batch'
  return requestJson(apiBase, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickers }),
  })
}

export function fetchScreener(apiBase, { metric, order, refresh }) {
  const params = new URLSearchParams({
    metric,
    order,
    limit: '0',
    refresh: refresh ? '1' : '0',
  })
  return requestJson(apiBase, `/screener/sp500?${params.toString()}`)
}

export function fetchMlModels(apiBase) {
  return requestJson(apiBase, '/ml/models')
}

export function runMl(apiBase, { ticker, period, interval, model, days, features, refresh, arimaOrder, scalerType }) {
  const params = new URLSearchParams({
    period,
    interval,
    model,
    pre_days: String(days),
    features: JSON.stringify(features),
  })
  if (refresh) {
    params.set('refresh', '1')
  }
  if (arimaOrder) {
    params.set('arima_order', arimaOrder)
  }
  if (scalerType) {
    params.set('scaler_type', scalerType)
  }
  return requestJson(apiBase, `/ml/${encodeURIComponent(ticker)}?${params.toString()}`)
}

export function fetchMacroSeries(apiBase) {
  return requestJson(apiBase, '/macro/series')
}

export function fetchMacroData(apiBase, { key, start, end, signal, refresh }) {
  const params = new URLSearchParams({
    keys: key,
    start,
    end,
  })
  if (refresh) {
    params.set('refresh', '1')
  }
  return requestJson(apiBase, `/macro/data?${params.toString()}`, { signal })
}
