import { useEffect } from 'react'

export default function useOutsideClick(ref, onOutsideClick) {
  useEffect(() => {
    const handleClick = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return
      onOutsideClick(event)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [ref, onOutsideClick])
}
