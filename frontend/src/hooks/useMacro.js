import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchMacroData, fetchMacroSeries } from '../api'

export default function useMacro({ apiBase, candles, initialKey = 'sp500_ret' }) {
  const [macroSeries, setMacroSeries] = useState([])
  const [macroKey, setMacroKey] = useState(initialKey)
  const [macroData, setMacroData] = useState(null)
  const [macroLoading, setMacroLoading] = useState(false)
  const [macroError, setMacroError] = useState('')
  const refreshAttemptRef = useRef(new Set())

  useEffect(() => {
    const loadMacroSeries = async () => {
      try {
        const data = await fetchMacroSeries(apiBase)
        const series = Array.isArray(data.series) ? data.series : []
        setMacroSeries(series)
        if (series.length) {
          setMacroKey((prev) => {
            if (series.find((s) => s.key === prev)) return prev
            const preferred = series.find((s) => s.key === initialKey) || series[0]
            return preferred.key
          })
        }
      } catch (_) {
        setMacroSeries([])
      }
    }
    loadMacroSeries()
  }, [apiBase, initialKey])

  const selectedMacroSpec = useMemo(
    () => macroSeries.find((item) => item.key === macroKey),
    [macroSeries, macroKey],
  )

  const macroRange = useMemo(() => {
    if (!candles?.length) return null
    const start = new Date(candles[0].time * 1000).toISOString().slice(0, 10)
    const end = new Date(candles[candles.length - 1].time * 1000).toISOString().slice(0, 10)
    return { start, end }
  }, [candles])

  useEffect(() => {
    if (!macroKey || !macroRange?.start || !macroRange?.end) return
    const controller = new AbortController()
    const loadMacroData = async () => {
      setMacroLoading(true)
      setMacroError('')
      try {
        const response = await fetchMacroData(apiBase, {
          key: macroKey,
          start: macroRange.start,
          end: macroRange.end,
          signal: controller.signal,
        })
        const payload = response.data || null
        const values = payload?.[macroKey] || []
        const hasValues = Array.isArray(values) && values.some((val) => val != null && !Number.isNaN(val))
        if (!hasValues && !refreshAttemptRef.current.has(macroKey)) {
          refreshAttemptRef.current.add(macroKey)
          const refreshed = await fetchMacroData(apiBase, {
            key: macroKey,
            start: macroRange.start,
            end: macroRange.end,
            refresh: true,
            signal: controller.signal,
          })
          setMacroData(refreshed.data || null)
        } else {
          setMacroData(payload)
        }
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
  }, [apiBase, macroKey, macroRange])

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

  return {
    macroSeries,
    macroKey,
    setMacroKey,
    macroData,
    macroLoading,
    macroError,
    macroOverlaySeries,
    selectedMacroSpec,
  }
}
