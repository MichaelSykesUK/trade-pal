import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import useTheme from '../useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.dataset.theme = ''
  })

  it('loads theme from localStorage', () => {
    localStorage.setItem('tradepal:theme', 'dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.darkMode).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('toggles and persists theme', () => {
    const { result } = renderHook(() => useTheme())
    act(() => {
      result.current.toggle()
    })
    expect(result.current.darkMode).toBe(true)
    expect(localStorage.getItem('tradepal:theme')).toBe('dark')
    act(() => {
      result.current.toggle()
    })
    expect(result.current.darkMode).toBe(false)
    expect(localStorage.getItem('tradepal:theme')).toBe('light')
  })
})
