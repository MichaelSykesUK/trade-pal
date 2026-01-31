import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import useWatchlist from '../useWatchlist'

describe('useWatchlist', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads watchlist from API when localStorage is empty', async () => {
    const { result } = renderHook(() =>
      useWatchlist({ apiBase: 'http://test', defaultWatchlist: ['AAPL'] }),
    )

    await waitFor(() => {
      expect(result.current.watchlistReady).toBe(true)
    })

    expect(result.current.watchlist).toEqual(['AAPL', 'MSFT'])
  })

  it('adds and removes tickers', async () => {
    const { result } = renderHook(() =>
      useWatchlist({ apiBase: 'http://test', defaultWatchlist: ['AAPL'] }),
    )

    await waitFor(() => {
      expect(result.current.watchlistReady).toBe(true)
    })

    act(() => {
      result.current.add('nvda')
    })
    expect(result.current.watchlist).toContain('NVDA')

    act(() => {
      result.current.remove('AAPL')
    })
    expect(result.current.watchlist).not.toContain('AAPL')
  })
})
