import { useCallback, useRef, useState } from 'react'
import { PRICE_OVERLAYS } from '../../constants'
import useOutsideClick from '../../hooks/useOutsideClick'

export default function ChartToolbar({
  activeOverlays,
  onToggleOverlay,
  patternsActive,
  onTogglePatterns,
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
