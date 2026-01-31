import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createChart } from 'lightweight-charts'
import { LOWER_INDICATORS, PRICE_OVERLAYS, PRICE_SCALE_WIDTH, TIMEFRAMES } from '../constants'
import { buildOverlaySeries, detectPatterns, getBarSpacing } from '../utils/chart'
import { formatCompactAxis, formatNumber } from '../utils/format'
import ChartHeader from './chart/ChartHeader'
import ChartLegend from './chart/ChartLegend'
import ChartToolbar from './chart/ChartToolbar'
import IndicatorControls from './chart/IndicatorControls'

export default function ChartPanel({
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
      } catch (_) {}
      try {
        indicatorScale.unsubscribeVisibleLogicalRangeChange(syncFromIndicator)
      } catch (_) {}
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

  const handleToggleOverlay = useCallback((key) => {
    setActiveOverlays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const handleTogglePatterns = useCallback(() => {
    setPatternsActive((prev) => !prev)
  }, [])

  const handleToggleMacroOverlay = useCallback(() => {
    setMacroOverlayActive((prev) => !prev)
  }, [])

  const handleLeftIndicatorChange = useCallback(
    (value) => {
      setLeftIndicator(value)
      if (value && value === rightIndicator) {
        setRightIndicator('')
      }
    },
    [rightIndicator],
  )

  const handleRightIndicatorChange = useCallback(
    (value) => {
      setRightIndicator(value)
      if (value && value === leftIndicator) {
        setLeftIndicator('')
      }
    },
    [leftIndicator],
  )

  return (
    <section className="panel chart-panel">
      <ChartHeader
        ticker={ticker}
        companyName={companyName}
        exchange={exchange}
        formattedPrice={formattedPrice}
        priceChange={priceChange}
        priceChangePct={priceChangePct}
        priceTrendClass={priceTrendClass}
        period={period}
        onPeriodChange={onPeriodChange}
        intervalOverride={intervalOverride}
        onIntervalChange={onIntervalChange}
        chartType={chartType}
        onChartTypeChange={setChartType}
        baseIntervalLabel={baseIntervalLabel}
        onAddWatchlist={onAddWatchlist}
      />
      <ChartToolbar
        activeOverlays={activeOverlays}
        onToggleOverlay={handleToggleOverlay}
        patternsActive={patternsActive}
        onTogglePatterns={handleTogglePatterns}
        macroOverlayActive={macroOverlayActive}
        onToggleMacroOverlay={handleToggleMacroOverlay}
        macroOverlayLabel={macroOverlayLabel}
        macroOverlayAvailable={Boolean(macroOverlay?.length)}
      />
      {error && <div className="panel-error">{error}</div>}
      {!error && (!data.candles || data.candles.length === 0) && (
        <div className="panel-error">No data available for {ticker} in period {period}.</div>
      )}
      <div className="chart-container" ref={containerRef}>
        <ChartLegend items={legendItems} />
      </div>
      <IndicatorControls
        leftIndicator={leftIndicator}
        rightIndicator={rightIndicator}
        onLeftChange={handleLeftIndicatorChange}
        onRightChange={handleRightIndicatorChange}
      />
      <div className="indicator-chart" ref={indicatorContainerRef} />
    </section>
  )
}
