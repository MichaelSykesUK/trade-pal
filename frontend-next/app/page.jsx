'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_TICKER = 'AAPL'
const DEFAULT_WATCHLIST = ['AAPL']
const MARKET_INDEXES = [
  { ticker: '^GSPC', label: 'S&P 500' },
  { ticker: '^IXIC', label: 'Nasdaq Composite' },
  { ticker: '^DJI', label: 'Dow Jones Industrial Average' },
]

const TIMEFRAMES = [
  { label: '1D', value: '1D', interval: '30m' },
  { label: '5D', value: '5D', interval: '1h' },
  { label: '1M', value: '1M', interval: '1d' },
  { label: '6M', value: '6M', interval: '1d' },
  { label: 'YTD', value: 'YTD', interval: '1d' },
  { label: '1Y', value: '1Y', interval: '1d' },
  { label: '5Y', value: '5Y', interval: '1wk' },
  { label: 'MAX', value: 'MAX', interval: '1mo' },
]
const CANDLE_INTERVALS = [
  { key: 'auto', label: 'Auto', value: null },
  { key: '1d', label: '1D', value: '1d' },
  { key: '1w', label: '1W', value: '1wk' },
  { key: '1m', label: '1M', value: '1mo' },
  { key: '3m', label: '3M', value: '3mo' },
]

const PRICE_OVERLAYS = [
  { key: 'MA50', label: 'MA(50)', color: '#eb4c34' },
  { key: 'MA200', label: 'MA(200)', color: '#1f77b4' },
  { key: 'Bollinger_MA', label: 'Bollinger MA', color: '#f9b115' },
]

const LOWER_INDICATORS = [
  { key: 'ma50', label: 'MA(50)', series: [{ key: 'MA50', color: '#f97316' }] },
  { key: 'ma100', label: 'MA(100)', series: [{ key: 'MA100', color: '#d946ef' }] },
  { key: 'ma150', label: 'MA(150)', series: [{ key: 'MA150', color: '#0ea5e9' }] },
  { key: 'ma200', label: 'MA(200)', series: [{ key: 'MA200', color: '#1d4ed8' }] },
  {
    key: 'bollinger',
    label: 'Bollinger Bands',
    series: [
      { key: 'Bollinger_MA', color: '#f59e0b' },
      { key: 'Upper_Band', color: '#f472b6' },
      { key: 'Lower_Band', color: '#38bdf8' },
    ],
  },
  { key: 'rsi', label: 'RSI', series: [{ key: 'RSI', color: '#10b981' }] },
  { key: 'obv', label: 'OBV', series: [{ key: 'OBV', color: '#6366f1' }] },
  { key: 'atr', label: 'ATR', series: [{ key: 'ATR', color: '#a855f7' }] },
  {
    key: 'macd',
    label: 'MACD',
    series: [
      { key: 'MACD', color: '#ef4444' },
      { key: 'MACD_Signal', color: '#facc15' },
    ],
  },
  { key: 'volatility', label: 'Volatility', series: [{ key: 'Volatility', color: '#0ea5e9' }] },
  { key: 'momentum', label: 'Momentum', series: [{ key: 'Momentum', color: '#fb7185' }] },
]

const ML_FEATURES = [
  { key: 'ma50', label: 'MA(50)' },
  { key: 'ma100', label: 'MA(100)' },
  { key: 'ma150', label: 'MA(150)' },
  { key: 'ma200', label: 'MA(200)' },
  { key: 'bollinger', label: 'Bollinger Bands' },
  { key: 'rsi', label: 'RSI' },
  { key: 'obv', label: 'OBV' },
  { key: 'atr', label: 'ATR' },
  { key: 'macd', label: 'MACD' },
  { key: 'volatility', label: 'Volatility' },
  { key: 'momentum', label: 'Momentum' },
]

const ML_DAYS = [5, 20, 60, 120]
const SCREENER_METRICS = [
  { key: 'freeCashflow', label: 'Free Cash Flow' },
  { key: 'fcfYield', label: 'FCF Yield' },
  { key: 'operatingCashflow', label: 'Operating Cash Flow' },
  { key: 'profitMargin', label: 'Profit Margin' },
  { key: 'returnOnEquity', label: 'ROE' },
  { key: 'debtToEquity', label: 'Debt / Equity' },
  { key: 'marketCap', label: 'Market Cap' },
]
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'

export default function Home() {
  const [selectedTicker, setSelectedTicker] = useState(DEFAULT_TICKER)
  const [period, setPeriod] = useState('1Y')
  const [darkMode, setDarkMode] = useState(false)
  const [intervalOverride, setIntervalOverride] = useState(null)

  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST)
  const [snapshots, setSnapshots] = useState({})
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchError, setBatchError] = useState('')
  const [screenerRows, setScreenerRows] = useState([])
  const [screenerLoading, setScreenerLoading] = useState(false)
  const [screenerError, setScreenerError] = useState('')
  const [screenerMetric, setScreenerMetric] = useState('freeCashflow')
  const [screenerRemaining, setScreenerRemaining] = useState(0)
  const [screenerComplete, setScreenerComplete] = useState(false)
  const [screenerRequested, setScreenerRequested] = useState(false)

  const [tickerData, setTickerData] = useState(null)
  const [indicators, setIndicators] = useState(null)
  const [kpi, setKpi] = useState(null)
  const [news, setNews] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [bundleReady, setBundleReady] = useState(false)
  const tickerFetchRef = useRef(null)
  const newsFetchRef = useRef(null)
  const newsDelayRef = useRef(null)
  const initialLoadRef = useRef(true)

  const [{ mlSeries, mlLoading, mlError }, setMlState] = useState({
    mlSeries: [],
    mlLoading: false,
    mlError: '',
  })
  const [mlModels, setMlModels] = useState([])

  const baseInterval = useMemo(
    () => TIMEFRAMES.find((item) => item.value === period)?.interval || '1d',
    [period],
  )
  const interval = intervalOverride || baseInterval

  const fetchTickerData = useCallback(
    async (ticker, frame) => {
      if (!ticker) return
      if (tickerFetchRef.current) {
        tickerFetchRef.current.abort()
      }
      if (newsFetchRef.current) {
        newsFetchRef.current.abort()
      }
      if (newsDelayRef.current) {
        clearTimeout(newsDelayRef.current)
        newsDelayRef.current = null
      }
      const controller = new AbortController()
      tickerFetchRef.current = controller
      setDataLoading(true)
      setDataError('')
      try {
        const resp = await fetch(
          `${API_BASE}/bundle/${encodeURIComponent(ticker)}?period=${frame}&interval=${interval}&include_news=0`,
          { signal: controller.signal },
        )
        const payload = await resp.json().catch(() => ({}))
        if (!resp.ok) {
          throw new Error(payload.detail || resp.statusText)
        }
        const newsDelay = initialLoadRef.current ? 1200 : 600
        setTickerData(transformStockResponse(payload.stock || {}))
        setIndicators(payload.indicators || null)
        setKpi(payload.kpi || null)
        if (initialLoadRef.current) initialLoadRef.current = false
        newsDelayRef.current = setTimeout(async () => {
          const newsController = new AbortController()
          newsFetchRef.current = newsController
          try {
            const newsRes = await fetch(`${API_BASE}/news/${encodeURIComponent(ticker)}`, {
              signal: newsController.signal,
            })
            const newsJson = await newsRes.json().catch(() => [])
            if (newsRes.ok) {
              setNews(Array.isArray(newsJson) ? newsJson : [])
            }
          } catch (err) {
            if (err.name !== 'AbortError') {
              // ignore transient news errors
            }
          } finally {
            if (newsFetchRef.current === newsController) {
              newsFetchRef.current = null
            }
          }
        }, newsDelay)
      } catch (err) {
        if (err.name === 'AbortError') return
        setDataError(err.message || 'Unable to load ticker data.')
      } finally {
        if (tickerFetchRef.current === controller) {
          tickerFetchRef.current = null
        }
        setDataLoading(false)
        setBundleReady(true)
      }
    },
    [interval],
  )

  const fetchSnapshots = useCallback(async () => {
    const tickers = Array.from(
      new Set([...MARKET_INDEXES.map((ix) => ix.ticker), ...watchlist.map((w) => w.toUpperCase())]),
    )
    if (!tickers.length) return
    setBatchLoading(true)
    setBatchError('')
    try {
      const resp = await fetch(`${API_BASE}/watchlist_data/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        throw new Error(data.detail || resp.statusText)
      }
      setSnapshots(data)
    } catch (err) {
      setBatchError(err.message || 'Unable to load market data.')
    } finally {
      setBatchLoading(false)
    }
  }, [watchlist])

  const fetchScreener = useCallback(
    async ({ refresh = false } = {}) => {
      setScreenerRequested(true)
      setScreenerLoading(true)
      setScreenerError('')
      try {
        const params = new URLSearchParams({
          metric: screenerMetric,
          order: 'desc',
          limit: '20',
          refresh: refresh ? '1' : '0',
        })
        const resp = await fetch(`${API_BASE}/screener/sp500?${params.toString()}`)
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok) {
          throw new Error(data.detail || resp.statusText)
        }
        setScreenerRows(Array.isArray(data.rows) ? data.rows : [])
        setScreenerRemaining(data.remaining || 0)
        setScreenerComplete(Boolean(data.complete))
      } catch (err) {
        setScreenerError(err.message || 'Unable to load screener.')
      } finally {
        setScreenerLoading(false)
      }
    },
    [screenerMetric],
  )

  const runMl = useCallback(
    async (config) => {
      if (!selectedTicker) return
      setMlState((prev) => ({ ...prev, mlLoading: true, mlError: '' }))
      try {
        const params = new URLSearchParams({
          period,
          interval,
          model: config.model,
          pre_days: String(config.days),
          features: JSON.stringify(config.features),
        })
        if (config.arimaOrder) {
          params.set('arima_order', config.arimaOrder)
        }
        const resp = await fetch(`${API_BASE}/ml/${encodeURIComponent(selectedTicker)}?${params.toString()}`)
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok) {
          throw new Error(data.detail || resp.statusText)
        }
        const projection = data.projected?.Date?.map((date, idx) => ({
          time: Math.floor(new Date(date).getTime() / 1000),
          value: data.projected.Predicted[idx],
        })) || []
        setMlState({ mlSeries: projection, mlLoading: false, mlError: '' })
      } catch (err) {
        setMlState({ mlSeries: [], mlLoading: false, mlError: err.message || 'ML run failed.' })
      }
    },
    [interval, period, selectedTicker],
  )

  const clearMl = useCallback(() => {
    setMlState({ mlSeries: [], mlLoading: false, mlError: '' })
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('tradepal:watchlist')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length) {
          setWatchlist(parsed)
        }
      } catch (_) {
        // ignore
      }
    }
    const storedTheme = localStorage.getItem('tradepal:theme')
    if (storedTheme === 'dark') {
      setDarkMode(true)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('tradepal:watchlist', JSON.stringify(watchlist))
  }, [watchlist])

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('tradepal:theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const snapshotKeyRef = useRef('')
  const snapshotDelayRef = useRef()
  useEffect(() => {
    if (!bundleReady) return
    const key = watchlist.join(',')
    if (typeof window !== 'undefined') {
      if (window.__TP_SNAPSHOT_KEY === key) return
      window.__TP_SNAPSHOT_KEY = key
    } else if (snapshotKeyRef.current === key) {
      return
    }
    snapshotKeyRef.current = key
    if (snapshotDelayRef.current) {
      clearTimeout(snapshotDelayRef.current)
    }
    const delayMs = initialLoadRef.current ? 3500 : 1400
    snapshotDelayRef.current = setTimeout(() => {
      fetchSnapshots()
    }, delayMs)
    return () => {
      if (snapshotDelayRef.current) {
        clearTimeout(snapshotDelayRef.current)
      }
    }
  }, [fetchSnapshots, watchlist, bundleReady])

  const tickerParamsRef = useRef('')
  useEffect(() => {
    const key = `${selectedTicker}-${period}`
    if (typeof window !== 'undefined') {
      if (window.__TP_TICKER_KEY === key) return
      window.__TP_TICKER_KEY = key
    } else if (tickerParamsRef.current === key) {
      return
    }
    tickerParamsRef.current = key
    fetchTickerData(selectedTicker, period)
    clearMl()
  }, [selectedTicker, period, fetchTickerData, clearMl])

  useEffect(() => {
    const loadModels = async () => {
      try {
        const resp = await fetch(`${API_BASE}/ml/models`)
        const data = await resp.json().catch(() => [])
        if (Array.isArray(data)) {
          setMlModels(data)
        }
      } catch (_) {
        setMlModels(['XGBoost', 'RandomForest', 'LinearRegression'])
      }
    }
    loadModels()
  }, [])

  const handleAddToWatchlist = useCallback((symbol) => {
    const cleaned = (symbol || '').trim().toUpperCase()
    if (!cleaned) return
    setWatchlist((prev) => (prev.includes(cleaned) ? prev : [...prev, cleaned]))
  }, [])

  const handleRemoveWatchlist = useCallback((symbol) => {
    setWatchlist((prev) => prev.filter((item) => item !== symbol))
  }, [])

  const groupedSnapshots = useMemo(
    () => ({
      watchlist: watchlist.map((ticker) => ({ ticker, snapshot: snapshots[ticker] })),
      markets: MARKET_INDEXES.map((ix) => ({ ...ix, snapshot: snapshots[ix.ticker] })),
    }),
    [snapshots, watchlist],
  )

  const chartData = tickerData
    ? {
      candles: tickerData.candles,
      volumes: tickerData.volumes,
    }
    : { candles: [], volumes: [] }

  return (
    <div className="app-shell">
      <Header
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        onSearch={(symbol) => setSelectedTicker(symbol)}
        onAddWatchlist={handleAddToWatchlist}
      />

      <div id="mainContainer">
        <Sidebar
          watchlistRows={groupedSnapshots.watchlist}
          marketRows={groupedSnapshots.markets}
          loading={batchLoading}
          error={batchError}
          onSelect={(symbol) => setSelectedTicker(symbol)}
          onRemove={handleRemoveWatchlist}
          onRefresh={fetchSnapshots}
          screenerRows={screenerRows}
          screenerLoading={screenerLoading}
          screenerError={screenerError}
          screenerMetric={screenerMetric}
          screenerRemaining={screenerRemaining}
          screenerComplete={screenerComplete}
          screenerRequested={screenerRequested}
          onScreenerMetricChange={setScreenerMetric}
          onScreenerLoad={fetchScreener}
        />

        <main className="main-content">
          <ChartPanel
            ticker={selectedTicker}
            period={period}
            onPeriodChange={setPeriod}
            intervalOverride={intervalOverride}
            onIntervalChange={setIntervalOverride}
            data={chartData}
            indicators={indicators}
            mlSeries={mlSeries}
            error={dataError}
            darkMode={darkMode}
          />
          <div className="panel-row">
            <KpiTable kpi={kpi} />
            <MlControls
              models={mlModels}
              loading={mlLoading}
              error={mlError}
              onRun={runMl}
              ticker={selectedTicker}
            />
          </div>
        </main>

        <aside className="news-column">
          <NewsList news={news} />
        </aside>
      </div>

      {(dataLoading || mlLoading) && <LoadingOverlay label={dataLoading ? 'Loading data...' : 'Running ML...'} />}
    </div>
  )
}

function Header({ darkMode, onToggleDarkMode, onSearch, onAddWatchlist }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([])
      return
    }
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const resp = await fetch(`${API_BASE}/autocomplete?q=${encodeURIComponent(query.trim())}`)
        const data = await resp.json().catch(() => ({}))
        setSuggestions(data.quotes?.slice(0, 7) || [])
      } catch (_) {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [query])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSearch(query.trim().toUpperCase())
    setSuggestions([])
  }

  return (
    <header id="topRibbon">
      <div id="topRibbonLeft">
        <form id="topSearchContainer" onSubmit={handleSubmit}>
          <input
            type="text"
            id="tickerSearch"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSearch(query.trim().toUpperCase())
                setSuggestions([])
              }
            }}
            placeholder="Search..."
          />
          <div
            id="searchClear"
            className="search-clear-btn"
            style={{ display: query ? 'block' : 'none' }}
            onClick={() => {
              setQuery('')
              setSuggestions([])
            }}
          >
            &times;
          </div>
          <div
            id="tickerSuggestions"
            className="autocomplete-suggestions"
            style={{ display: suggestions.length || loading ? 'block' : 'none' }}
          >
            {loading && <div className="suggestion-loading">Loading...</div>}
            {suggestions.map((item) => (
              <div
                key={item.symbol}
                className="suggestion-item"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSearch(item.symbol)
                  setQuery(item.symbol)
                  setSuggestions([])
                }}
              >
                {item.symbol}
                {item.shortname ? ` — ${item.shortname}` : ''}
              </div>
            ))}
          </div>
        </form>
      </div>
      <div id="topRibbonRight">
        <button className="secondary-btn" onClick={() => onAddWatchlist(query)}>
          + Watchlist
        </button>
        <button className="secondary-btn dark-mode-toggle" onClick={onToggleDarkMode}>
          {darkMode ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>
    </header>
  )
}

function Sidebar({
  watchlistRows,
  marketRows,
  loading,
  error,
  onSelect,
  onRemove,
  onRefresh,
  screenerRows,
  screenerLoading,
  screenerError,
  screenerMetric,
  screenerRemaining,
  screenerComplete,
  screenerRequested,
  onScreenerMetricChange,
  onScreenerLoad,
}) {
  return (
    <aside id="left-pane">
      <div className="watchlist-box">
        <div className="section-header">
          <h2>Watchlist</h2>
          <div className="watchlist-actions">
            <button className="secondary-btn" onClick={onRefresh} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>
        <div className="item-header">
          <span>Ticker</span>
          <span>Price</span>
          <span>Daily</span>
          <span>YTD</span>
          <span></span>
        </div>
        {error && <div className="sidebar-error">{error}</div>}
        <ul>
          {watchlistRows.length === 0 && <li className="item-row2">Add a ticker to start tracking it.</li>}
          {watchlistRows.map(({ ticker, snapshot }) => (
            <li key={ticker} className="item-container" onClick={() => onSelect(ticker)}>
              <WatchlistRow
                ticker={ticker}
                data={snapshot}
                extraActions={
                  <button
                    type="button"
                    className="remove-watchlist-btn"
                    aria-label={`Remove ${ticker}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(ticker)
                    }}
                  >
                    <TrashIcon />
                  </button>
                }
              />
            </li>
          ))}
        </ul>
      </div>
      <div className="market-box">
        <h2>Market Info</h2>
        <div className="item-header">
          <span>Ticker</span>
          <span>Price</span>
          <span>Daily</span>
          <span>YTD</span>
          <span></span>
        </div>
        <ul>
          {marketRows.map(({ ticker, snapshot, label }) => (
            <li key={ticker} className="item-container">
              <WatchlistRow ticker={ticker} data={snapshot} subtitle={label} />
            </li>
          ))}
        </ul>
      </div>
      <div className="screener-box">
        <div className="section-header">
          <h2>S&P 500 Screener</h2>
          <div className="watchlist-actions">
            <button
              className="secondary-btn"
              onClick={() => onScreenerLoad({ refresh: true })}
              disabled={screenerLoading}
            >
              {screenerRequested ? 'Refresh' : 'Load'}
            </button>
          </div>
        </div>
        <div className="screener-controls">
          <label>
            Metric
            <select value={screenerMetric} onChange={(e) => onScreenerMetricChange(e.target.value)}>
              {SCREENER_METRICS.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {metric.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {screenerError && <div className="sidebar-error">{screenerError}</div>}
        <ul>
          {!screenerRequested && <li className="item-row2">Click Load to fetch rankings.</li>}
          {screenerRequested && screenerRows.length === 0 && !screenerLoading && (
            <li className="item-row2">No screener data yet.</li>
          )}
          {screenerRows.map((row) => (
            <li key={row.ticker} className="item-container" onClick={() => onSelect(row.ticker)}>
              <div className="item-row1">
                <div className="item-col-ticker">{row.ticker}</div>
                <div className="item-col-price">{formatScreenerValue(screenerMetric, row.metricValue)}</div>
                <div className="item-col-daily">{row.exchange || '—'}</div>
                <div className="item-col-ytd">{row.companyName || 'Unknown'}</div>
                <div className="item-col-remove"></div>
              </div>
              <div className="item-row2">{row.sector || row.industry || '—'}</div>
            </li>
          ))}
        </ul>
        {screenerRequested && !screenerComplete && (
          <button className="secondary-btn" onClick={() => onScreenerLoad({ refresh: false })} disabled={screenerLoading}>
            {screenerLoading ? 'Loading…' : `Load more (${screenerRemaining} remaining)`}
          </button>
        )}
      </div>
    </aside>
  )
}

function WatchlistRow({ ticker, data, subtitle, extraActions }) {
  const payload =
    data || {
      companyName: subtitle || 'Loading…',
      currentPrice: 0,
      dailyChange: 0,
      dailyPct: 0,
      ytdChange: 0,
      ytdPct: 0,
    }
  const secondaryLine = subtitle
    ? subtitle
    : [data?.companyName, data?.exchange].filter(Boolean).join(' · ') || payload.companyName || 'Unknown'
  const dailySign = payload.dailyChange >= 0 ? '+' : ''
  const ytdSign = payload.ytdChange >= 0 ? '+' : ''

  return (
    <>
      <div className="item-row1">
        <div className="item-col-ticker">{ticker}</div>
        <div className="item-col-price">{formatNumber(payload.currentPrice)}</div>
        <div className={`item-col-daily ${payload.dailyChange >= 0 ? 'up' : 'down'}`}>
          {`${dailySign}${formatNumber(payload.dailyChange)} (${dailySign}${formatNumber(payload.dailyPct)}%)`}
        </div>
        <div className={`item-col-ytd ${payload.ytdChange >= 0 ? 'up' : 'down'}`}>
          {`${ytdSign}${formatNumber(payload.ytdChange)} (${ytdSign}${formatNumber(payload.ytdPct)}%)`}
        </div>
        <div className="item-col-remove">{extraActions}</div>
      </div>
      <div className="item-row2">{secondaryLine}</div>
    </>
  )
}

function ChartPanel({ ticker, period, onPeriodChange, intervalOverride, onIntervalChange, data, indicators, mlSeries, error, darkMode }) {
  const containerRef = useRef(null)
  const indicatorContainerRef = useRef(null)
  const chartRef = useRef(null)
  const indicatorChartRef = useRef(null)
  const overlaysRef = useRef({})
  const indicatorSeriesRef = useRef({})
  const mlSeriesRef = useRef(null)
  const [activeOverlays, setActiveOverlays] = useState(() => new Set(['MA50']))
  const [activeIndicators, setActiveIndicators] = useState(() => new Set(['rsi', 'macd']))
  const [chartsReady, setChartsReady] = useState(false)

  const zeroAutoscaleProvider = useCallback(
    (accessor) => () => {
      const maxValue = Math.max(accessor() ?? 0, 1)
      return {
        priceRange: {
          minValue: 0,
          maxValue,
        },
      }
    },
    [],
  )

  const theme = useMemo(
    () =>
      darkMode
        ? {
            bg: '#0f172a',
            panelBg: '#1f2b43',
            grid: '#24304a',
            text: '#e2e8f0',
            border: '#2c3a55',
            volColor: '#334155',
          }
        : {
            bg: '#fff',
            panelBg: '#fff',
            grid: '#f0f3fa',
            text: '#222',
            border: '#d1d4dc',
            volColor: '#d1d4dc',
          },
    [darkMode],
  )

  useEffect(() => {
    if (!containerRef.current || !indicatorContainerRef.current || !window.LightweightCharts) return

    containerRef.current.style.backgroundColor = theme.bg
    indicatorContainerRef.current.style.backgroundColor = theme.bg

    const chart = window.LightweightCharts.createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 420,
      layout: { backgroundColor: theme.bg, textColor: theme.text },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      timeScale: { borderColor: theme.border, visible: true, rightOffset: 12 },
      rightPriceScale: { borderColor: theme.border },
      leftPriceScale: { visible: true, borderColor: theme.border },
      crosshair: { mode: 1 },
      /* enable/align identical scroll/scale interactions so both charts behave the same */
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#4caf50',
      downColor: '#f44336',
      borderVisible: false,
      wickUpColor: '#4caf50',
      wickDownColor: '#f44336',
    })
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'left',
      scaleMargins: { top: 0.8, bottom: 0 },
      color: theme.volColor,
    })
    chartRef.current = { chart, candleSeries, volumeSeries, priceMax: 1, volumeMax: 1 }
    candleSeries.applyOptions({
      autoscaleInfoProvider: zeroAutoscaleProvider(() => chartRef.current?.priceMax ?? 1),
    })
    volumeSeries.applyOptions({
      autoscaleInfoProvider: zeroAutoscaleProvider(() => chartRef.current?.volumeMax ?? 1),
    })

    const indicatorChart = window.LightweightCharts.createChart(indicatorContainerRef.current, {
      width: indicatorContainerRef.current.clientWidth,
      height: 180,
      layout: { backgroundColor: theme.bg, textColor: theme.text },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      timeScale: { borderColor: theme.border, visible: true, rightOffset: 12 },
      rightPriceScale: { borderColor: theme.border },
      leftPriceScale: { visible: true, borderColor: theme.border },
      crosshair: { mode: 1 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    })
    indicatorSeriesRef.current = {}
    indicatorChartRef.current = indicatorChart

    // synchronize visible range between main and indicator charts
    const mainScale = chart.timeScale()
    const indicatorScale = indicatorChart.timeScale()
    let syncing = false
    const syncFromMain = () => {
      if (syncing) return
      const range = mainScale.getVisibleLogicalRange()
      if (!range) return
      syncing = true
      indicatorScale.setVisibleLogicalRange(range)
      syncing = false
    }
    const syncFromIndicator = () => {
      if (syncing) return
      const range = indicatorScale.getVisibleLogicalRange()
      if (!range) return
      syncing = true
      mainScale.setVisibleLogicalRange(range)
      syncing = false
    }
    mainScale.subscribeVisibleLogicalRangeChange(syncFromMain)
    indicatorScale.subscribeVisibleLogicalRangeChange(syncFromIndicator)

    setChartsReady(true)

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
      if (indicatorContainerRef.current) {
        indicatorChart.applyOptions({ width: indicatorContainerRef.current.clientWidth })
      }
    }
    const observer = new ResizeObserver(() => handleResize())
    observer.observe(containerRef.current)
    observer.observe(indicatorContainerRef.current)

    return () => {
      observer.disconnect()
      try {
        mainScale.unsubscribeVisibleLogicalRangeChange(syncFromMain)
      } catch (e) {}
      try {
        indicatorScale.unsubscribeVisibleLogicalRangeChange(syncFromIndicator)
      } catch (e) {}
      chart.remove()
      chartRef.current = null
      indicatorChart.remove()
      indicatorChartRef.current = null
      indicatorSeriesRef.current = {}
      setChartsReady(false)
    }
  }, [darkMode, theme, zeroAutoscaleProvider])

  useEffect(() => {
    if (!chartRef.current) return
    if (data.candles?.length) {
      chartRef.current.candleSeries.setData(data.candles)
      const priceMax = Math.max(
        ...data.candles.map((candle) =>
          Math.max(candle.open ?? 0, candle.high ?? 0, candle.low ?? 0, candle.close ?? 0),
        ),
        1,
      )
      chartRef.current.priceMax = Number.isFinite(priceMax) ? priceMax : 1
    } else {
      chartRef.current.candleSeries.setData([])
      chartRef.current.priceMax = 1
    }

    if (data.volumes?.length) {
      chartRef.current.volumeSeries.setData(data.volumes)
      const volumeMax = Math.max(...data.volumes.map((v) => v.value ?? 0), 1)
      chartRef.current.volumeMax = Number.isFinite(volumeMax) ? volumeMax : 1
    } else {
      chartRef.current.volumeSeries.setData([])
      chartRef.current.volumeMax = 1
    }
  }, [data])

  useEffect(() => {
    if (!chartRef.current) return
    Object.entries(overlaysRef.current).forEach(([key, series]) => {
      if (!activeOverlays.has(key)) {
        chartRef.current.chart.removeSeries(series)
        delete overlaysRef.current[key]
      }
    })
    activeOverlays.forEach((key) => {
      if (!indicators || !indicators[key]) return
      const values = buildOverlaySeries(indicators, key)
      if (!values.length) return
      if (!overlaysRef.current[key]) {
        overlaysRef.current[key] = chartRef.current.chart.addLineSeries({
          color: PRICE_OVERLAYS.find((o) => o.key === key)?.color || '#888',
          lineWidth: 2,
        })
      }
      overlaysRef.current[key].setData(values)
    })
  }, [activeOverlays, indicators])

  useEffect(() => {
    if (!chartRef.current) return
    if (mlSeriesRef.current) {
      chartRef.current.chart.removeSeries(mlSeriesRef.current)
      mlSeriesRef.current = null
    }
    if (mlSeries?.length) {
      mlSeriesRef.current = chartRef.current.chart.addLineSeries({
        color: '#aa00ff',
        lineWidth: 2,
      })
      mlSeriesRef.current.setData(mlSeries)
    }
  }, [mlSeries])

  useEffect(() => {
    if (!indicatorChartRef.current) return
    if (!indicators?.Date?.length) {
      Object.values(indicatorSeriesRef.current).forEach((series) => {
        series.setData([])
      })
      return
    }
    const chart = indicatorChartRef.current
    const nextIds = new Set()

    LOWER_INDICATORS.forEach((indicator) => {
      if (!activeIndicators.has(indicator.key)) return
      const scaleId = `scale-${indicator.key}`
      indicator.series.forEach((seriesConfig, idx) => {
        const seriesId = `${indicator.key}-${seriesConfig.key}-${idx}`
        nextIds.add(seriesId)
        if (!indicatorSeriesRef.current[seriesId]) {
          indicatorSeriesRef.current[seriesId] = chart.addLineSeries({
            color: seriesConfig.color || indicator.color || '#888',
            lineWidth: seriesConfig.lineWidth || 2,
            priceScaleId: scaleId,
          })
        }
        const seriesData = buildOverlaySeries(indicators, seriesConfig.key)
        indicatorSeriesRef.current[seriesId].setData(seriesData)
      })
    })

    Object.entries(indicatorSeriesRef.current).forEach(([seriesId, series]) => {
      if (!nextIds.has(seriesId)) {
        chart.removeSeries(series)
        delete indicatorSeriesRef.current[seriesId]
      }
    })
  }, [activeIndicators, indicators])

  // chart sync is attached directly in the creation effect so that
  // subscriptions are always rebound when charts are recreated.

  return (
    <section className="panel chart-panel">
      <div className="panel-header">
        <div>
          <h2>{ticker}</h2>
          <p className="panel-subtitle">Interactive chart with overlays & ML projections</p>
        </div>
        <div className="timeframe-controls">
          {TIMEFRAMES.map((item) => (
            <button
              key={item.value}
              className={`timeframe-btn ${item.value === period ? 'active' : ''}`}
              onClick={() => onPeriodChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="interval-controls">
          {CANDLE_INTERVALS.map((item) => (
            <button
              key={item.key}
              className={`timeframe-btn ${item.value === intervalOverride ? 'active' : ''}`}
              onClick={() => onIntervalChange(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="panel-error">{error}</div>}
      {!error && (!data.candles || data.candles.length === 0) && (
        <div className="panel-error">No data available for {ticker} in period {period}.</div>
      )}
      <div className="chart-container" ref={containerRef} />
      <div className="chart-controls">
        <div className="overlay-controls">
          <span className="control-label">Price overlays:</span>
          {PRICE_OVERLAYS.map((overlay) => (
            <label key={overlay.key}>
              <input
                type="checkbox"
                checked={activeOverlays.has(overlay.key)}
                onChange={() => {
                  setActiveOverlays((prev) => {
                    const next = new Set(prev)
                    if (next.has(overlay.key)) {
                      next.delete(overlay.key)
                    } else {
                      next.add(overlay.key)
                    }
                    return next
                  })
                }}
              />
              {overlay.label}
            </label>
          ))}
        </div>
        <div className="overlay-controls">
          <span className="control-label">Lower indicators:</span>
          {LOWER_INDICATORS.map((indicator) => (
            <label key={indicator.key}>
              <input
                type="checkbox"
                checked={activeIndicators.has(indicator.key)}
                onChange={() =>
                  setActiveIndicators((prev) => {
                    const next = new Set(prev)
                    if (next.has(indicator.key)) next.delete(indicator.key)
                    else next.add(indicator.key)
                    return next
                  })
                }
              />
              {indicator.label}
            </label>
          ))}
        </div>
      </div>
      <div className="indicator-chart" ref={indicatorContainerRef} />
    </section>
  )
}

function KpiTable({ kpi }) {
  if (!kpi) {
    return (
      <section className="panel kpi-panel">
        <h3>KPI</h3>
        <p>Loading company metrics…</p>
      </section>
    )
  }
  return (
    <section className="panel kpi-panel">
      <h3>Key Metrics</h3>
      <table>
        <tbody>
          <tr>
            <th>Company</th>
            <td>{kpi.companyName}</td>
            <th>Exchange</th>
            <td>{kpi.exchange}</td>
          </tr>
          <tr>
            <th>Previous Close</th>
            <td>{formatNumber(kpi.previousClose)}</td>
            <th>Open</th>
            <td>{formatNumber(kpi.openPrice)}</td>
          </tr>
          <tr>
            <th>Day&apos;s Range</th>
            <td>{kpi.daysRange}</td>
            <th>52W Range</th>
            <td>{kpi.weekRange}</td>
          </tr>
          <tr>
            <th>P/E</th>
            <td>{kpi.peRatio}</td>
            <th>Forward P/E</th>
            <td>{kpi.forwardPE}</td>
          </tr>
          <tr>
            <th>Market Cap</th>
            <td>{formatLargeNumber(kpi.marketCap)}</td>
            <th>Beta</th>
            <td>{kpi.beta}</td>
          </tr>
          <tr>
            <th>Free Cash Flow</th>
            <td>{formatLargeNumber(kpi.freeCashflow)}</td>
            <th>Operating Cash Flow</th>
            <td>{formatLargeNumber(kpi.operatingCashflow)}</td>
          </tr>
          <tr>
            <th>FCF Yield</th>
            <td>{formatPercent(kpi.fcfYield)}</td>
            <th>Current Ratio</th>
            <td>{formatNumber(kpi.currentRatio)}</td>
          </tr>
          <tr>
            <th>Total Cash</th>
            <td>{formatLargeNumber(kpi.totalCash)}</td>
            <th>Total Debt</th>
            <td>{formatLargeNumber(kpi.totalDebt)}</td>
          </tr>
          <tr>
            <th>Debt / Equity</th>
            <td>{formatNumber(kpi.debtToEquity)}</td>
            <th>Revenue</th>
            <td>{formatLargeNumber(kpi.totalRevenue)}</td>
          </tr>
          <tr>
            <th>EBITDA</th>
            <td>{formatLargeNumber(kpi.ebitda)}</td>
            <th>Profit Margin</th>
            <td>{formatPercent(kpi.profitMargin)}</td>
          </tr>
          <tr>
            <th>ROE</th>
            <td>{formatPercent(kpi.returnOnEquity)}</td>
            <th>ROA</th>
            <td>{formatPercent(kpi.returnOnAssets)}</td>
          </tr>
          <tr>
            <th>Dividend</th>
            <td>{formatNumber(kpi.dividend)}</td>
            <th>EPS</th>
            <td>{formatNumber(kpi.eps)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function MlControls({ models, loading, error, onRun, ticker }) {
  const [model, setModel] = useState(models[0] || 'XGBoost')
  const [days, setDays] = useState(20)
  const [arimaOrder, setArimaOrder] = useState('5,1,0')
  const [features, setFeatures] = useState(() => {
    const initial = {}
    ML_FEATURES.forEach((f) => {
      initial[f.key] = true
    })
    return initial
  })

  useEffect(() => {
    if (models.length) {
      setModel(models[0])
    }
  }, [models])

  return (
    <section className="panel ml-panel">
      <h3>ML Projections</h3>
      <div className="form-row">
        <label>
          Method
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Days
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {ML_DAYS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
        {model === 'ARIMA' && (
          <label>
            ARIMA (p,d,q)
            <input
              type="text"
              value={arimaOrder}
              onChange={(e) => setArimaOrder(e.target.value)}
              placeholder="5,1,0"
            />
          </label>
        )}
      </div>
      <div className="ml-features">
        {ML_FEATURES.map((feature) => (
          <label key={feature.key}>
            <input
              type="checkbox"
              checked={features[feature.key]}
              onChange={() =>
                setFeatures((prev) => ({
                  ...prev,
                  [feature.key]: !prev[feature.key],
                }))
              }
            />
            {feature.label}
          </label>
        ))}
      </div>
      {error && <div className="panel-error">{error}</div>}
      <button
        className="primary-btn"
        disabled={loading}
        onClick={() => {
          if (model !== 'ARIMA' && !Object.values(features).some(Boolean)) {
            alert('Select at least one feature')
            return
          }
          onRun({ model, days, features, arimaOrder })
        }}
      >
        {loading ? 'Running…' : `Run ML for ${ticker}`}
      </button>
    </section>
  )
}

function NewsList({ news }) {
  return (
    <section className="panel news-panel">
      <div className="panel-header">
        <h3>Related News</h3>
      </div>
      {(!news || news.length === 0) && <p>No news articles found.</p>}
      <div className="news-list">
        {news.slice(0, 8).map((article) => {
          const timestamp = article.providerPublishTime
            ? article.providerPublishTime * 1000
            : article.published
            ? Date.parse(article.published)
            : null
          const published = timestamp ? new Date(timestamp) : null
          const thumb =
            article.thumbnail?.resolutions?.[0]?.url ||
            article.image ||
            '/static/icons/yahoo-news.jpg'
          return (
            <article key={article.link || article.title} className="news-card">
              <a href={article.link || '#'} target="_blank" rel="noreferrer">
                <div className="news-thumb">
                  <img src={thumb} alt={article.title || 'News image'} />
                </div>
                <div className="news-body">
                  <h4>{article.title}</h4>
                  <p>{article.publisher || 'Yahoo Finance'}</p>
                  <span>{published ? published.toLocaleString() : ''}</span>
                </div>
              </a>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function LoadingOverlay({ label }) {
  return (
    <div className="loading-overlay">
      <div className="loading-spinner" />
      <p>{label}</p>
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M5 6h10l-.7 10.4A2 2 0 0 1 12.3 18H7.7a2 2 0 0 1-1.99-1.6L5 6Zm2-3h6l1 2H6l1-2Zm1 0V2h4v1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function transformStockResponse(payload) {
  if (!payload?.Date?.length) return { candles: [], volumes: [] }
  const candles = payload.Date.map((date, idx) => ({
    time: Math.floor(new Date(date).getTime() / 1000),
    open: Number(payload.Open[idx]),
    high: Number(payload.High[idx]),
    low: Number(payload.Low[idx]),
    close: Number(payload.Close[idx]),
  }))
  const volumes = payload.Date.map((date, idx) => ({
    time: Math.floor(new Date(date).getTime() / 1000),
    value: Number(payload.Volume[idx] || 0),
    color:
      Number(payload.Close[idx]) >= Number(payload.Open[idx]) ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)',
  }))
  return { candles, volumes }
}

function buildOverlaySeries(indicators, key) {
  if (!indicators?.Date) return []
  const series = indicators[key]
  if (!series) return []
  return indicators.Date.map((date, idx) => {
    const value = series[idx]
    if (value === null || value === undefined) return null
    return {
      time: Math.floor(new Date(date).getTime() / 1000),
      value: Number(value),
    }
  }).filter(Boolean)
}

function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return value ?? 'N/A'
  return value.toFixed(2)
}

function formatLargeNumber(value) {
  if (typeof value !== 'number') return value || 'N/A'
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  return `${(value / 1e3).toFixed(1)}K`
}

function formatPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return value ?? 'N/A'
  const pct = Math.abs(value) <= 1 ? value * 100 : value
  return `${pct.toFixed(2)}%`
}

function formatScreenerValue(metric, value) {
  if (metric === 'profitMargin' || metric === 'returnOnEquity' || metric === 'returnOnAssets' || metric === 'fcfYield') {
    return formatPercent(value)
  }
  if (metric === 'marketCap' || metric === 'freeCashflow' || metric === 'operatingCashflow' || metric === 'totalRevenue') {
    return formatLargeNumber(value)
  }
  return formatNumber(value)
}
