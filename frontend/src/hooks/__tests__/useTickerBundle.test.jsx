import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import useTickerBundle from '../useTickerBundle'

describe('useTickerBundle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads bundle data and delayed news', async () => {
    const { result } = renderHook(() =>
      useTickerBundle({
        apiBase: 'http://test',
        ticker: 'AAPL',
        period: '1Y',
        interval: '1d',
      }),
    )

    await waitFor(() => {
      expect(result.current.tickerData).not.toBeNull()
    })

    act(() => {
      vi.advanceTimersByTime(1300)
    })

    await waitFor(() => {
      expect(result.current.news.length).toBeGreaterThan(0)
    })
  })
})
