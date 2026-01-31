import { TIMEFRAMES } from '../constants'

export function transformStockResponse(payload) {
  if (!payload?.Date?.length) return { candles: [], volumes: [] }
  const candles = payload.Date.map((date, idx) => ({
    time: Math.floor(new Date(date).getTime() / 1000),
    open: Number(payload.Open[idx]),
    high: Number(payload.High[idx]),
    low: Number(payload.Low[idx]),
    close: Number(payload.Close[idx]),
  }))
  const volumes = payload.Date.map((date, idx) => ({
    time: Math.floor(new Date(date).getTime() / 1000),
    value: Number(payload.Volume[idx] || 0),
    color:
      Number(payload.Close[idx]) >= Number(payload.Open[idx])
        ? 'rgba(76, 175, 80, 0.5)'
        : 'rgba(244, 67, 54, 0.5)',
  }))
  return { candles, volumes }
}

export function buildOverlaySeries(indicators, key) {
  if (!indicators?.Date) return []
  const series = indicators[key]
  if (!series) return []
  return indicators.Date.map((date, idx) => {
    const value = series[idx]
    if (value === null || value === undefined) return null
    return {
      time: Math.floor(new Date(date).getTime() / 1000),
      value: Number(value),
    }
  }).filter(Boolean)
}

export function detectPatterns(candles) {
  if (!candles || candles.length < 30) return { levels: [], markers: [], necklines: [] }
  const highs = candles.map((c) => c.high ?? c.close)
  const lows = candles.map((c) => c.low ?? c.close)
  const closes = candles.map((c) => c.close)
  const times = candles.map((c) => c.time)

  const pivots = findPivots(highs, lows, 3)
  const resistanceClusters = clusterLevels(pivots.highs, 0.006, 2)
  const supportClusters = clusterLevels(pivots.lows, 0.006, 2)
  const levels = [
    ...supportClusters.slice(0, 3).map((lvl) => ({ value: lvl.value, kind: 'support' })),
    ...resistanceClusters.slice(0, 3).map((lvl) => ({ value: lvl.value, kind: 'resistance' })),
  ]

  const markers = []
  const necklines = []

  const doubleTop = detectDoubleTop(pivots.highs, lows)
  if (doubleTop) {
    markers.push({
      time: times[doubleTop.index],
      position: 'aboveBar',
      color: '#ef4444',
      shape: 'arrowDown',
      text: 'Double Top',
    })
  }

  const doubleBottom = detectDoubleBottom(pivots.lows, highs)
  if (doubleBottom) {
    markers.push({
      time: times[doubleBottom.index],
      position: 'belowBar',
      color: '#10b981',
      shape: 'arrowUp',
      text: 'Double Bottom',
    })
  }

  const hns = detectHeadShoulders(pivots.highs, lows)
  if (hns) {
    markers.push({
      time: times[hns.headIndex],
      position: 'aboveBar',
      color: '#f97316',
      shape: 'arrowDown',
      text: 'Head & Shoulders',
    })
    necklines.push({
      points: [
        { time: times[hns.neckline[0]], value: lows[hns.neckline[0]] },
        { time: times[hns.neckline[1]], value: lows[hns.neckline[1]] },
      ],
    })
  }

  const ihs = detectInverseHeadShoulders(pivots.lows, highs)
  if (ihs) {
    markers.push({
      time: times[ihs.headIndex],
      position: 'belowBar',
      color: '#0ea5e9',
      shape: 'arrowUp',
      text: 'Inverse H&S',
    })
    necklines.push({
      points: [
        { time: times[ihs.neckline[0]], value: highs[ihs.neckline[0]] },
        { time: times[ihs.neckline[1]], value: highs[ihs.neckline[1]] },
      ],
    })
  }

  const flag = detectFlag(candles)
  if (flag) {
    markers.push({
      time: times[candles.length - 1],
      position: flag.type === 'bull' ? 'belowBar' : 'aboveBar',
      color: flag.type === 'bull' ? '#22c55e' : '#ef4444',
      shape: flag.type === 'bull' ? 'arrowUp' : 'arrowDown',
      text: flag.type === 'bull' ? 'Bull Flag' : 'Bear Flag',
    })
  }

  const triangle = detectTriangle(pivots, candles)
  if (triangle) {
    markers.push({
      time: times[candles.length - 1],
      position: 'aboveBar',
      color: '#6366f1',
      shape: 'circle',
      text: triangle,
    })
  }

  const breakout = detectBreakout(closes, levels)
  if (breakout) {
    markers.push({
      time: times[candles.length - 1],
      position: breakout.type === 'up' ? 'belowBar' : 'aboveBar',
      color: breakout.type === 'up' ? '#22c55e' : '#ef4444',
      shape: breakout.type === 'up' ? 'arrowUp' : 'arrowDown',
      text: breakout.type === 'up' ? 'Breakout' : 'Breakdown',
    })
  }

  return { levels, markers, necklines }
}

function findPivots(highs, lows, window = 3) {
  const highsOut = []
  const lowsOut = []
  for (let i = window; i < highs.length - window; i += 1) {
    const highSlice = highs.slice(i - window, i + window + 1)
    const lowSlice = lows.slice(i - window, i + window + 1)
    const high = highs[i]
    const low = lows[i]
    if (high === Math.max(...highSlice)) highsOut.push({ index: i, value: high })
    if (low === Math.min(...lowSlice)) lowsOut.push({ index: i, value: low })
  }
  return { highs: highsOut, lows: lowsOut }
}

function clusterLevels(points, tolerancePct = 0.006, minTouches = 2) {
  const clusters = []
  points
    .slice()
    .sort((a, b) => a.value - b.value)
    .forEach((point) => {
      const existing = clusters.find((c) => Math.abs(point.value - c.value) / c.value <= tolerancePct)
      if (existing) {
        existing.total += point.value
        existing.count += 1
        existing.value = existing.total / existing.count
      } else {
        clusters.push({ value: point.value, total: point.value, count: 1 })
      }
    })
  return clusters.filter((c) => c.count >= minTouches).sort((a, b) => b.count - a.count)
}

function detectDoubleTop(highs, lows) {
  if (highs.length < 3) return null
  const recent = highs.slice(-6)
  for (let i = recent.length - 1; i >= 1; i -= 1) {
    const top2 = recent[i]
    const top1 = recent[i - 1]
    if (!top1 || !top2) continue
    const diff = Math.abs(top2.value - top1.value) / top1.value
    if (diff > 0.012) continue
    if (top2.index - top1.index < 4) continue
    const valley = Math.min(...lows.slice(top1.index, top2.index + 1))
    if (valley < top1.value * 0.97) {
      return { index: top2.index }
    }
  }
  return null
}

function detectDoubleBottom(lows, highs) {
  if (lows.length < 3) return null
  const recent = lows.slice(-6)
  for (let i = recent.length - 1; i >= 1; i -= 1) {
    const low2 = recent[i]
    const low1 = recent[i - 1]
    if (!low1 || !low2) continue
    const diff = Math.abs(low2.value - low1.value) / low1.value
    if (diff > 0.012) continue
    if (low2.index - low1.index < 4) continue
    const peak = Math.max(...highs.slice(low1.index, low2.index + 1))
    if (peak > low1.value * 1.03) {
      return { index: low2.index }
    }
  }
  return null
}

function detectHeadShoulders(highs, lows) {
  if (highs.length < 5) return null
  const recent = highs.slice(-7)
  for (let i = 0; i < recent.length - 2; i += 1) {
    const left = recent[i]
    const head = recent[i + 1]
    const right = recent[i + 2]
    if (!left || !head || !right) continue
    if (head.value <= left.value || head.value <= right.value) continue
    const shoulderDiff = Math.abs(left.value - right.value) / left.value
    if (shoulderDiff > 0.03) continue
    const valley1Idx = findExtremeIndex(lows, left.index, head.index, 'min')
    const valley2Idx = findExtremeIndex(lows, head.index, right.index, 'min')
    if (valley1Idx == null || valley2Idx == null) continue
    return { headIndex: head.index, neckline: [valley1Idx, valley2Idx] }
  }
  return null
}

function detectInverseHeadShoulders(lows, highs) {
  if (lows.length < 5) return null
  const recent = lows.slice(-7)
  for (let i = 0; i < recent.length - 2; i += 1) {
    const left = recent[i]
    const head = recent[i + 1]
    const right = recent[i + 2]
    if (!left || !head || !right) continue
    if (head.value >= left.value || head.value >= right.value) continue
    const shoulderDiff = Math.abs(left.value - right.value) / left.value
    if (shoulderDiff > 0.03) continue
    const peak1Idx = findExtremeIndex(highs, left.index, head.index, 'max')
    const peak2Idx = findExtremeIndex(highs, head.index, right.index, 'max')
    if (peak1Idx == null || peak2Idx == null) continue
    return { headIndex: head.index, neckline: [peak1Idx, peak2Idx] }
  }
  return null
}

function findExtremeIndex(values, start, end, mode) {
  if (end <= start) return null
  const slice = values.slice(start, end + 1)
  if (!slice.length) return null
  const extreme = mode === 'min' ? Math.min(...slice) : Math.max(...slice)
  const idx = slice.indexOf(extreme)
  return idx >= 0 ? start + idx : null
}

function detectFlag(candles) {
  if (candles.length < 30) return null
  const start = candles.length - 30
  const end = candles.length - 1
  const startClose = candles[start].close
  const endClose = candles[end].close
  if (!startClose || !endClose) return null
  const move = (endClose - startClose) / startClose
  const recent = candles.slice(end - 10, end + 1)
  const recentHigh = Math.max(...recent.map((c) => c.high ?? c.close))
  const recentLow = Math.min(...recent.map((c) => c.low ?? c.close))
  const recentRange = (recentHigh - recentLow) / startClose
  if (Math.abs(move) > 0.08 && recentRange < Math.abs(move) * 0.35) {
    return { type: move > 0 ? 'bull' : 'bear' }
  }
  return null
}

function detectTriangle(pivots, candles) {
  const window = 25
  if (candles.length < window) return null
  const start = candles.length - window
  const highs = pivots.highs.filter((p) => p.index >= start)
  const lows = pivots.lows.filter((p) => p.index >= start)
  if (highs.length < 2 || lows.length < 2) return null
  const firstHigh = highs[0]
  const lastHigh = highs[highs.length - 1]
  const firstLow = lows[0]
  const lastLow = lows[lows.length - 1]
  const highSlope = (lastHigh.value - firstHigh.value) / Math.max(1, lastHigh.index - firstHigh.index)
  const lowSlope = (lastLow.value - firstLow.value) / Math.max(1, lastLow.index - firstLow.index)
  const avg = (firstHigh.value + firstLow.value) / 2
  if (Math.abs(highSlope) / avg < 0.0005 && lowSlope / avg > 0.0007) {
    return 'Ascending Triangle'
  }
  if (Math.abs(lowSlope) / avg < 0.0005 && highSlope / avg < -0.0007) {
    return 'Descending Triangle'
  }
  return null
}

function detectBreakout(closes, levels) {
  if (!levels?.length || closes.length < 2) return null
  const last = closes[closes.length - 1]
  const tol = last * 0.004
  const resistances = levels.filter((l) => l.kind === 'resistance').map((l) => l.value)
  const supports = levels.filter((l) => l.kind === 'support').map((l) => l.value)
  if (resistances.length) {
    const top = Math.max(...resistances)
    if (last > top + tol) return { type: 'up' }
  }
  if (supports.length) {
    const bottom = Math.min(...supports)
    if (last < bottom - tol) return { type: 'down' }
  }
  return null
}

export function getBarSpacing(period, intervalOverride) {
  const baseInterval = TIMEFRAMES.find((item) => item.value === period)?.interval || '1d'
  const interval = intervalOverride || baseInterval
  if (interval === '1mo' || interval === '3mo') return 10
  if (interval === '1wk') return 8
  if (interval === '1d') {
    if (period === '5Y' || period === 'MAX') return 4
    if (period === '1Y' || period === '6M' || period === 'YTD') return 7
    return 6
  }
  if (interval === '1h' || interval === '30m') return 4
  return 5
}
