import { useCallback, useEffect, useState } from 'react'
import { runMl as runMlApi } from '../api'

const EMPTY_STATE = {
  mlSeries: [],
  mlLoading: false,
  mlError: '',
  mlMetrics: null,
  mlValidation: null,
  mlModelUsed: null,
  mlRequestedModel: null,
  mlAutoRetrained: false,
  mlSearch: null,
  mlCached: false,
}

export default function useMl({ apiBase, ticker, period, interval }) {
  const [state, setState] = useState(EMPTY_STATE)

  const runMl = useCallback(
    async (config) => {
      if (!ticker) return
      setState((prev) => ({ ...prev, mlLoading: true, mlError: '' }))
      try {
        const data = await runMlApi(apiBase, {
          ticker,
          period,
          interval,
          model: config.model,
          days: config.days,
          features: config.features,
          refresh: config.refresh,
          arimaOrder: config.arimaOrder,
          scalerType: config.scalerType,
        })
        const projection =
          data.projected?.Date?.map((date, idx) => ({
            time: Math.floor(new Date(date).getTime() / 1000),
            value: data.projected.Predicted[idx],
          })) || []
        setState({
          mlSeries: projection,
          mlLoading: false,
          mlError: '',
          mlMetrics: data.metrics || null,
          mlValidation: data.validation || null,
          mlModelUsed: data.model_used || config.model,
          mlRequestedModel: data.requested_model || config.model,
          mlAutoRetrained: Boolean(data.auto_retrained),
          mlSearch: data.search || null,
          mlCached: Boolean(data.cached),
        })
      } catch (err) {
        setState({
          mlSeries: [],
          mlLoading: false,
          mlError: err.message || 'ML run failed.',
          mlMetrics: null,
          mlValidation: null,
          mlModelUsed: null,
          mlRequestedModel: null,
          mlAutoRetrained: false,
          mlSearch: null,
          mlCached: false,
        })
      }
    },
    [apiBase, interval, period, ticker],
  )

  const clearMl = useCallback(() => {
    setState(EMPTY_STATE)
  }, [])

  useEffect(() => {
    clearMl()
  }, [ticker, period, clearMl])

  return { ...state, runMl, clearMl }
}
