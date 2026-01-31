import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchSnapshots as fetchSnapshotsApi } from '../api'

export default function useSnapshots({ apiBase, watchlist, bundleReady, marketIndexes, sparklinePeriod }) {
  const [snapshots, setSnapshots] = useState({})
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchError, setBatchError] = useState('')
  const snapshotKeyRef = useRef('')
  const snapshotDelayRef = useRef()
  const initialLoadRef = useRef(true)
  const sparklinePeriodRef = useRef(sparklinePeriod)

  const fetchSnapshots = useCallback(async () => {
    const tickers = Array.from(
      new Set([...marketIndexes.map((ix) => ix.ticker), ...watchlist.map((w) => w.toUpperCase())]),
    )
    if (!tickers.length) return
    setBatchLoading(true)
    setBatchError('')
    try {
      const data = await fetchSnapshotsApi(apiBase, tickers, sparklinePeriod)
      setSnapshots(data)
    } catch (err) {
      setBatchError(err.message || 'Unable to load market data.')
    } finally {
      setBatchLoading(false)
    }
  }, [apiBase, watchlist, marketIndexes, sparklinePeriod])

  useEffect(() => {
    if (!bundleReady) return
    const key = `${watchlist.join(',')}|${sparklinePeriod || ''}`
    if (snapshotKeyRef.current === key) {
      return
    }
    snapshotKeyRef.current = key
    if (snapshotDelayRef.current) {
      clearTimeout(snapshotDelayRef.current)
    }
    const sparklineChanged = sparklinePeriodRef.current !== sparklinePeriod
    const delayMs = sparklineChanged ? 200 : initialLoadRef.current ? 3500 : 1400
    sparklinePeriodRef.current = sparklinePeriod
    snapshotDelayRef.current = setTimeout(() => {
      fetchSnapshots()
      if (initialLoadRef.current) {
        initialLoadRef.current = false
      }
    }, delayMs)
    return () => {
      if (snapshotDelayRef.current) {
        clearTimeout(snapshotDelayRef.current)
      }
    }
  }, [fetchSnapshots, watchlist, bundleReady])

  return { snapshots, batchLoading, batchError, fetchSnapshots }
}
