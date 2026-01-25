import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createChart } from 'lightweight-charts'

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
  { key: 'ma50', label: 'MA(50)', defaultOn: true },
  { key: 'ma100', label: 'MA(100)', defaultOn: false },
  { key: 'ma150', label: 'MA(150)', defaultOn: true },
  { key: 'ma200', label: 'MA(200)', defaultOn: false },
  { key: 'ema50', label: 'EMA(50)', defaultOn: false },
  { key: 'bollinger', label: 'Bollinger Bands', defaultOn: true },
  { key: 'rsi', label: 'RSI', defaultOn: true },
  { key: 'obv', label: 'OBV', defaultOn: true },
  { key: 'atr', label: 'ATR', defaultOn: false },
  { key: 'macd', label: 'MACD', defaultOn: true },
  { key: 'volatility', label: 'Volatility', defaultOn: false },
  { key: 'momentum', label: 'Momentum', defaultOn: true },
  { key: 'sp500_ret', label: 'S&P 500 (1D %)', defaultOn: false },
  { key: 'fed_funds', label: 'Fed Funds Rate', defaultOn: false },
  { key: 'dgs10', label: '10Y Treasury', defaultOn: false },
  { key: 'dgs2', label: '2Y Treasury', defaultOn: false },
  { key: 'yield_curve_10y_2y', label: 'Yield Curve (10Y-2Y)', defaultOn: false },
  { key: 'cpi_yoy', label: 'CPI YoY', defaultOn: false },
  { key: 'pce_yoy', label: 'PCE YoY', defaultOn: false },
  { key: 'vix_ret', label: 'VIX (1D %)', defaultOn: false },
  { key: 'wti_ret', label: 'WTI Oil (1D %)', defaultOn: false },
  { key: 'usd_ret', label: 'USD Broad (1D %)', defaultOn: false },
  { key: 'gold_ret', label: 'Gold (GLD, 1D %)', defaultOn: false },
  { key: 'silver_ret', label: 'Silver (SLV, 1D %)', defaultOn: false },
]

const ML_MODEL_ALLOWLIST = ['XGBoost', 'RandomForest', 'GBR']

const ML_DAYS = [5, 20, 60, 120]
const CHART_TYPES = [
  { key: 'candles', label: 'Candles' },
  { key: 'line', label: 'Line' },
  { key: 'area', label: 'Mountain' },
]
const CANDLE_INTERVALS = [
  { key: 'auto', label: 'Auto', value: null },
  { key: '1d', label: '1D', value: '1d' },
  { key: '1w', label: '1W', value: '1wk' },
  { key: '1m', label: '1M', value: '1mo' },
  { key: '3m', label: '3M', value: '3mo' },
]
const SCREENER_METRICS = [
  { key: 'fcfYield', label: 'FCF Yield', order: 'desc' },
  { key: 'fcfMargin', label: 'FCF Margin', order: 'desc' },
  { key: 'fcfToCapex', label: 'FCF / CapEx', order: 'desc' },
  { key: 'fcfPerShare', label: 'FCF / Share', order: 'desc' },
  { key: 'priceToFcf', label: 'P / FCF', order: 'asc' },
  { key: 'evToFcf', label: 'EV / FCF', order: 'asc' },
  { key: 'netDebtToEbitda', label: 'Net Debt / EBITDA', order: 'asc' },
  { key: 'debtToEquity', label: 'Debt / Equity', order: 'asc' },
  { key: 'interestCoverageEbit', label: 'Interest Coverage (EBIT)', order: 'desc' },
  { key: 'fcfConversion', label: 'FCF Conversion', order: 'desc' },
  { key: 'returnOnEquity', label: 'ROE', order: 'desc' },
  { key: 'operatingMargin', label: 'Operating Margin', order: 'desc' },
  { key: 'profitMargin', label: 'Profit Margin', order: 'desc' },
  { key: 'evToEbitda', label: 'EV / EBITDA', order: 'asc' },
  { key: 'trailingPE', label: 'P/E (TTM)', order: 'asc' },
  { key: 'forwardPE', label: 'P/E (Forward)', order: 'asc' },
  { key: 'pegRatio', label: 'PEG', order: 'asc' },
  { key: 'priceToBook', label: 'Price / Book', order: 'asc' },
  { key: 'priceToSales', label: 'Price / Sales', order: 'asc' },
  { key: 'freeCashflow', label: 'Free Cash Flow', order: 'desc' },
  { key: 'marketCap', label: 'Market Cap', order: 'desc' },
]
const SCREENER_COLUMNS = [
  { key: 'ticker', label: 'Ticker', type: 'text', sticky: true },
  { key: 'companyName', label: 'Company', type: 'text', sticky: true },
  { key: 'sector', label: 'Sector', type: 'text' },
  { key: 'marketCap', label: 'Mkt Cap', type: 'money' },
  { key: 'freeCashflow', label: 'FCF', type: 'money' },
  { key: 'fcfPerShare', label: 'FCF/Share', type: 'ratio' },
  { key: 'fcfYield', label: 'FCF Yield', type: 'percent' },
  { key: 'fcfMargin', label: 'FCF Margin', type: 'percent' },
  { key: 'capitalExpenditures', label: 'CapEx', type: 'money' },
  { key: 'fcfToCapex', label: 'FCF/CapEx', type: 'ratio' },
  { key: 'priceToFcf', label: 'P/FCF', type: 'ratio' },
  { key: 'evToFcf', label: 'EV/FCF', type: 'ratio' },
  { key: 'netDebtToEbitda', label: 'Net Debt/EBITDA', type: 'ratio' },
  { key: 'debtToEquity', label: 'Debt/Equity', type: 'ratio' },
  { key: 'interestCoverageEbit', label: 'Int Cov (EBIT)', type: 'ratio' },
  { key: 'interestCoverageCash', label: 'Int Cov (Cash)', type: 'ratio' },
  { key: 'fcfConversion', label: 'FCF Conv', type: 'percent' },
  { key: 'fcfConversionEbit', label: 'FCF/EBIT', type: 'percent' },
  { key: 'returnOnEquity', label: 'ROE', type: 'percent' },
  { key: 'evToEbitda', label: 'EV/EBITDA', type: 'ratio' },
  { key: 'trailingPE', label: 'P/E (TTM)', type: 'ratio' },
  { key: 'forwardPE', label: 'P/E (Fwd)', type: 'ratio' },
  { key: 'pegRatio', label: 'PEG', type: 'ratio' },
  { key: 'priceToBook', label: 'P/B', type: 'ratio' },
  { key: 'priceToSales', label: 'P/S', type: 'ratio' },
  { key: 'operatingMargin', label: 'Op Margin', type: 'percent' },
  { key: 'profitMargin', label: 'Profit Margin', type: 'percent' },
]
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const PRICE_SCALE_WIDTH = 60

function App() {
  const [selectedTicker, setSelectedTicker] = useState(DEFAULT_TICKER)
  const [period, setPeriod] = useState('1Y')
  const [darkMode, setDarkMode] = useState(false)
  const [intervalOverride, setIntervalOverride] = useState(null)

  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST)
  const [watchlistReady, setWatchlistReady] = useState(false)
  const [snapshots, setSnapshots] = useState({})
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchError, setBatchError] = useState('')
  const [screenerRows, setScreenerRows] = useState([])
  const [screenerLoading, setScreenerLoading] = useState(false)
  const [screenerError, setScreenerError] = useState('')
  const [screenerMetric, setScreenerMetric] = useState('fcfYield')
  const [screenerOrder, setScreenerOrder] = useState('desc')
  const [screenerOpen, setScreenerOpen] = useState(false)
  const [screenerSort, setScreenerSort] = useState({ key: 'fcfYield', direction: 'desc' })
  const [screenerQuery, setScreenerQuery] = useState('')
  const [screenerAutoFill, setScreenerAutoFill] = useState(false)
  const [screenerCooldown, setScreenerCooldown] = useState(0)
  const [screenerUniverse, setScreenerUniverse] = useState(0)
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

  const [
    { mlSeries, mlLoading, mlError, mlMetrics, mlValidation, mlModelUsed, mlRequestedModel, mlAutoRetrained, mlSearch, mlCached },
    setMlState,
  ] = useState({
    mlSeries: [],
    mlLoading: false,
    mlError: '',
    mlMetrics: null,
    mlValidation: null,
    mlModelUsed: null,
    mlRequestedModel: null,
    mlAutoRetrained: false,
    mlSearch: null,
    mlCached: false,
  })
  const [mlModels, setMlModels] = useState([])
  const [macroSeries, setMacroSeries] = useState([])
  const [macroKey, setMacroKey] = useState('sp500_ret')
  const [macroData, setMacroData] = useState(null)
  const [macroLoading, setMacroLoading] = useState(false)
  const [macroError, setMacroError] = useState('')

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
          order: screenerOrder,
          limit: '0',
          refresh: refresh ? '1' : '0',
        })
        const resp = await fetch(`${API_BASE}/screener/sp500?${params.toString()}`)
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok) {
          throw new Error(data.detail || resp.statusText)
        }
        const rows = Array.isArray(data.rows) ? data.rows : []
        setScreenerRows((prev) => {
          if (refresh) return rows
          const merged = new Map(prev.map((row) => [row.ticker, row]))
          rows.forEach((row) => {
            const existing = merged.get(row.ticker) || {}
            merged.set(row.ticker, { ...existing, ...row })
          })
          return Array.from(merged.values())
        })
        setScreenerRemaining(data.remaining || 0)
        setScreenerComplete(Boolean(data.complete))
        setScreenerUniverse(data.universeSize || 0)
        setScreenerCooldown(Number(data.cooldownSeconds || 0))
      } catch (err) {
        setScreenerError(err.message || 'Unable to load screener.')
      } finally {
        setScreenerLoading(false)
      }
    },
    [screenerMetric, screenerOrder],
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
        if (config.refresh) {
          params.set('refresh', '1')
        }
        if (config.arimaOrder) {
          params.set('arima_order', config.arimaOrder)
        }
        const resp = await fetch(`${API_BASE}/ml/${encodeURIComponent(selectedTicker)}?${params.toString()}`)
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok) {
          throw new Error(data.detail || resp.statusText)
        }
        const projection =
          data.projected?.Date?.map((date, idx) => ({
            time: Math.floor(new Date(date).getTime() / 1000),
            value: data.projected.Predicted[idx],
          })) || []
        setMlState({
          mlSeries: projection,
          mlLoading: false,
          mlError: '',
          mlMetrics: data.metrics || null,
          mlValidation: data.validation || null,
          mlModelUsed: data.model_used || config.model,
          mlRequestedModel: data.requested_model || config.model,
          mlAutoRetrained: Boolean(data.auto_retrained),
          mlSearch: data.search || null,
          mlCached: Boolean(data.cached),
        })
      } catch (err) {
        setMlState({
          mlSeries: [],
          mlLoading: false,
          mlError: err.message || 'ML run failed.',
          mlMetrics: null,
          mlValidation: null,
          mlModelUsed: null,
          mlRequestedModel: null,
          mlAutoRetrained: false,
          mlSearch: null,
          mlCached: false,
        })
      }
    },
    [interval, period, selectedTicker],
  )

  const clearMl = useCallback(() => {
    setMlState({
      mlSeries: [],
      mlLoading: false,
      mlError: '',
      mlMetrics: null,
      mlValidation: null,
      mlModelUsed: null,
      mlRequestedModel: null,
      mlAutoRetrained: false,
      mlSearch: null,
      mlCached: false,
    })
  }, [])

  useEffect(() => {
    const loadWatchlist = async () => {
      const saved = localStorage.getItem('tradepal:watchlist')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed) && parsed.length) {
            setWatchlist(parsed)
            setWatchlistReady(true)
            return
          }
        } catch (_) {}
      }
      try {
        const resp = await fetch(`${API_BASE}/config/watchlist`)
        const data = await resp.json().catch(() => ({}))
        if (resp.ok && Array.isArray(data.watchlist) && data.watchlist.length) {
          setWatchlist(data.watchlist)
          setWatchlistReady(true)
          return
        }
      } catch (_) {}
      setWatchlist(DEFAULT_WATCHLIST)
      setWatchlistReady(true)
    }
    loadWatchlist()

    const storedTheme = localStorage.getItem('tradepal:theme')
    if (storedTheme === 'dark') {
      setDarkMode(true)
    }
  }, [])

  useEffect(() => {
    if (!watchlistReady) return
    localStorage.setItem('tradepal:watchlist', JSON.stringify(watchlist))
  }, [watchlist, watchlistReady])

  useEffect(() => {
    if (!watchlistReady) return
    const handle = setTimeout(async () => {
      try {
        await fetch(`${API_BASE}/config/watchlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers: watchlist }),
        })
      } catch (_) {}
    }, 400)
    return () => clearTimeout(handle)
  }, [watchlist, watchlistReady])

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
          const filtered = data.filter((name) => ML_MODEL_ALLOWLIST.includes(name))
          setMlModels(filtered.length ? filtered : data)
        }
      } catch (_) {
        setMlModels(ML_MODEL_ALLOWLIST)
      }
    }
    loadModels()
  }, [])

  useEffect(() => {
    const loadMacroSeries = async () => {
      try {
        const resp = await fetch(`${API_BASE}/macro/series`)
        const data = await resp.json().catch(() => ({}))
        const series = Array.isArray(data.series) ? data.series : []
        setMacroSeries(series)
        if (series.length) {
          setMacroKey((prev) => {
            if (series.find((s) => s.key === prev)) return prev
            const preferred = series.find((s) => s.key === 'sp500_ret') || series[0]
            return preferred.key
          })
        }
      } catch (_) {
        setMacroSeries([])
      }
    }
    loadMacroSeries()
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

  const handleScreenerMetricChange = useCallback((metric) => {
    const meta = SCREENER_METRICS.find((item) => item.key === metric)
    const nextOrder = meta?.order || 'desc'
    setScreenerMetric(metric)
    setScreenerOrder(nextOrder)
    setScreenerSort({ key: metric, direction: nextOrder })
  }, [])

  const handleScreenerOrderChange = useCallback((order) => {
    setScreenerOrder(order)
    setScreenerSort((prev) => ({
      key: prev.key || screenerMetric,
      direction: order,
    }))
  }, [screenerMetric])

  const handleScreenerSort = useCallback((key) => {
    setScreenerSort((prev) => {
      if (prev.key === key) {
        const nextDir = prev.direction === 'asc' ? 'desc' : 'asc'
        return { key, direction: nextDir }
      }
      return { key, direction: 'desc' }
    })
  }, [])

  const screenerDisplayRows = useMemo(() => {
    const query = screenerQuery.trim().toLowerCase()
    let rows = Array.isArray(screenerRows) ? [...screenerRows] : []
    if (query) {
      rows = rows.filter((row) => {
        const haystack = `${row.ticker || ''} ${row.companyName || ''} ${row.sector || ''} ${row.industry || ''}`.toLowerCase()
        return haystack.includes(query)
      })
    }
    const sortKey = screenerSort.key || screenerMetric
    const direction = screenerSort.direction || screenerOrder
    rows.sort((a, b) => {
      const aVal = a?.[sortKey]
      const bVal = b?.[sortKey]
      const aNum = typeof aVal === 'number' && !Number.isNaN(aVal) ? aVal : null
      const bNum = typeof bVal === 'number' && !Number.isNaN(bVal) ? bVal : null
      if (aNum == null && bNum == null) {
        const aStr = typeof aVal === 'string' ? aVal.toLowerCase() : null
        const bStr = typeof bVal === 'string' ? bVal.toLowerCase() : null
        if (aStr == null && bStr == null) return 0
        if (aStr == null) return 1
        if (bStr == null) return -1
        return direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
      }
      if (aNum == null) return 1
      if (bNum == null) return -1
      return direction === 'asc' ? aNum - bNum : bNum - aNum
    })
    return rows
  }, [screenerRows, screenerQuery, screenerSort, screenerMetric, screenerOrder])

  useEffect(() => {
    if (!screenerAutoFill) return
    if (screenerComplete) {
      setScreenerAutoFill(false)
      return
    }
    if (screenerError) {
      setScreenerAutoFill(false)
      return
    }
    if (screenerLoading) return

    const delay = screenerCooldown > 0 ? screenerCooldown * 1000 + 500 : screenerRequested ? 6000 : 800
    const handle = setTimeout(() => {
      fetchScreener({ refresh: !screenerRequested })
    }, delay)
    return () => clearTimeout(handle)
  }, [screenerAutoFill, screenerComplete, screenerError, screenerLoading, screenerRequested, fetchScreener])

  const latestPrice = tickerData?.candles?.[tickerData.candles.length - 1]?.close ?? null
  const previousPrice = tickerData?.candles?.[tickerData.candles.length - 2]?.close ?? null
  const priceDelta = latestPrice != null && previousPrice != null ? latestPrice - previousPrice : null
  const priceDeltaPct =
    priceDelta != null && previousPrice ? (priceDelta / previousPrice) * 100 : null

  const chartData = tickerData
    ? {
        candles: tickerData.candles,
        volumes: tickerData.volumes,
      }
    : { candles: [], volumes: [] }

  const selectedMacroSpec = useMemo(
    () => macroSeries.find((item) => item.key === macroKey),
    [macroSeries, macroKey],
  )

  const macroOverlaySeries = useMemo(() => {
    if (!macroData?.Date?.length || !macroKey) return []
    const values = macroData[macroKey] || []
    const dates = macroData.Date
    if (!values.length || !dates.length) return []
    const points = []
    if (selectedMacroSpec?.transform === 'pct_change') {
      let index = 100
      for (let i = 0; i < dates.length; i += 1) {
        const raw = values[i]
        if (raw == null || Number.isNaN(raw)) continue
        index *= 1 + raw
        points.push({
          time: Math.floor(new Date(dates[i]).getTime() / 1000),
          value: index,
        })
      }
      return points
    }
    const first = values.find((val) => val != null && !Number.isNaN(val))
    if (first == null || first === 0) {
      for (let i = 0; i < dates.length; i += 1) {
        const raw = values[i]
        if (raw == null || Number.isNaN(raw)) continue
        points.push({
          time: Math.floor(new Date(dates[i]).getTime() / 1000),
          value: raw,
        })
      }
      return points
    }
    for (let i = 0; i < dates.length; i += 1) {
      const raw = values[i]
      if (raw == null || Number.isNaN(raw)) continue
      points.push({
        time: Math.floor(new Date(dates[i]).getTime() / 1000),
        value: (raw / first) * 100,
      })
    }
    return points
  }, [macroData, macroKey, selectedMacroSpec])

  const macroRange = useMemo(() => {
    if (!chartData.candles?.length) return null
    const start = new Date(chartData.candles[0].time * 1000).toISOString().slice(0, 10)
    const end = new Date(chartData.candles[chartData.candles.length - 1].time * 1000)
      .toISOString()
      .slice(0, 10)
    return { start, end }
  }, [chartData.candles])

  useEffect(() => {
    if (!macroKey || !macroRange?.start || !macroRange?.end) return
    const controller = new AbortController()
    const loadMacroData = async () => {
      setMacroLoading(true)
      setMacroError('')
      try {
        const params = new URLSearchParams({
          keys: macroKey,
          start: macroRange.start,
          end: macroRange.end,
        })
        const resp = await fetch(`${API_BASE}/macro/data?${params.toString()}`, {
          signal: controller.signal,
        })
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok) {
          throw new Error(data.detail || resp.statusText)
        }
        setMacroData(data.data || null)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setMacroError(err.message || 'Unable to load macro data.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setMacroLoading(false)
        }
      }
    }
    loadMacroData()
    return () => controller.abort()
  }, [macroKey, macroRange])

  return (
    <div className="app-shell">
      <Header
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        onSearch={(symbol) => setSelectedTicker(symbol)}
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
          screenerLoading={screenerLoading}
          screenerError={screenerError}
          screenerMetric={screenerMetric}
          screenerRequested={screenerRequested}
          screenerRemaining={screenerRemaining}
          onScreenerMetricChange={handleScreenerMetricChange}
          onScreenerLoad={fetchScreener}
          onOpenScreener={() => setScreenerOpen(true)}
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
            macroOverlay={macroOverlaySeries}
            macroOverlayLabel={selectedMacroSpec?.label || 'Macro'}
            error={dataError}
            darkMode={darkMode}
            kpi={kpi}
            priceSummary={{
              price: latestPrice,
              change: priceDelta,
              changePct: priceDeltaPct,
            }}
            onAddWatchlist={() => handleAddToWatchlist(selectedTicker)}
          />
          <div className="panel-row">
            <KpiTable kpi={kpi} />
            <MlControls
              models={mlModels}
              loading={mlLoading}
              error={mlError}
              onRun={runMl}
              ticker={selectedTicker}
              metrics={mlMetrics}
              validation={mlValidation}
              modelUsed={mlModelUsed}
              requestedModel={mlRequestedModel}
              autoRetrained={mlAutoRetrained}
              search={mlSearch}
              cached={mlCached}
            />
          </div>
          <div className="panel-row">
            <MacroPanel
              seriesOptions={macroSeries}
              selectedKey={macroKey}
              onSelectKey={setMacroKey}
              data={macroData}
              stockCandles={chartData.candles}
              loading={macroLoading}
              error={macroError}
              darkMode={darkMode}
              ticker={selectedTicker}
            />
          </div>
        </main>

        <aside className="news-column">
          <NewsList news={news} />
        </aside>
      </div>

        <ScreenerModal
          open={screenerOpen}
          rows={screenerDisplayRows}
          loading={screenerLoading}
          error={screenerError}
          metric={screenerMetric}
          order={screenerOrder}
          remaining={screenerRemaining}
          complete={screenerComplete}
          requested={screenerRequested}
          universeSize={screenerUniverse}
          autoFill={screenerAutoFill}
          cooldownSeconds={screenerCooldown}
          sortKey={screenerSort.key}
          sortDirection={screenerSort.direction}
          query={screenerQuery}
          onQueryChange={setScreenerQuery}
          onClose={() => setScreenerOpen(false)}
          onMetricChange={handleScreenerMetricChange}
          onOrderChange={handleScreenerOrderChange}
          onRefresh={() => fetchScreener({ refresh: true })}
          onLoadMore={() => fetchScreener({ refresh: false })}
          onToggleAutoFill={() => setScreenerAutoFill((prev) => !prev)}
          onSort={handleScreenerSort}
          onSelect={(ticker) => {
            setSelectedTicker(ticker)
            setScreenerOpen(false)
          }}
        />

      {(dataLoading || mlLoading) && (
        <LoadingOverlay label={dataLoading ? 'Loading data...' : 'Running ML...'} />
      )}
    </div>
  )
}

function Header({ darkMode, onToggleDarkMode, onSearch }) {
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
  screenerLoading,
  screenerError,
  screenerMetric,
  screenerRequested,
  screenerRemaining,
  onScreenerMetricChange,
  onScreenerLoad,
  onOpenScreener,
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
            <button className="secondary-btn" onClick={onOpenScreener}>
              Open
            </button>
          </div>
        </div>
        <div className="screener-controls">
          <label>
            Rank by
            <select value={screenerMetric} onChange={(e) => onScreenerMetricChange(e.target.value)}>
              {SCREENER_METRICS.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {metric.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="screener-summary">
          {!screenerRequested && <span>Load the table to start scouting undervalued names.</span>}
          {screenerRequested && screenerLoading && <span>Updating screener data…</span>}
          {screenerRequested && !screenerLoading && (
            <span>
              {screenerRemaining ? `${screenerRemaining} tickers left to fetch.` : 'Screener data ready.'}
            </span>
          )}
        </div>
        {screenerError && <div className="sidebar-error">{screenerError}</div>}
        <div className="screener-actions">
          <button
            className="secondary-btn"
            onClick={() => onScreenerLoad({ refresh: true })}
            disabled={screenerLoading}
          >
            {screenerRequested ? 'Refresh data' : 'Load data'}
          </button>
        </div>
      </div>
    </aside>
  )
}

function ScreenerModal({
  open,
  rows,
  loading,
  error,
  metric,
  order,
  remaining,
  complete,
  requested,
  universeSize,
  autoFill,
  cooldownSeconds,
  sortKey,
  sortDirection,
  query,
  onQueryChange,
  onClose,
  onMetricChange,
  onOrderChange,
  onRefresh,
  onLoadMore,
  onToggleAutoFill,
  onSort,
  onSelect,
}) {
  const columnStats = useMemo(() => {
    const stats = {}
    SCREENER_COLUMNS.forEach((col) => {
      if (col.type === 'text') return
      const values = rows
        .map((row) => row?.[col.key])
        .filter((value) => typeof value === 'number' && !Number.isNaN(value))
        .sort((a, b) => a - b)
      if (!values.length) return
      const hiIdx = Math.floor(values.length * 0.9)
      const loIdx = Math.floor(values.length * 0.1)
      stats[col.key] = {
        hi: values[Math.min(values.length - 1, hiIdx)],
        lo: values[Math.max(0, loIdx)],
      }
    })
    return stats
  }, [rows])

  if (!open) return null

  return (
    <div className="screener-modal">
      <div className="screener-backdrop" onClick={onClose} />
      <div className="screener-panel">
        <div className="screener-header">
          <div>
            <h2>S&P 500 Screener</h2>
            <p>
              Find undervalued candidates with multi-factor ratios and KPIs.
              {universeSize ? ` Universe: ${universeSize}.` : ''}
            </p>
          </div>
          <button className="secondary-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="screener-toolbar">
          <label>
            Rank by
            <select value={metric} onChange={(e) => onMetricChange(e.target.value)}>
              {SCREENER_METRICS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Order
            <select value={order} onChange={(e) => onOrderChange(e.target.value)}>
              <option value="desc">High → Low</option>
              <option value="asc">Low → High</option>
            </select>
          </label>
          <label className="screener-search">
            Filter
            <input
              type="text"
              placeholder="Ticker, company, sector…"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </label>
          <div className="screener-actions">
            <button className="secondary-btn" onClick={onRefresh} disabled={loading}>
              {requested ? 'Refresh' : 'Load'}
            </button>
            <button className="secondary-btn" onClick={onLoadMore} disabled={loading || complete}>
              {complete ? 'Fully loaded' : `Load more${remaining ? ` (${remaining} left)` : ''}`}
            </button>
            <button className={`secondary-btn ${autoFill ? 'active' : ''}`} onClick={onToggleAutoFill}>
              {autoFill ? 'Auto fill: On' : 'Auto fill: Off'}
            </button>
            {cooldownSeconds > 0 && <span className="cooldown-badge">Cooldown ~{cooldownSeconds}s</span>}
          </div>
        </div>

        {error && <div className="panel-error">{error}</div>}
        {!requested && !loading && <div className="panel-subtitle">Click Load to fetch screener data.</div>}
        {requested && (
          <div className="panel-subtitle">
            Loaded {rows.length} tickers{remaining ? `, ${remaining} remaining` : ''}.
            {autoFill ? ' Auto-fill is running.' : ''}
          </div>
        )}

        <div className="screener-table-wrap">
          <table className="screener-table">
            <thead>
              <tr>
                {SCREENER_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`${col.sticky ? 'sticky' : ''} ${col.type !== 'text' ? 'numeric' : ''} ${sortKey === col.key ? 'sorted' : ''}`}
                    onClick={() => onSort(col.key)}
                  >
                    <span>{col.label}</span>
                    {sortKey === col.key && (
                      <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={SCREENER_COLUMNS.length} className="empty">
                    {loading ? 'Loading rows…' : 'No screener rows to show yet.'}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.ticker} onClick={() => onSelect(row.ticker)}>
                  {SCREENER_COLUMNS.map((col) => {
                    const value = row?.[col.key]
                    const stats = columnStats[col.key]
                    const highlight =
                      col.type !== 'text' && typeof value === 'number'
                        ? value >= (stats?.hi ?? Infinity)
                          ? 'heat-high'
                          : value <= (stats?.lo ?? -Infinity)
                          ? 'heat-low'
                          : ''
                        : ''
                    return (
                      <td
                        key={col.key}
                        className={`${col.sticky ? 'sticky' : ''} ${col.type !== 'text' ? 'numeric' : ''} ${highlight}`}
                      >
                        {formatScreenerCell(col, value)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && <div className="panel-subtitle">Fetching more ticker fundamentals…</div>}
      </div>
    </div>
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

function MenuSelect({ label, valueLabel, options, selectedValue, onSelect, disabled, alignRight = false }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className={`menu-select ${alignRight ? 'menu-right' : ''}`} ref={menuRef}>
      <button
        type="button"
        className="secondary-btn menu-trigger"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <span className="menu-label">{label}:</span>
        <span className="menu-value">{valueLabel}</span>
        <span className="menu-caret">v</span>
      </button>
      {open && (
        <div className="menu-panel">
          {options.map((option) => {
            const selected = option.value === selectedValue
            return (
              <button
                key={`${label}-${String(option.value)}`}
                type="button"
                className={`menu-item ${selected ? 'selected' : ''}`}
                disabled={option.disabled}
                onClick={() => {
                  setOpen(false)
                  onSelect(option.value)
                }}
              >
                <span className={`menu-check ${selected ? 'on' : ''}`} aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ChartPanel({
  ticker,
  period,
  onPeriodChange,
  intervalOverride,
  onIntervalChange,
  data,
  indicators,
  mlSeries,
  macroOverlay,
  macroOverlayLabel,
  error,
  darkMode,
  kpi,
  priceSummary,
  onAddWatchlist,
}) {
  const containerRef = useRef(null)
  const indicatorContainerRef = useRef(null)
  const chartRef = useRef(null)
  const indicatorChartRef = useRef(null)
  const overlaysRef = useRef({})
  const indicatorSeriesRef = useRef({})
  const mlSeriesRef = useRef(null)
  const macroOverlayRef = useRef(null)
  const [activeOverlays, setActiveOverlays] = useState(() => new Set(['MA50']))
  const [leftIndicator, setLeftIndicator] = useState('rsi')
  const [rightIndicator, setRightIndicator] = useState('macd')
  const [chartType, setChartType] = useState('candles')
  const [patternsActive, setPatternsActive] = useState(false)
  const [macroOverlayActive, setMacroOverlayActive] = useState(false)
  const [indicatorChartReady, setIndicatorChartReady] = useState(false)
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(false)
  const overlayMenuRef = useRef(null)
  const barSpacing = useMemo(() => getBarSpacing(period, intervalOverride), [period, intervalOverride])
  const baseIntervalLabel = useMemo(() => {
    const found = TIMEFRAMES.find((item) => item.value === period)?.interval
    return found ? found.toUpperCase() : '1D'
  }, [period])

  const zeroBasedAutoscaleProvider = useCallback(
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
    const handleClick = (event) => {
      if (overlayMenuRef.current && !overlayMenuRef.current.contains(event.target)) {
        setOverlayMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const patternRef = useRef({ lines: [], markers: [] })

  const clearPatternOverlays = useCallback(() => {
    if (!chartRef.current) return
    const { chart, priceSeries } = chartRef.current
    if (!chart || !priceSeries) return
    patternRef.current.lines.forEach((series) => {
      try {
        chart.removeSeries(series)
      } catch (_) {}
    })
    patternRef.current.lines = []
    patternRef.current.markers = []
    try {
      priceSeries.setMarkers([])
    } catch (_) {}
  }, [])

  const applyPatternOverlays = useCallback(
    (patterns) => {
      if (!chartRef.current || !patterns) return
      const { chart, priceSeries } = chartRef.current
      if (!chart || !priceSeries) return
      clearPatternOverlays()

      const sortByTime = (points) => points.slice().sort((a, b) => a.time - b.time)
      const lines = []
      if (patterns.levels?.length) {
        patterns.levels.forEach((level) => {
          const series = chart.addLineSeries({
            color: level.kind === 'support' ? '#10b981' : '#ef4444',
            lineWidth: 1,
            lineStyle: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          })
          const first = data.candles?.[0]?.time
          const last = data.candles?.[data.candles.length - 1]?.time
          if (first && last) {
            series.setData(
              sortByTime([
                { time: first, value: level.value },
                { time: last, value: level.value },
              ]),
            )
          }
          lines.push(series)
        })
      }
      if (patterns.necklines?.length) {
        patterns.necklines.forEach((neckline) => {
          const series = chart.addLineSeries({
            color: '#94a3b8',
            lineWidth: 1,
            lineStyle: 1,
            priceLineVisible: false,
            lastValueVisible: false,
          })
          const points = Array.isArray(neckline.points) ? sortByTime(neckline.points) : []
          if (points.length) {
            series.setData(points)
          }
          lines.push(series)
        })
      }
      if (patterns.markers?.length) {
        const sortedMarkers = patterns.markers.slice().sort((a, b) => a.time - b.time)
        priceSeries.setMarkers(sortedMarkers)
        patternRef.current.markers = sortedMarkers
      }
      patternRef.current.lines = lines
    },
    [clearPatternOverlays, data.candles],
  )

  useEffect(() => {
    if (!containerRef.current || !indicatorContainerRef.current) return

    containerRef.current.style.backgroundColor = theme.bg
    indicatorContainerRef.current.style.backgroundColor = theme.bg

    const buildLayout = () => ({
      background: { type: 'solid', color: theme.bg },
      textColor: theme.text,
      attributionLogo: { visible: false },
    })
    const buildGrid = () => ({
      vertLines: { color: theme.grid },
      horzLines: { color: theme.grid },
    })
    const buildRightScale = (margins) => ({
      borderColor: theme.border,
      scaleMargins: margins,
      ticksVisible: true,
      minimumWidth: PRICE_SCALE_WIDTH,
    })
    const buildLeftScale = (margins) => ({
      borderColor: theme.border,
      scaleMargins: margins,
      ticksVisible: true,
      minimumWidth: PRICE_SCALE_WIDTH,
      visible: true,
    })

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 420,
      layout: buildLayout(),
      grid: buildGrid(),
      timeScale: { borderColor: theme.border, visible: true, rightOffset: 4 },
      rightPriceScale: buildRightScale({ top: 0.05, bottom: 0.15 }),
      leftPriceScale: buildLeftScale({ top: 0.82, bottom: 0 }),
      crosshair: { mode: 1 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      watermark: { visible: false },
    })
    chart.applyOptions({ watermark: { visible: false, color: 'transparent', text: '' } })

    let priceSeries
    if (chartType === 'line') {
      priceSeries = chart.addLineSeries({
        color: '#2563eb',
        lineWidth: 2,
      })
    } else if (chartType === 'area') {
      priceSeries = chart.addAreaSeries({
        lineColor: '#2563eb',
        topColor: 'rgba(37, 99, 235, 0.25)',
        bottomColor: 'rgba(37, 99, 235, 0.02)',
        lineWidth: 2,
      })
    } else {
      priceSeries = chart.addCandlestickSeries({
        upColor: '#4caf50',
        downColor: '#f44336',
        borderVisible: false,
        wickUpColor: '#4caf50',
        wickDownColor: '#f44336',
      })
    }

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'left',
      scaleMargins: { top: 0.8, bottom: 0 },
      color: theme.volColor,
    })
    chartRef.current = { chart, priceSeries, volumeSeries, volumeMax: 1 }
    volumeSeries.applyOptions({
      autoscaleInfoProvider: zeroBasedAutoscaleProvider(() => chartRef.current?.volumeMax ?? 1),
    })

    const indicatorChart = createChart(indicatorContainerRef.current, {
      width: indicatorContainerRef.current.clientWidth,
      height: 180,
      layout: buildLayout(),
      grid: buildGrid(),
      timeScale: { borderColor: theme.border, visible: true, rightOffset: 4 },
      rightPriceScale: {
        ...buildRightScale({ top: 0.1, bottom: 0.1 }),
        entireTextOnly: true,
      },
      leftPriceScale: buildLeftScale({ top: 0.1, bottom: 0.1 }),
      crosshair: { mode: 1 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      watermark: { visible: false },
    })
    indicatorChart.applyOptions({ watermark: { visible: false, color: 'transparent', text: '' } })
    indicatorSeriesRef.current = {}
    indicatorChartRef.current = indicatorChart
    setIndicatorChartReady(true)

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
      setIndicatorChartReady(false)
    }
  }, [darkMode, theme, zeroBasedAutoscaleProvider, chartType])

  useEffect(() => {
    if (!chartRef.current) return
    const spacing = barSpacing
    const applySpacing = (chart) => {
      chart.timeScale().applyOptions({
        barSpacing: spacing,
        minBarSpacing: Math.max(2, spacing * 0.6),
        rightOffset: 1,
        fixLeftEdge: true,
        fixRightEdge: true,
      })
      chart.timeScale().fitContent()
    }
    applySpacing(chartRef.current.chart)
    if (indicatorChartRef.current) {
      applySpacing(indicatorChartRef.current)
    }
  }, [barSpacing, data])

  useEffect(() => {
    if (!patternsActive) return
    if (!data.candles?.length) return
    const patterns = detectPatterns(data.candles)
    applyPatternOverlays(patterns)
  }, [patternsActive, data.candles, applyPatternOverlays])

  useEffect(() => {
    if (!patternsActive) return
    clearPatternOverlays()
    setPatternsActive(false)
  }, [ticker, period, intervalOverride, chartType, clearPatternOverlays])

  useEffect(() => {
    if (!chartRef.current) return
    const priceSeries = chartRef.current.priceSeries
    if (!priceSeries) return

    if (data.candles?.length) {
      if (chartType === 'candles') {
        priceSeries.setData(data.candles)
      } else {
        const lineData = data.candles.map((candle) => ({
          time: candle.time,
          value: candle.close,
        }))
        priceSeries.setData(lineData)
      }
    } else {
      priceSeries.setData([])
    }

    if (data.volumes?.length) {
      chartRef.current.volumeSeries.setData(data.volumes)
      const volumeMax = Math.max(...data.volumes.map((v) => v.value ?? 0), 1)
      chartRef.current.volumeMax = Number.isFinite(volumeMax) ? volumeMax : 1
    } else {
      chartRef.current.volumeSeries.setData([])
      chartRef.current.volumeMax = 1
    }
  }, [data, chartType])

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
  }, [activeOverlays, indicators, chartType])

  useEffect(() => {
    if (!chartRef.current) return
    if (mlSeriesRef.current) {
      chartRef.current.chart.removeSeries(mlSeriesRef.current)
      mlSeriesRef.current = null
    }
    if (mlSeries?.length) {
      const lastKnownTime = data?.candles?.[data.candles.length - 1]?.time || 0
      const futureSeries = mlSeries.filter((point) => point.time >= lastKnownTime)
      if (!futureSeries.length) return
      mlSeriesRef.current = chartRef.current.chart.addLineSeries({
        color: '#aa00ff',
        lineWidth: 2,
      })
      mlSeriesRef.current.setData(futureSeries)
    }
  }, [mlSeries, data, chartType])

  useEffect(() => {
    if (!chartRef.current) return
    const timeScale = chartRef.current.chart.timeScale()
    const visibleRange = timeScale.getVisibleLogicalRange()
    if (macroOverlayRef.current) {
      chartRef.current.chart.removeSeries(macroOverlayRef.current)
      macroOverlayRef.current = null
    }
    if (!macroOverlayActive || !macroOverlay?.length) return
    const candleStart = data?.candles?.[0]?.time
    const candleEnd = data?.candles?.[data.candles.length - 1]?.time
    const overlayData =
      candleStart && candleEnd
        ? macroOverlay.filter((point) => point.time >= candleStart && point.time <= candleEnd)
        : macroOverlay
    if (!overlayData.length) return
    macroOverlayRef.current = chartRef.current.chart.addLineSeries({
      color: '#f97316',
      lineWidth: 2,
      priceScaleId: 'macro',
      priceLineVisible: false,
      lastValueVisible: true,
    })
    chartRef.current.chart.priceScale('macro')?.applyOptions({
      scaleMargins: { top: 0.15, bottom: 0.15 },
      borderColor: theme.border,
      visible: true,
      ticksVisible: true,
      minimumWidth: PRICE_SCALE_WIDTH,
    })
    macroOverlayRef.current.setData(overlayData)
    if (visibleRange) {
      timeScale.setVisibleLogicalRange(visibleRange)
    }
  }, [macroOverlayActive, macroOverlay, theme, data?.candles])

  useEffect(() => {
    if (!indicatorChartRef.current || !indicatorChartReady) return
    if (!indicators?.Date?.length) {
      Object.values(indicatorSeriesRef.current).forEach((series) => {
        series.setData([])
      })
      return
    }
    const chart = indicatorChartRef.current
    const nextIds = new Set()
    const selections = [
      { key: leftIndicator, scaleId: 'left' },
      { key: rightIndicator, scaleId: 'right' },
    ].filter((item) => item.key)

    const seen = new Set()
    selections.forEach((selection) => {
      if (seen.has(selection.key)) return
      seen.add(selection.key)
      const indicator = LOWER_INDICATORS.find((item) => item.key === selection.key)
      if (!indicator) return
      indicator.series.forEach((seriesConfig, idx) => {
        const seriesId = `${indicator.key}-${seriesConfig.key}-${idx}-${selection.scaleId}`
        nextIds.add(seriesId)
        if (!indicatorSeriesRef.current[seriesId]) {
          indicatorSeriesRef.current[seriesId] = chart.addLineSeries({
            color: seriesConfig.color || indicator.color || '#888',
            lineWidth: seriesConfig.lineWidth || 2,
            priceScaleId: selection.scaleId,
            priceFormat: {
              type: 'custom',
              formatter: formatCompactAxis,
            },
          })
        }
        chart.priceScale(selection.scaleId)?.applyOptions({
          scaleMargins: { top: 0.1, bottom: 0.1 },
          borderColor: theme.border,
          ticksVisible: true,
          visible: true,
          minimumWidth: PRICE_SCALE_WIDTH,
        })
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
  }, [leftIndicator, rightIndicator, indicators, theme, chartType, indicatorChartReady])

  const companyName = kpi?.companyName || '—'
  const exchange = kpi?.exchange || ''
  const formattedPrice =
    priceSummary?.price != null ? formatNumber(priceSummary.price) : 'Loading…'
  const priceChange =
    priceSummary?.change != null ? `${priceSummary.change >= 0 ? '+' : ''}${formatNumber(priceSummary.change)}` : ''
  const priceChangePct =
    priceSummary?.changePct != null
      ? `${priceSummary.changePct >= 0 ? '+' : ''}${priceSummary.changePct.toFixed(2)}%`
      : ''
  const priceTrendClass =
    priceSummary?.change == null ? '' : priceSummary.change >= 0 ? 'price-up' : 'price-down'

  const legendItems = useMemo(() => {
    const items = []
    activeOverlays.forEach((key) => {
      const overlay = PRICE_OVERLAYS.find((item) => item.key === key)
      if (overlay) {
        items.push({ key: overlay.key, label: overlay.label, color: overlay.color || '#888' })
      }
    })
    if (macroOverlayActive && macroOverlay?.length) {
      items.push({ key: 'macro-overlay', label: macroOverlayLabel || 'Macro overlay', color: '#f97316' })
    }
    if (mlSeries?.length) {
      items.push({ key: 'ml-forecast', label: 'ML forecast', color: '#aa00ff' })
    }
    return items
  }, [activeOverlays, macroOverlayActive, macroOverlay, macroOverlayLabel, mlSeries])

  return (
    <section className="panel chart-panel">
      <div className="panel-header">
        <div className="chart-title-block">
          <div>
            <div className="ticker-line">
              <h2>{ticker}</h2>
              <button className="secondary-btn" type="button" onClick={onAddWatchlist}>
                + Watchlist
              </button>
            </div>
            <div className="company-line">
              <span>{companyName}</span>
              {exchange && <span className="exchange-tag">{exchange}</span>}
            </div>
          </div>
          <div className={`price-line ${priceTrendClass}`}>
            <span className="current-price">{formattedPrice}</span>
            {(priceChange || priceChangePct) && (
              <span className="price-delta">
                {priceChange} {priceChangePct}
              </span>
            )}
          </div>
        </div>
        <div className="chart-actions">
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
          <MenuSelect
            label="Interval"
            valueLabel={
              intervalOverride
                ? CANDLE_INTERVALS.find((item) => item.value === intervalOverride)?.label
                : `Auto (${baseIntervalLabel})`
            }
            options={CANDLE_INTERVALS.map((item) => ({
              value: item.value ?? '',
              label: item.value ? item.label : `Auto (${baseIntervalLabel})`,
            }))}
            selectedValue={intervalOverride ?? ''}
            onSelect={(value) => onIntervalChange(value ? value : null)}
          />
          <MenuSelect
            label="Chart"
            valueLabel={CHART_TYPES.find((type) => type.key === chartType)?.label}
            options={CHART_TYPES.map((type) => ({
              value: type.key,
              label: type.label,
            }))}
            selectedValue={chartType}
            onSelect={(value) => setChartType(value)}
          />
        </div>
      </div>
      <div className="chart-toolbar">
        <div className="overlay-dropdown" ref={overlayMenuRef}>
          <button
            type="button"
            className="secondary-btn dropdown-trigger"
            onClick={() => setOverlayMenuOpen((prev) => !prev)}
          >
            Price overlays
          </button>
          {overlayMenuOpen && (
            <div className="dropdown-panel">
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
          )}
        </div>
        <button
          type="button"
          className={`secondary-btn ${patternsActive ? 'active' : ''}`}
          onClick={() => setPatternsActive((prev) => !prev)}
        >
          Patterns
        </button>
        <button
          type="button"
          className={`secondary-btn ${macroOverlayActive ? 'active' : ''}`}
          onClick={() => setMacroOverlayActive((prev) => !prev)}
          disabled={!macroOverlay?.length}
          title={macroOverlayLabel ? `Overlay: ${macroOverlayLabel}` : 'Macro overlay'}
        >
          Macro Overlay
        </button>
      </div>
      {error && <div className="panel-error">{error}</div>}
      {!error && (!data.candles || data.candles.length === 0) && (
        <div className="panel-error">No data available for {ticker} in period {period}.</div>
      )}
      <div className="chart-container" ref={containerRef}>
        {legendItems.length > 0 && (
          <div className="chart-legend">
            {legendItems.map((item) => (
              <div className="legend-item" key={item.key}>
                <span className="legend-swatch" style={{ backgroundColor: item.color }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="chart-controls">
        <div className="overlay-controls">
          <span className="control-label">Lower indicators:</span>
          <MenuSelect
            label="Left"
            valueLabel={LOWER_INDICATORS.find((indicator) => indicator.key === leftIndicator)?.label || 'None'}
            options={[
              { value: '', label: 'None' },
              ...LOWER_INDICATORS.map((indicator) => ({ value: indicator.key, label: indicator.label })),
            ]}
            selectedValue={leftIndicator}
            onSelect={(value) => {
              setLeftIndicator(value)
              if (value && value === rightIndicator) {
                setRightIndicator('')
              }
            }}
          />
          <MenuSelect
            label="Right"
            valueLabel={LOWER_INDICATORS.find((indicator) => indicator.key === rightIndicator)?.label || 'None'}
            options={[
              { value: '', label: 'None' },
              ...LOWER_INDICATORS.map((indicator) => ({ value: indicator.key, label: indicator.label })),
            ]}
            selectedValue={rightIndicator}
            onSelect={(value) => {
              setRightIndicator(value)
              if (value && value === leftIndicator) {
                setLeftIndicator('')
              }
            }}
            alignRight
          />
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
            <th>Day's Range</th>
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
            <th>FCF / Share</th>
            <td>{formatNumber(kpi.fcfPerShare)}</td>
            <th>P / FCF</th>
            <td>{formatNumber(kpi.priceToFcf)}</td>
          </tr>
          <tr>
            <th>EV / FCF</th>
            <td>{formatNumber(kpi.evToFcf)}</td>
            <th>FCF Conversion</th>
            <td>{formatPercent(kpi.fcfConversion)}</td>
          </tr>
          <tr>
            <th>FCF Margin</th>
            <td>{formatPercent(kpi.fcfMargin)}</td>
            <th>CapEx</th>
            <td>{formatLargeNumber(kpi.capitalExpenditures)}</td>
          </tr>
          <tr>
            <th>Total Cash</th>
            <td>{formatLargeNumber(kpi.totalCash)}</td>
            <th>Total Debt</th>
            <td>{formatLargeNumber(kpi.totalDebt)}</td>
          </tr>
          <tr>
            <th>Net Debt</th>
            <td>{formatLargeNumber(kpi.netDebt)}</td>
            <th>Net Debt / EBITDA</th>
            <td>{formatNumber(kpi.netDebtToEbitda)}</td>
          </tr>
          <tr>
            <th>Int Coverage (EBIT)</th>
            <td>{formatNumber(kpi.interestCoverageEbit)}</td>
            <th>Int Coverage (Cash)</th>
            <td>{formatNumber(kpi.interestCoverageCash)}</td>
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
            <th>EV / EBITDA</th>
            <td>{formatNumber(kpi.evToEbitda)}</td>
            <th>Enterprise Value</th>
            <td>{formatLargeNumber(kpi.enterpriseValue)}</td>
          </tr>
          <tr>
            <th>FCF / EBIT</th>
            <td>{formatPercent(kpi.fcfConversionEbit)}</td>
            <th>PEG</th>
            <td>{formatNumber(kpi.pegRatio)}</td>
          </tr>
          <tr>
            <th>ROE</th>
            <td>{formatPercent(kpi.returnOnEquity)}</td>
            <th>ROA</th>
            <td>{formatPercent(kpi.returnOnAssets)}</td>
          </tr>
          <tr>
            <th>Price / Book</th>
            <td>{formatNumber(kpi.priceToBook)}</td>
            <th>Price / Sales</th>
            <td>{formatNumber(kpi.priceToSales)}</td>
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

function MacroPanel({
  seriesOptions,
  selectedKey,
  onSelectKey,
  data,
  stockCandles,
  loading,
  error,
  darkMode,
  ticker,
}) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef({ stock: null, macro: null })

  const selectedSpec = useMemo(
    () => seriesOptions.find((item) => item.key === selectedKey),
    [seriesOptions, selectedKey],
  )
  const macroScale = useMemo(() => {
    const transform = selectedSpec?.transform
    return transform === 'pct_change' || transform === 'yoy' ? 100 : 1
  }, [selectedSpec])
  const macroSuffix = macroScale === 100 ? '%' : ''

  const stockSeries = useMemo(() => {
    if (!stockCandles?.length) return []
    const base = stockCandles[0]?.close
    if (!base) return []
    return stockCandles.map((candle) => ({
      time: candle.time,
      value: (candle.close / base) * 100,
    }))
  }, [stockCandles])

  const macroSeries = useMemo(() => {
    if (!data?.Date?.length || !selectedKey) return []
    const values = data[selectedKey] || []
    return data.Date.map((date, idx) => {
      const raw = values[idx]
      if (raw === null || raw === undefined || Number.isNaN(raw)) return null
      return {
        time: Math.floor(new Date(date).getTime() / 1000),
        value: raw * macroScale,
      }
    }).filter(Boolean)
  }, [data, selectedKey, macroScale])

  const macroFiltered = useMemo(() => {
    if (!stockCandles?.length) return macroSeries
    const start = stockCandles[0].time
    const end = stockCandles[stockCandles.length - 1].time
    return macroSeries.filter((point) => point.time >= start && point.time <= end)
  }, [macroSeries, stockCandles])

  useEffect(() => {
    if (!containerRef.current) return
    const theme = darkMode
      ? { bg: '#0f172a', grid: '#24304a', text: '#e2e8f0', border: '#2c3a55' }
      : { bg: '#fff', grid: '#f0f3fa', text: '#222', border: '#d1d4dc' }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 240,
      layout: { background: { type: 'solid', color: theme.bg }, textColor: theme.text },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      timeScale: { borderColor: theme.border, visible: true, rightOffset: 2 },
      rightPriceScale: { borderColor: theme.border, visible: true },
      leftPriceScale: { borderColor: theme.border, visible: true },
      crosshair: { mode: 1 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    })

    const stock = chart.addLineSeries({
      color: '#2563eb',
      lineWidth: 2,
      priceScaleId: 'left',
      priceLineVisible: false,
      lastValueVisible: true,
    })
    const macro = chart.addLineSeries({
      color: '#f97316',
      lineWidth: 2,
      priceScaleId: 'right',
      priceLineVisible: false,
      lastValueVisible: true,
    })

    chartRef.current = chart
    seriesRef.current = { stock, macro }

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = { stock: null, macro: null }
    }
  }, [darkMode])

  useEffect(() => {
    if (!chartRef.current) return
    if (seriesRef.current.stock) {
      seriesRef.current.stock.setData(stockSeries)
    }
    if (seriesRef.current.macro) {
      seriesRef.current.macro.setData(macroFiltered)
    }
    chartRef.current.timeScale().fitContent()
  }, [stockSeries, macroFiltered])

  const lastMacro = macroFiltered?.[macroFiltered.length - 1]?.value ?? null
  const lastMacroDate = macroFiltered?.[macroFiltered.length - 1]?.time ?? null
  const lastStock = stockSeries?.[stockSeries.length - 1]?.value ?? null

  const formatMacroValue = (value) => {
    if (value == null || Number.isNaN(value)) return '—'
    if (macroScale === 100) return `${value.toFixed(2)}${macroSuffix}`
    return formatNumber(value)
  }

  return (
    <section className="panel macro-panel">
      <div className="panel-header">
        <div>
          <h3>Macro Comparison</h3>
          <p className="panel-subtitle">Stock indexed to 100 vs selected macro series.</p>
        </div>
        <div className="macro-controls">
          <label>
            Macro series
            <select value={selectedKey} onChange={(e) => onSelectKey(e.target.value)}>
              {seriesOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="macro-meta">
        <span className="macro-legend">
          <span className="legend-dot stock" />
          {ticker ? `${ticker} (indexed)` : 'Stock (indexed)'} {lastStock != null ? formatNumber(lastStock) : ''}
        </span>
        <span className="macro-legend">
          <span className="legend-dot macro" />
          {selectedSpec?.label || 'Macro'} {lastMacro != null ? formatMacroValue(lastMacro) : ''}
        </span>
        {lastMacroDate && (
          <span className="macro-date">As of {new Date(lastMacroDate * 1000).toLocaleDateString()}</span>
        )}
      </div>

      <div className="macro-chart" ref={containerRef} />

      {loading && <div className="panel-subtitle">Loading macro data…</div>}
      {error && <div className="panel-error">{error}</div>}
      {!loading && !error && !macroFiltered.length && (
        <div className="panel-subtitle">No macro data available for this range yet.</div>
      )}
    </section>
  )
}

function MlControls({
  models,
  loading,
  error,
  onRun,
  ticker,
  metrics,
  validation,
  modelUsed,
  requestedModel,
  autoRetrained,
  search,
  cached,
}) {
  const [model, setModel] = useState(models[0] || 'XGBoost')
  const [days, setDays] = useState(20)
  const [arimaOrder, setArimaOrder] = useState('5,1,0')
  const [features, setFeatures] = useState(() => {
    const initial = {}
    ML_FEATURES.forEach((f) => {
      initial[f.key] = f.defaultOn ?? true
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
      {metrics?.model && metrics?.baseline_last && (
        <div className="ml-metrics">
          <div className="metrics-header">
            <span>Walk-forward ({metrics.test_days}d)</span>
            <span className={`metrics-badge ${metrics.model.rmse < metrics.baseline_last.rmse ? 'good' : 'bad'}`}>
              {metrics.model.rmse < metrics.baseline_last.rmse ? 'Beats baseline' : 'Below baseline'}
            </span>
          </div>
          {modelUsed && (
            <div className="metrics-subtitle">
              Model: {modelUsed}
              {requestedModel && requestedModel !== modelUsed ? ` (requested ${requestedModel})` : ''}
              {autoRetrained ? ' · auto-retrained' : ''}
              {cached ? ' · cached' : ''}
            </div>
          )}
          {search?.searched && (
            <div className="metrics-subtitle">
              Auto-tune: {search.candidates} candidates ({search.model})
            </div>
          )}
          <div className="metrics-grid">
            <div className="metrics-card">
              <strong>Model</strong>
              <span>MAE: {formatNumber(metrics.model.mae)}</span>
              <span>RMSE: {formatNumber(metrics.model.rmse)}</span>
              <span>sMAPE: {formatNumber(metrics.model.smape)}%</span>
              <span>R²: {formatNumber(metrics.model.r2)}</span>
              <span>N: {metrics.model.n}</span>
            </div>
            <div className="metrics-card">
              <strong>Baseline (Last Close)</strong>
              <span>MAE: {formatNumber(metrics.baseline_last.mae)}</span>
              <span>RMSE: {formatNumber(metrics.baseline_last.rmse)}</span>
              <span>sMAPE: {formatNumber(metrics.baseline_last.smape)}%</span>
              <span>R²: {formatNumber(metrics.baseline_last.r2)}</span>
              <span>N: {metrics.baseline_last.n}</span>
            </div>
          </div>
          {validation?.note && (
            <div className={`metrics-note ${validation.passed ? 'good' : 'bad'}`}>
              {validation.note}
            </div>
          )}
          <div className="metrics-note">Lower is better. Baseline uses previous close as the forecast.</div>
        </div>
      )}
      <div className="ml-actions">
        <button
          className="secondary-btn"
          disabled={loading}
          onClick={() => {
            if (model !== 'ARIMA' && !Object.values(features).some(Boolean)) {
              alert('Select at least one feature')
              return
            }
            onRun({ model, days, features, arimaOrder, refresh: true })
          }}
        >
          {loading ? 'Refreshing…' : 'Refresh ML'}
        </button>
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
      </div>
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
        {news.slice(0, 15).map((article) => {
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
      Number(payload.Close[idx]) >= Number(payload.Open[idx])
        ? 'rgba(76, 175, 80, 0.5)'
        : 'rgba(244, 67, 54, 0.5)',
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

function detectPatterns(candles) {
  if (!candles || candles.length < 30) return { levels: [], markers: [], necklines: [] }
  const highs = candles.map((c) => c.high ?? c.close)
  const lows = candles.map((c) => c.low ?? c.close)
  const closes = candles.map((c) => c.close)
  const times = candles.map((c) => c.time)

  const pivots = findPivots(highs, lows, 3)
  const resistanceClusters = clusterLevels(pivots.highs, 0.006, 2)
  const supportClusters = clusterLevels(pivots.lows, 0.006, 2)
  const levels = [
    ...supportClusters.slice(0, 3).map((lvl) => ({ value: lvl.value, kind: 'support' })),
    ...resistanceClusters.slice(0, 3).map((lvl) => ({ value: lvl.value, kind: 'resistance' })),
  ]

  const markers = []
  const necklines = []

  const doubleTop = detectDoubleTop(pivots.highs, lows)
  if (doubleTop) {
    markers.push({
      time: times[doubleTop.index],
      position: 'aboveBar',
      color: '#ef4444',
      shape: 'arrowDown',
      text: 'Double Top',
    })
  }

  const doubleBottom = detectDoubleBottom(pivots.lows, highs)
  if (doubleBottom) {
    markers.push({
      time: times[doubleBottom.index],
      position: 'belowBar',
      color: '#10b981',
      shape: 'arrowUp',
      text: 'Double Bottom',
    })
  }

  const hns = detectHeadShoulders(pivots.highs, lows)
  if (hns) {
    markers.push({
      time: times[hns.headIndex],
      position: 'aboveBar',
      color: '#f97316',
      shape: 'arrowDown',
      text: 'Head & Shoulders',
    })
    necklines.push({
      points: [
        { time: times[hns.neckline[0]], value: lows[hns.neckline[0]] },
        { time: times[hns.neckline[1]], value: lows[hns.neckline[1]] },
      ],
    })
  }

  const ihs = detectInverseHeadShoulders(pivots.lows, highs)
  if (ihs) {
    markers.push({
      time: times[ihs.headIndex],
      position: 'belowBar',
      color: '#0ea5e9',
      shape: 'arrowUp',
      text: 'Inverse H&S',
    })
    necklines.push({
      points: [
        { time: times[ihs.neckline[0]], value: highs[ihs.neckline[0]] },
        { time: times[ihs.neckline[1]], value: highs[ihs.neckline[1]] },
      ],
    })
  }

  const flag = detectFlag(candles)
  if (flag) {
    markers.push({
      time: times[candles.length - 1],
      position: flag.type === 'bull' ? 'belowBar' : 'aboveBar',
      color: flag.type === 'bull' ? '#22c55e' : '#ef4444',
      shape: flag.type === 'bull' ? 'arrowUp' : 'arrowDown',
      text: flag.type === 'bull' ? 'Bull Flag' : 'Bear Flag',
    })
  }

  const triangle = detectTriangle(pivots, candles)
  if (triangle) {
    markers.push({
      time: times[candles.length - 1],
      position: 'aboveBar',
      color: '#6366f1',
      shape: 'circle',
      text: triangle,
    })
  }

  const breakout = detectBreakout(closes, levels)
  if (breakout) {
    markers.push({
      time: times[candles.length - 1],
      position: breakout.type === 'up' ? 'belowBar' : 'aboveBar',
      color: breakout.type === 'up' ? '#22c55e' : '#ef4444',
      shape: breakout.type === 'up' ? 'arrowUp' : 'arrowDown',
      text: breakout.type === 'up' ? 'Breakout' : 'Breakdown',
    })
  }

  return { levels, markers, necklines }
}

function findPivots(highs, lows, window = 3) {
  const highsOut = []
  const lowsOut = []
  for (let i = window; i < highs.length - window; i += 1) {
    const highSlice = highs.slice(i - window, i + window + 1)
    const lowSlice = lows.slice(i - window, i + window + 1)
    const high = highs[i]
    const low = lows[i]
    if (high === Math.max(...highSlice)) highsOut.push({ index: i, value: high })
    if (low === Math.min(...lowSlice)) lowsOut.push({ index: i, value: low })
  }
  return { highs: highsOut, lows: lowsOut }
}

function clusterLevels(points, tolerancePct = 0.006, minTouches = 2) {
  const clusters = []
  points
    .slice()
    .sort((a, b) => a.value - b.value)
    .forEach((point) => {
      const existing = clusters.find((c) => Math.abs(point.value - c.value) / c.value <= tolerancePct)
      if (existing) {
        existing.total += point.value
        existing.count += 1
        existing.value = existing.total / existing.count
      } else {
        clusters.push({ value: point.value, total: point.value, count: 1 })
      }
    })
  return clusters.filter((c) => c.count >= minTouches).sort((a, b) => b.count - a.count)
}

function detectDoubleTop(highs, lows) {
  if (highs.length < 3) return null
  const recent = highs.slice(-6)
  for (let i = recent.length - 1; i >= 1; i -= 1) {
    const top2 = recent[i]
    const top1 = recent[i - 1]
    if (!top1 || !top2) continue
    const diff = Math.abs(top2.value - top1.value) / top1.value
    if (diff > 0.012) continue
    if (top2.index - top1.index < 4) continue
    const valley = Math.min(...lows.slice(top1.index, top2.index + 1))
    if (valley < top1.value * 0.97) {
      return { index: top2.index }
    }
  }
  return null
}

function detectDoubleBottom(lows, highs) {
  if (lows.length < 3) return null
  const recent = lows.slice(-6)
  for (let i = recent.length - 1; i >= 1; i -= 1) {
    const low2 = recent[i]
    const low1 = recent[i - 1]
    if (!low1 || !low2) continue
    const diff = Math.abs(low2.value - low1.value) / low1.value
    if (diff > 0.012) continue
    if (low2.index - low1.index < 4) continue
    const peak = Math.max(...highs.slice(low1.index, low2.index + 1))
    if (peak > low1.value * 1.03) {
      return { index: low2.index }
    }
  }
  return null
}

function detectHeadShoulders(highs, lows) {
  if (highs.length < 5) return null
  const recent = highs.slice(-7)
  for (let i = 0; i < recent.length - 2; i += 1) {
    const left = recent[i]
    const head = recent[i + 1]
    const right = recent[i + 2]
    if (!left || !head || !right) continue
    if (head.value <= left.value || head.value <= right.value) continue
    const shoulderDiff = Math.abs(left.value - right.value) / left.value
    if (shoulderDiff > 0.03) continue
    const valley1Idx = findExtremeIndex(lows, left.index, head.index, 'min')
    const valley2Idx = findExtremeIndex(lows, head.index, right.index, 'min')
    if (valley1Idx == null || valley2Idx == null) continue
    return { headIndex: head.index, neckline: [valley1Idx, valley2Idx] }
  }
  return null
}

function detectInverseHeadShoulders(lows, highs) {
  if (lows.length < 5) return null
  const recent = lows.slice(-7)
  for (let i = 0; i < recent.length - 2; i += 1) {
    const left = recent[i]
    const head = recent[i + 1]
    const right = recent[i + 2]
    if (!left || !head || !right) continue
    if (head.value >= left.value || head.value >= right.value) continue
    const shoulderDiff = Math.abs(left.value - right.value) / left.value
    if (shoulderDiff > 0.03) continue
    const peak1Idx = findExtremeIndex(highs, left.index, head.index, 'max')
    const peak2Idx = findExtremeIndex(highs, head.index, right.index, 'max')
    if (peak1Idx == null || peak2Idx == null) continue
    return { headIndex: head.index, neckline: [peak1Idx, peak2Idx] }
  }
  return null
}

function findExtremeIndex(values, start, end, mode) {
  if (end <= start) return null
  const slice = values.slice(start, end + 1)
  if (!slice.length) return null
  const extreme = mode === 'min' ? Math.min(...slice) : Math.max(...slice)
  const idx = slice.indexOf(extreme)
  return idx >= 0 ? start + idx : null
}

function detectFlag(candles) {
  if (candles.length < 30) return null
  const start = candles.length - 30
  const end = candles.length - 1
  const startClose = candles[start].close
  const endClose = candles[end].close
  if (!startClose || !endClose) return null
  const move = (endClose - startClose) / startClose
  const recent = candles.slice(end - 10, end + 1)
  const recentHigh = Math.max(...recent.map((c) => c.high ?? c.close))
  const recentLow = Math.min(...recent.map((c) => c.low ?? c.close))
  const recentRange = (recentHigh - recentLow) / startClose
  if (Math.abs(move) > 0.08 && recentRange < Math.abs(move) * 0.35) {
    return { type: move > 0 ? 'bull' : 'bear' }
  }
  return null
}

function detectTriangle(pivots, candles) {
  const window = 25
  if (candles.length < window) return null
  const start = candles.length - window
  const highs = pivots.highs.filter((p) => p.index >= start)
  const lows = pivots.lows.filter((p) => p.index >= start)
  if (highs.length < 2 || lows.length < 2) return null
  const firstHigh = highs[0]
  const lastHigh = highs[highs.length - 1]
  const firstLow = lows[0]
  const lastLow = lows[lows.length - 1]
  const highSlope = (lastHigh.value - firstHigh.value) / Math.max(1, lastHigh.index - firstHigh.index)
  const lowSlope = (lastLow.value - firstLow.value) / Math.max(1, lastLow.index - firstLow.index)
  const avg = (firstHigh.value + firstLow.value) / 2
  if (Math.abs(highSlope) / avg < 0.0005 && lowSlope / avg > 0.0007) {
    return 'Ascending Triangle'
  }
  if (Math.abs(lowSlope) / avg < 0.0005 && highSlope / avg < -0.0007) {
    return 'Descending Triangle'
  }
  return null
}

function detectBreakout(closes, levels) {
  if (!levels?.length || closes.length < 2) return null
  const last = closes[closes.length - 1]
  const tol = last * 0.004
  const resistances = levels.filter((l) => l.kind === 'resistance').map((l) => l.value)
  const supports = levels.filter((l) => l.kind === 'support').map((l) => l.value)
  if (resistances.length) {
    const top = Math.max(...resistances)
    if (last > top + tol) return { type: 'up' }
  }
  if (supports.length) {
    const bottom = Math.min(...supports)
    if (last < bottom - tol) return { type: 'down' }
  }
  return null
}

function getBarSpacing(period, intervalOverride) {
  const baseInterval = TIMEFRAMES.find((item) => item.value === period)?.interval || '1d'
  const interval = intervalOverride || baseInterval
  if (interval === '1mo' || interval === '3mo') return 10
  if (interval === '1wk') return 8
  if (interval === '1d') {
    if (period === '5Y' || period === 'MAX') return 4
    if (period === '1Y' || period === '6M' || period === 'YTD') return 7
    return 6
  }
  if (interval === '1h' || interval === '30m') return 4
  return 5
}

function formatScreenerCell(column, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number' && !Number.isFinite(value)) return '—'
  if (column.type === 'text') return value
  if (column.type === 'percent') return formatPercent(value)
  if (column.type === 'money') return formatLargeNumber(value)
  return formatNumber(value)
}

function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return value ?? 'N/A'
  return value.toFixed(2)
}

function formatLargeNumber(value) {
  if (typeof value !== 'number') return value || 'N/A'
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}T`
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`
  return `${sign}${(abs / 1e3).toFixed(1)}K`
}

function formatPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return value ?? 'N/A'
  const pct = Math.abs(value) <= 1 ? value * 100 : value
  return `${pct.toFixed(2)}%`
}

function formatScreenerValue(metric, value) {
  if (
    metric === 'profitMargin' ||
    metric === 'returnOnEquity' ||
    metric === 'returnOnAssets' ||
    metric === 'fcfYield' ||
    metric === 'fcfMargin' ||
    metric === 'operatingMargin' ||
    metric === 'fcfConversion' ||
    metric === 'fcfConversionEbit'
  ) {
    return formatPercent(value)
  }
  if (
    metric === 'marketCap' ||
    metric === 'freeCashflow' ||
    metric === 'operatingCashflow' ||
    metric === 'totalRevenue' ||
    metric === 'capitalExpenditures'
  ) {
    return formatLargeNumber(value)
  }
  return formatNumber(value)
}

function formatCompactAxis(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return ''
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  if (abs >= 1) return value.toFixed(2)
  return value.toPrecision(2)
}

export default App
