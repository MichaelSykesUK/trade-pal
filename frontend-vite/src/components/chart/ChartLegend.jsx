export default function ChartLegend({ items }) {
  if (!items?.length) return null
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <div className="legend-item" key={item.key}>
          <span className="legend-swatch" style={{ backgroundColor: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
