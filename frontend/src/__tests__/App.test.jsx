import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import App from '../App'

vi.mock('lightweight-charts', () => {
  const makeSeries = () => ({
    setData: () => {},
    setMarkers: () => {},
    applyOptions: () => {},
  })
  const timeScale = () => ({
    applyOptions: () => {},
    fitContent: () => {},
    getVisibleLogicalRange: () => null,
    setVisibleLogicalRange: () => {},
    subscribeVisibleLogicalRangeChange: () => {},
    unsubscribeVisibleLogicalRangeChange: () => {},
  })
  return {
    createChart: () => ({
      addLineSeries: () => makeSeries(),
      addAreaSeries: () => makeSeries(),
      addCandlestickSeries: () => makeSeries(),
      addHistogramSeries: () => ({
        ...makeSeries(),
        applyOptions: () => {},
      }),
      applyOptions: () => {},
      timeScale,
      priceScale: () => ({ applyOptions: () => {} }),
      removeSeries: () => {},
      remove: () => {},
    }),
  }
})

describe('App integration', () => {
  it('renders watchlist from API', async () => {
    render(<App />)
    expect(await screen.findByText('AAPL')).toBeInTheDocument()
    expect(await screen.findByText('MSFT')).toBeInTheDocument()
  })

  it('loads screener rows when requested', async () => {
    render(<App />)

    fireEvent.click(await screen.findByText('Open'))
    fireEvent.click(await screen.findByText('Load'))

    expect(await screen.findByText('AAA')).toBeInTheDocument()
    expect(await screen.findByText('BBB')).toBeInTheDocument()
  })
})
