import { useMemo } from 'react'
import { SCREENER_COLUMNS, SCREENER_METRICS } from '../constants'
import { formatScreenerCell } from '../utils/format'

export default function ScreenerModal({
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
