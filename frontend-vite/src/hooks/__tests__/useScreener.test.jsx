import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import useScreener from '../useScreener'

describe('useScreener', () => {
  it('loads and sorts rows by default metric', async () => {
    const { result } = renderHook(() => useScreener({ apiBase: 'http://test' }))
    await act(async () => {
      await result.current.fetchScreener()
    })
    expect(result.current.displayRows[0].ticker).toBe('BBB')
    expect(result.current.displayRows[1].ticker).toBe('AAA')
  })

  it('filters rows by query', async () => {
    const { result } = renderHook(() => useScreener({ apiBase: 'http://test' }))
    await act(async () => {
      await result.current.fetchScreener()
    })
    act(() => {
      result.current.setQuery('alpha')
    })
    expect(result.current.displayRows).toHaveLength(1)
    expect(result.current.displayRows[0].ticker).toBe('AAA')
  })
})
