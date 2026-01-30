export function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return value ?? 'N/A'
  return value.toFixed(2)
}

export function formatLargeNumber(value) {
  if (typeof value !== 'number') return value || 'N/A'
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}T`
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`
  return `${sign}${(abs / 1e3).toFixed(1)}K`
}

export function formatPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return value ?? 'N/A'
  const pct = Math.abs(value) <= 1 ? value * 100 : value
  return `${pct.toFixed(2)}%`
}

export function formatScreenerCell(column, value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number' && !Number.isFinite(value)) return '—'
  if (column.type === 'text') return value
  if (column.type === 'percent') return formatPercent(value)
  if (column.type === 'money') return formatLargeNumber(value)
  return formatNumber(value)
}

export function formatScreenerValue(metric, value) {
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

export function formatCompactAxis(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return ''
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  if (abs >= 1) return value.toFixed(2)
  return value.toPrecision(2)
}
