import { useMemo, useState } from 'react'
import { API_BASE } from './config'
import { DEFAULT_TICKER, DEFAULT_WATCHLIST, MARKET_INDEXES, TIMEFRAMES } from './constants'
import ChartPanel from './components/ChartPanel'
import Header from './components/Header'
import KpiTable from './components/KpiTable'
import LoadingOverlay from './components/LoadingOverlay'
import MacroPanel from './components/MacroPanel'
import MlControls from './components/MlControls'
import NewsList from './components/NewsList'
import ScreenerModal from './components/ScreenerModal'
import Sidebar from './components/Sidebar'
import useMacro from './hooks/useMacro'
import useMl from './hooks/useMl'
import useMlModels from './hooks/useMlModels'
import useScreener from './hooks/useScreener'
import useSnapshots from './hooks/useSnapshots'
import useTheme from './hooks/useTheme'
import useTickerBundle from './hooks/useTickerBundle'
import useWatchlist from './hooks/useWatchlist'

function App() {
  const [selectedTicker, setSelectedTicker] = useState(DEFAULT_TICKER)
  const [period, setPeriod] = useState('1Y')
  const [intervalOverride, setIntervalOverride] = useState(null)
  const { darkMode, setDarkMode } = useTheme()

  const baseInterval = useMemo(
    () => TIMEFRAMES.find((item) => item.value === period)?.interval || '1d',
    [period],
  )
  const interval = intervalOverride || baseInterval

  const { watchlist, add: handleAddToWatchlist, remove: handleRemoveWatchlist } = useWatchlist({
    apiBase: API_BASE,
    defaultWatchlist: DEFAULT_WATCHLIST,
  })

  const { tickerData, indicators, kpi, news, dataLoading, dataError, bundleReady } = useTickerBundle({
    apiBase: API_BASE,
    ticker: selectedTicker,
    period,
    interval,
  })

  const { snapshots, batchLoading, batchError, fetchSnapshots } = useSnapshots({
    apiBase: API_BASE,
    watchlist,
    bundleReady,
    marketIndexes: MARKET_INDEXES,
  })

  const {
    mlSeries,
    mlLoading,
    mlError,
    mlMetrics,
    mlValidation,
    mlModelUsed,
    mlRequestedModel,
    mlAutoRetrained,
    mlSearch,
    mlCached,
    runMl,
  } = useMl({
    apiBase: API_BASE,
    ticker: selectedTicker,
    period,
    interval,
  })

  const mlModels = useMlModels({ apiBase: API_BASE })

  const {
    macroSeries,
    macroKey,
    setMacroKey,
    macroData,
    macroLoading,
    macroError,
    macroOverlaySeries,
    selectedMacroSpec,
  } = useMacro({ apiBase: API_BASE, candles: tickerData?.candles ?? [] })

  const {
    displayRows: screenerDisplayRows,
    loading: screenerLoading,
    error: screenerError,
    metric: screenerMetric,
    order: screenerOrder,
    open: screenerOpen,
    setOpen: setScreenerOpen,
    sort: screenerSort,
    query: screenerQuery,
    setQuery: setScreenerQuery,
    autoFill: screenerAutoFill,
    setAutoFill: setScreenerAutoFill,
    cooldownSeconds: screenerCooldown,
    universeSize: screenerUniverse,
    remaining: screenerRemaining,
    complete: screenerComplete,
    requested: screenerRequested,
    fetchScreener,
    handleMetricChange: handleScreenerMetricChange,
    handleOrderChange: handleScreenerOrderChange,
    handleSort: handleScreenerSort,
  } = useScreener({ apiBase: API_BASE })

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
  const priceDeltaPct = priceDelta != null && previousPrice ? (priceDelta / previousPrice) * 100 : null

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

export default App
