import { useCallback, useRef, useState } from 'react'
import { PRICE_OVERLAYS } from '../../constants'
import useOutsideClick from '../../hooks/useOutsideClick'

export default function ChartToolbar({
  activeOverlays,
  onToggleOverlay,
  patternsActive,
  onTogglePatterns,
  measureActive,
  onToggleMeasure,
  fibActive,
  onToggleFib,
  fibRangeActive,
  onToggleFibRange,
  macroOverlayActive,
  onToggleMacroOverlay,
  macroOverlayLabel,
  macroOverlayAvailable,
}) {
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(false)
  const overlayMenuRef = useRef(null)
  const closeMenu = useCallback(() => setOverlayMenuOpen(false), [])
  useOutsideClick(overlayMenuRef, closeMenu)

  return (
    <div className="chart-toolbar">
      <div className="overlay-dropdown" ref={overlayMenuRef}>
        <button type="button" className="secondary-btn dropdown-trigger" onClick={() => setOverlayMenuOpen((prev) => !prev)}>
          Price overlays
        </button>
        {overlayMenuOpen && (
          <div className="dropdown-panel">
            {PRICE_OVERLAYS.map((overlay) => (
              <label key={overlay.key}>
                <input
                  type="checkbox"
                  checked={activeOverlays.has(overlay.key)}
                  onChange={() => onToggleOverlay(overlay.key)}
                />
                {overlay.label}
              </label>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className={`secondary-btn ${patternsActive ? 'active' : ''}`}
        onClick={onTogglePatterns}
      >
        Patterns
      </button>
      <button
        type="button"
        className={`secondary-btn ${measureActive ? 'active' : ''}`}
        onClick={onToggleMeasure}
        title="Measure move between two points"
      >
        Measure
      </button>
      <button
        type="button"
        className={`secondary-btn ${fibActive ? 'active' : ''}`}
        onClick={onToggleFib}
        title="Click a point to anchor fib levels"
      >
        Fib
      </button>
      <button
        type="button"
        className={`secondary-btn ${fibRangeActive ? 'active' : ''}`}
        onClick={onToggleFibRange}
        title="Click two points to draw retracement levels"
      >
        Fib 2-Point
      </button>
      <button
        type="button"
        className={`secondary-btn ${macroOverlayActive ? 'active' : ''}`}
        onClick={onToggleMacroOverlay}
        disabled={!macroOverlayAvailable}
        title={macroOverlayLabel ? `Overlay: ${macroOverlayLabel}` : 'Macro overlay'}
      >
        Macro Overlay
      </button>
    </div>
  )
}
