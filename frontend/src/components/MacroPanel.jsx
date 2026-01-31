import { useEffect, useMemo, useRef } from 'react'
import { createChart } from 'lightweight-charts'
import { formatNumber } from '../utils/format'

export default function MacroPanel({
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
