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
const CHART_TYPES = [
  { key: 'candles', label: 'Candles' },
  { key: 'line', label: 'Line' },
  { key: 'area', label: 'Mountain' },
]
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const PRICE_SCALE_WIDTH = 60

function App() {
  const [selectedTicker, setSelectedTicker] = useState(DEFAULT_TICKER)
  const [period, setPeriod] = useState('1Y')
  const [darkMode, setDarkMode] = useState(false)

  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST)
  const [snapshots, setSnapshots] = useState({})
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchError, setBatchError] = useState('')

  const [tickerData, setTickerData] = useState(null)
  const [indicators, setIndicators] = useState(null)
  const [kpi, setKpi] = useState(null)
  const [news, setNews] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')

  const [{ mlSeries, mlLoading, mlError }, setMlState] = useState({
    mlSeries: [],
    mlLoading: false,
    mlError: '',
  })
  const [mlModels, setMlModels] = useState([])

  const interval = useMemo(
    () => TIMEFRAMES.find((item) => item.value === period)?.interval || '1d',
    [period],
  )

  const fetchTickerData = useCallback(
    async (ticker, frame) => {
      if (!ticker) return
      setDataLoading(true)
      setDataError('')
      try {
        const stockRes = await fetch(
          `${API_BASE}/stock/${encodeURIComponent(ticker)}?period=${frame}&interval=${interval}`,
        )
        const stockJson = await stockRes.json().catch(() => ({}))
        if (!stockRes.ok) {
          throw new Error(stockJson.detail || stockRes.statusText)
        }
        setTickerData(transformStockResponse(stockJson))

        await new Promise((res) => setTimeout(res, 250))

        const indRes = await fetch(
          `${API_BASE}/indicators/${encodeURIComponent(ticker)}?period=${frame}&interval=${interval}`,
        )
        const indJson = await indRes.json().catch(() => ({}))
        if (indRes.ok) {
          setIndicators(indJson)
        }

        const kpiRes = await fetch(`${API_BASE}/kpi/${encodeURIComponent(ticker)}`)
        const kpiJson = await kpiRes.json().catch(() => ({}))
        if (kpiRes.ok) setKpi(kpiJson)

        const newsRes = await fetch(`${API_BASE}/news/${encodeURIComponent(ticker)}`)
        const newsJson = await newsRes.json().catch(() => [])
        setNews(Array.isArray(newsJson) ? newsJson : [])
      } catch (err) {
        setDataError(err.message || 'Unable to load ticker data.')
      } finally {
        setDataLoading(false)
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
      } catch (_) {}
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
    snapshotDelayRef.current = setTimeout(() => {
      fetchSnapshots()
    }, 1200)
    return () => {
      if (snapshotDelayRef.current) {
        clearTimeout(snapshotDelayRef.current)
      }
    }
  }, [fetchSnapshots, watchlist])

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
        />

        <main className="main-content">
          <ChartPanel
            ticker={selectedTicker}
            period={period}
            onPeriodChange={setPeriod}
            data={chartData}
            indicators={indicators}
            mlSeries={mlSeries}
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
            />
          </div>
        </main>

        <aside className="news-column">
          <NewsList news={news} />
        </aside>
      </div>

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

function Sidebar({ watchlistRows, marketRows, loading, error, onSelect, onRemove, onRefresh }) {
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
      <div className="item-row2">
        {(data && (data.exchange || data.companyName)) || subtitle || payload.companyName || 'Unknown'}
      </div>
    </>
  )
}

function ChartPanel({
  ticker,
  period,
  onPeriodChange,
  data,
  indicators,
  mlSeries,
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
  const [activeOverlays, setActiveOverlays] = useState(() => new Set(['MA50']))
  const [activeIndicators, setActiveIndicators] = useState(() => new Set(['rsi', 'macd']))
  const [chartType, setChartType] = useState('candles')
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(false)
  const overlayMenuRef = useRef(null)

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
      timeScale: { borderColor: theme.border, visible: true, rightOffset: 12 },
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
      timeScale: { borderColor: theme.border, visible: true, rightOffset: 12 },
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
    }
  }, [darkMode, theme, zeroBasedAutoscaleProvider, chartType])

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
  }, [activeOverlays, indicators])

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
  }, [mlSeries, data])

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
      const scaleId = 'left'
      indicator.series.forEach((seriesConfig, idx) => {
        const seriesId = `${indicator.key}-${seriesConfig.key}-${idx}`
        nextIds.add(seriesId)
        if (!indicatorSeriesRef.current[seriesId]) {
          indicatorSeriesRef.current[seriesId] = chart.addLineSeries({
            color: seriesConfig.color || indicator.color || '#888',
            lineWidth: seriesConfig.lineWidth || 2,
            priceScaleId: scaleId,
            priceFormat: {
              type: 'custom',
              formatter: formatCompactAxis,
            },
          })
          chart.priceScale(scaleId)?.applyOptions({
            scaleMargins: { top: 0.1, bottom: 0.1 },
            borderColor: theme.border,
            ticksVisible: true,
            visible: true,
            minimumWidth: PRICE_SCALE_WIDTH,
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
  }, [activeIndicators, indicators, theme])

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

  const overlaySummary = activeOverlays.size ? `${activeOverlays.size} selected` : 'None selected'

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
          <div className="chart-type-toggle">
            {CHART_TYPES.map((type) => (
              <button
                key={type.key}
                type="button"
                className={type.key === chartType ? 'active' : ''}
                onClick={() => setChartType(type.key)}
              >
                {type.label}
              </button>
            ))}
          </div>
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
            <span className="dropdown-summary">{overlaySummary}</span>
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
      </div>
      {error && <div className="panel-error">{error}</div>}
      {!error && (!data.candles || data.candles.length === 0) && (
        <div className="panel-error">No data available for {ticker} in period {period}.</div>
      )}
      <div className="chart-container" ref={containerRef} />
      <div className="chart-controls">
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
        </tbody>
      </table>
    </section>
  )
}

function MlControls({ models, loading, error, onRun, ticker }) {
  const [model, setModel] = useState(models[0] || 'XGBoost')
  const [days, setDays] = useState(20)
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
          if (!Object.values(features).some(Boolean)) {
            alert('Select at least one feature')
            return
          }
          onRun({ model, days, features })
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
