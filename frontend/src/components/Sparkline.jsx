import { useMemo } from 'react'

function buildPaths(values, width, height) {
  if (!values || values.length < 2) {
    return { line: '', area: '' }
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const innerWidth = Math.max(width - 2, 1)
  const innerHeight = Math.max(height - 2, 1)
  const step = innerWidth / (values.length - 1)
  const points = values.map((value, idx) => {
    const x = 1 + idx * step
    const y = 1 + innerHeight - ((value - min) / range) * innerHeight
    return { x, y }
  })
  const line = points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${pt.x} ${pt.y}`).join(' ')
  const area = `${line} L${points[points.length - 1].x} ${height - 1} L${points[0].x} ${height - 1} Z`
  return { line, area }
}

export default function Sparkline({ values = [], width = 72, height = 24 }) {
  const cleaned = useMemo(
    () => values.filter((val) => typeof val === 'number' && Number.isFinite(val)),
    [values],
  )
  const trend = cleaned.length > 1 ? cleaned[cleaned.length - 1] - cleaned[0] : 0
  const stroke = trend >= 0 ? '#16a34a' : '#ef4444'
  const fill = trend >= 0 ? 'rgba(22, 163, 74, 0.16)' : 'rgba(239, 68, 68, 0.16)'
  const { line, area } = useMemo(() => buildPaths(cleaned, width, height), [cleaned, width, height])

  if (!line) {
    return <div className="sparkline sparkline-empty">--</div>
  }

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={area} fill={fill} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
