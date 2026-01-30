import { useCallback, useRef, useState } from 'react'
import useOutsideClick from '../hooks/useOutsideClick'

export default function MenuSelect({
  label,
  valueLabel,
  options,
  selectedValue,
  onSelect,
  disabled,
  alignRight = false,
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const closeMenu = useCallback(() => setOpen(false), [])

  useOutsideClick(menuRef, closeMenu)

  return (
    <div className={`menu-select ${alignRight ? 'menu-right' : ''}`} ref={menuRef}>
      <button
        type="button"
        className="secondary-btn menu-trigger"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <span className="menu-label">{label}:</span>
        <span className="menu-value">{valueLabel}</span>
        <span className="menu-caret">v</span>
      </button>
      {open && (
        <div className="menu-panel">
          {options.map((option) => {
            const selected = option.value === selectedValue
            return (
              <button
                key={`${label}-${String(option.value)}`}
                type="button"
                className={`menu-item ${selected ? 'selected' : ''}`}
                disabled={option.disabled}
                onClick={() => {
                  setOpen(false)
                  onSelect(option.value)
                }}
              >
                <span className={`menu-check ${selected ? 'on' : ''}`} aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
