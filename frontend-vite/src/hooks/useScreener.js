import { useCallback, useEffect, useMemo, useState } from 'react'
import { SCREENER_METRICS } from '../constants'
import { fetchScreener as fetchScreenerApi } from '../api'

export default function useScreener({ apiBase }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [metric, setMetric] = useState('fcfYield')
  const [order, setOrder] = useState('desc')
  const [open, setOpen] = useState(false)
  const [sort, setSort] = useState({ key: 'fcfYield', direction: 'desc' })
  const [query, setQuery] = useState('')
  const [autoFill, setAutoFill] = useState(false)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [universeSize, setUniverseSize] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [complete, setComplete] = useState(false)
  const [requested, setRequested] = useState(false)

  const fetchScreener = useCallback(
    async ({ refresh = false } = {}) => {
      setRequested(true)
      setLoading(true)
      setError('')
      try {
        const data = await fetchScreenerApi(apiBase, { metric, order, refresh })
        const nextRows = Array.isArray(data.rows) ? data.rows : []
        setRows((prev) => {
          if (refresh) return nextRows
          const merged = new Map(prev.map((row) => [row.ticker, row]))
          nextRows.forEach((row) => {
            const existing = merged.get(row.ticker) || {}
            merged.set(row.ticker, { ...existing, ...row })
          })
          return Array.from(merged.values())
        })
        setRemaining(data.remaining || 0)
        setComplete(Boolean(data.complete))
        setUniverseSize(data.universeSize || 0)
        setCooldownSeconds(Number(data.cooldownSeconds || 0))
      } catch (err) {
        setError(err.message || 'Unable to load screener.')
      } finally {
        setLoading(false)
      }
    },
    [apiBase, metric, order],
  )

  const handleMetricChange = useCallback((nextMetric) => {
    const meta = SCREENER_METRICS.find((item) => item.key === nextMetric)
    const nextOrder = meta?.order || 'desc'
    setMetric(nextMetric)
    setOrder(nextOrder)
    setSort({ key: nextMetric, direction: nextOrder })
  }, [])

  const handleOrderChange = useCallback(
    (nextOrder) => {
      setOrder(nextOrder)
      setSort((prev) => ({
        key: prev.key || metric,
        direction: nextOrder,
      }))
    },
    [metric],
  )

  const handleSort = useCallback((key) => {
    setSort((prev) => {
      if (prev.key === key) {
        const nextDir = prev.direction === 'asc' ? 'desc' : 'asc'
        return { key, direction: nextDir }
      }
      return { key, direction: 'desc' }
    })
  }, [])

  const displayRows = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    let nextRows = Array.isArray(rows) ? [...rows] : []
    if (trimmed) {
      nextRows = nextRows.filter((row) => {
        const haystack = `${row.ticker || ''} ${row.companyName || ''} ${row.sector || ''} ${row.industry || ''}`.toLowerCase()
        return haystack.includes(trimmed)
      })
    }
    const sortKey = sort.key || metric
    const direction = sort.direction || order
    nextRows.sort((a, b) => {
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
    return nextRows
  }, [rows, query, sort, metric, order])

  useEffect(() => {
    if (!autoFill) return
    if (complete || error) {
      setAutoFill(false)
      return
    }
    if (loading) return
    const delay = cooldownSeconds > 0 ? cooldownSeconds * 1000 + 500 : requested ? 6000 : 800
    const handle = setTimeout(() => {
      fetchScreener({ refresh: !requested })
    }, delay)
    return () => clearTimeout(handle)
  }, [autoFill, complete, error, loading, requested, cooldownSeconds, fetchScreener])

  return {
    rows,
    displayRows,
    loading,
    error,
    metric,
    order,
    open,
    setOpen,
    sort,
    query,
    setQuery,
    autoFill,
    setAutoFill,
    cooldownSeconds,
    universeSize,
    remaining,
    complete,
    requested,
    fetchScreener,
    handleMetricChange,
    handleOrderChange,
    handleSort,
  }
}
