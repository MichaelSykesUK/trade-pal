import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import useMlModels from '../useMlModels'

describe('useMlModels', () => {
  it('loads models and applies allowlist', async () => {
    const { result } = renderHook(() => useMlModels({ apiBase: 'http://test' }))

    await waitFor(() => {
      expect(result.current.length).toBeGreaterThan(0)
    })

    expect(result.current).toContain('XGBoost')
    expect(result.current).toContain('RandomForest')
  })
})
