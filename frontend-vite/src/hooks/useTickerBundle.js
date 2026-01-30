import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchNews, fetchTickerBundle } from '../api'
import { transformStockResponse } from '../utils/chart'

export default function useTickerBundle({ apiBase, ticker, period, interval }) {
  const [tickerData, setTickerData] = useState(null)
  const [indicators, setIndicators] = useState(null)
  const [kpi, setKpi] = useState(null)
  const [news, setNews] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [bundleReady, setBundleReady] = useState(false)
  const tickerFetchRef = useRef(null)
  const newsFetchRef = useRef(null)
  const newsDelayRef = useRef(null)
  const initialLoadRef = useRef(true)
  const paramsRef = useRef('')

  const fetchTickerData = useCallback(
    async (symbol, frame) => {
      if (!symbol) return
      if (tickerFetchRef.current) {
        tickerFetchRef.current.abort()
      }
      if (newsFetchRef.current) {
        newsFetchRef.current.abort()
      }
      if (newsDelayRef.current) {
        clearTimeout(newsDelayRef.current)
        newsDelayRef.current = null
      }
      const controller = new AbortController()
      tickerFetchRef.current = controller
      setDataLoading(true)
      setDataError('')
      try {
        const payload = await fetchTickerBundle(apiBase, {
          ticker: symbol,
          period: frame,
          interval,
          signal: controller.signal,
        })
        const newsDelay = initialLoadRef.current ? 1200 : 600
        setTickerData(transformStockResponse(payload.stock || {}))
        setIndicators(payload.indicators || null)
        setKpi(payload.kpi || null)
        if (initialLoadRef.current) initialLoadRef.current = false
        newsDelayRef.current = setTimeout(async () => {
          const newsController = new AbortController()
          newsFetchRef.current = newsController
          try {
            const newsJson = await fetchNews(apiBase, { ticker: symbol, signal: newsController.signal })
            setNews(Array.isArray(newsJson) ? newsJson : [])
          } catch (err) {
            if (err.name !== 'AbortError') {
              // ignore transient news errors
            }
          } finally {
            if (newsFetchRef.current === newsController) {
              newsFetchRef.current = null
            }
          }
        }, newsDelay)
      } catch (err) {
        if (err.name === 'AbortError') return
        setDataError(err.message || 'Unable to load ticker data.')
      } finally {
        if (tickerFetchRef.current === controller) {
          tickerFetchRef.current = null
        }
        setDataLoading(false)
        setBundleReady(true)
      }
    },
    [apiBase, interval],
  )

  useEffect(() => {
    const key = `${ticker}-${period}-${interval}`
    if (paramsRef.current === key) {
      return
    }
    paramsRef.current = key
    fetchTickerData(ticker, period)
  }, [ticker, period, interval, fetchTickerData])

  return {
    tickerData,
    indicators,
    kpi,
    news,
    dataLoading,
    dataError,
    bundleReady,
  }
}
