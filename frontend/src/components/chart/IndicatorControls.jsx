import { LOWER_INDICATORS } from '../../constants'
import MenuSelect from '../MenuSelect'

export default function IndicatorControls({
  leftIndicator,
  rightIndicator,
  onLeftChange,
  onRightChange,
}) {
  return (
    <div className="chart-controls">
      <div className="overlay-controls">
        <span className="control-label">Lower indicators:</span>
        <MenuSelect
          label="Left"
          valueLabel={LOWER_INDICATORS.find((indicator) => indicator.key === leftIndicator)?.label || 'None'}
          options={[
            { value: '', label: 'None' },
            ...LOWER_INDICATORS.map((indicator) => ({ value: indicator.key, label: indicator.label })),
          ]}
          selectedValue={leftIndicator}
          onSelect={onLeftChange}
        />
        <MenuSelect
          label="Right"
          valueLabel={LOWER_INDICATORS.find((indicator) => indicator.key === rightIndicator)?.label || 'None'}
          options={[
            { value: '', label: 'None' },
            ...LOWER_INDICATORS.map((indicator) => ({ value: indicator.key, label: indicator.label })),
          ]}
          selectedValue={rightIndicator}
          onSelect={onRightChange}
          alignRight
        />
      </div>
    </div>
  )
}
