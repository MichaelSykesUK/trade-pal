import { CANDLE_INTERVALS, CHART_TYPES, TIMEFRAMES } from '../../constants'
import MenuSelect from '../MenuSelect'

export default function ChartHeader({
  ticker,
  companyName,
  exchange,
  formattedPrice,
  priceChange,
  priceChangePct,
  priceTrendClass,
  period,
  onPeriodChange,
  intervalOverride,
  onIntervalChange,
  chartType,
  onChartTypeChange,
  baseIntervalLabel,
  onAddWatchlist,
}) {
  return (
    <div className="panel-header">
      <div className="chart-title-block">
        <div>
          <div className="ticker-line">
            <h2>{ticker}</h2>
            <button className="secondary-btn" type="button" onClick={onAddWatchlist}>
              + Watchlist
            </button>
          </div>
          <div className="company-line">
            <span>{companyName}</span>
            {exchange && <span className="exchange-tag">{exchange}</span>}
          </div>
        </div>
        <div className={`price-line ${priceTrendClass}`}>
          <span className="current-price">{formattedPrice}</span>
          {(priceChange || priceChangePct) && (
            <span className="price-delta">
              {priceChange} {priceChangePct}
            </span>
          )}
        </div>
      </div>
      <div className="chart-actions">
        <div className="timeframe-controls">
          {TIMEFRAMES.map((item) => (
            <button
              key={item.value}
              className={`timeframe-btn ${item.value === period ? 'active' : ''}`}
              onClick={() => onPeriodChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <MenuSelect
          label="Interval"
          valueLabel={
            intervalOverride
              ? CANDLE_INTERVALS.find((item) => item.value === intervalOverride)?.label
              : `Auto (${baseIntervalLabel})`
          }
          options={CANDLE_INTERVALS.map((item) => ({
            value: item.value ?? '',
            label: item.value ? item.label : `Auto (${baseIntervalLabel})`,
          }))}
          selectedValue={intervalOverride ?? ''}
          onSelect={(value) => onIntervalChange(value ? value : null)}
        />
        <MenuSelect
          label="Chart"
          valueLabel={CHART_TYPES.find((type) => type.key === chartType)?.label}
          options={CHART_TYPES.map((type) => ({
            value: type.key,
            label: type.label,
          }))}
          selectedValue={chartType}
          onSelect={(value) => onChartTypeChange(value)}
        />
      </div>
    </div>
  )
}
