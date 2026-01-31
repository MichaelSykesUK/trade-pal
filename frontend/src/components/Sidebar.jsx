import { SCREENER_METRICS } from '../constants'
import TrashIcon from './TrashIcon'
import WatchlistRow from './WatchlistRow'

export default function Sidebar({
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
  sparklinePeriod = '1Y',
  onSparklinePeriodToggle,
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
          <span className="sparkline-header">
            <button
              type="button"
              className="sparkline-toggle"
              onClick={() => onSparklinePeriodToggle?.()}
              title="Toggle sparkline range"
            >
              {sparklinePeriod}
            </button>
          </span>
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
          <span className="sparkline-header">
            <button
              type="button"
              className="sparkline-toggle"
              onClick={() => onSparklinePeriodToggle?.()}
              title="Toggle sparkline range"
            >
              {sparklinePeriod}
            </button>
          </span>
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
