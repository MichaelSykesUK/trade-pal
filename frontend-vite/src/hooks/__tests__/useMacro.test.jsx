import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import useMacro from '../useMacro'

describe('useMacro', () => {
  it('loads macro series and data', async () => {
    const candles = [
      { time: 1704067200, close: 100 },
      { time: 1704153600, close: 101 },
      { time: 1704240000, close: 102 },
    ]

    const { result } = renderHook(() =>
      useMacro({ apiBase: 'http://test', candles }),
    )

    await waitFor(() => {
      expect(result.current.macroSeries.length).toBeGreaterThan(0)
    })

    await waitFor(() => {
      expect(result.current.macroData).not.toBeNull()
    })

    expect(result.current.macroOverlaySeries.length).toBeGreaterThan(0)
  })
})
