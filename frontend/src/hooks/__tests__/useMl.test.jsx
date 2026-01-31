import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import useMl from '../useMl'

describe('useMl', () => {
  it('runs ML and returns projections', async () => {
    const { result } = renderHook(() =>
      useMl({
        apiBase: 'http://test',
        ticker: 'AAPL',
        period: '1Y',
        interval: '1d',
      }),
    )

    await act(async () => {
      await result.current.runMl({
        model: 'XGBoost',
        days: 5,
        features: { ma50: true },
      })
    })

    expect(result.current.mlSeries.length).toBeGreaterThan(0)
    expect(result.current.mlMetrics).not.toBeNull()
  })

  it('clears ML state when ticker changes', async () => {
    const { result, rerender } = renderHook(
      ({ ticker }) =>
        useMl({
          apiBase: 'http://test',
          ticker,
          period: '1Y',
          interval: '1d',
        }),
      { initialProps: { ticker: 'AAPL' } },
    )

    await act(async () => {
      await result.current.runMl({
        model: 'XGBoost',
        days: 5,
        features: { ma50: true },
      })
    })

    expect(result.current.mlSeries.length).toBeGreaterThan(0)

    rerender({ ticker: 'MSFT' })

    await waitFor(() => {
      expect(result.current.mlSeries.length).toBe(0)
    })
  })
})
