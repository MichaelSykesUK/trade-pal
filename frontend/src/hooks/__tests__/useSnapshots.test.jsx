import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import useSnapshots from '../useSnapshots'

describe('useSnapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetches snapshots after the delay when bundle is ready', async () => {
    const { result } = renderHook(() =>
      useSnapshots({
        apiBase: 'http://test',
        watchlist: ['AAPL'],
        bundleReady: true,
        marketIndexes: [{ ticker: '^GSPC' }],
      }),
    )

    act(() => {
      vi.advanceTimersByTime(3600)
    })

    await waitFor(() => {
      expect(Object.keys(result.current.snapshots).length).toBeGreaterThan(0)
    })
  })
})
