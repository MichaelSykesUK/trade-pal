import { useCallback, useEffect, useState } from 'react'
import { getWatchlist, saveWatchlist } from '../api'

export default function useWatchlist({ apiBase, defaultWatchlist }) {
  const [watchlist, setWatchlist] = useState(defaultWatchlist)
  const [watchlistReady, setWatchlistReady] = useState(false)

  useEffect(() => {
    const loadWatchlist = async () => {
      const saved = localStorage.getItem('tradepal:watchlist')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed) && parsed.length) {
            setWatchlist(parsed)
            setWatchlistReady(true)
            return
          }
        } catch (_) {}
      }
      try {
        const data = await getWatchlist(apiBase)
        if (Array.isArray(data.watchlist) && data.watchlist.length) {
          setWatchlist(data.watchlist)
          setWatchlistReady(true)
          return
        }
      } catch (_) {}
      setWatchlist(defaultWatchlist)
      setWatchlistReady(true)
    }
    loadWatchlist()
  }, [apiBase, defaultWatchlist])

  useEffect(() => {
    if (!watchlistReady) return
    localStorage.setItem('tradepal:watchlist', JSON.stringify(watchlist))
  }, [watchlist, watchlistReady])

  useEffect(() => {
    if (!watchlistReady) return
    const handle = setTimeout(async () => {
      try {
        await saveWatchlist(apiBase, watchlist)
      } catch (_) {}
    }, 400)
    return () => clearTimeout(handle)
  }, [watchlist, watchlistReady, apiBase])

  const add = useCallback((symbol) => {
    const cleaned = (symbol || '').trim().toUpperCase()
    if (!cleaned) return
    setWatchlist((prev) => (prev.includes(cleaned) ? prev : [...prev, cleaned]))
  }, [])

  const remove = useCallback((symbol) => {
    setWatchlist((prev) => prev.filter((item) => item !== symbol))
  }, [])

  return { watchlist, setWatchlist, watchlistReady, add, remove }
}
