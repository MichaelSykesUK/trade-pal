import { useCallback, useEffect, useState } from 'react'

export default function useTheme(storageKey = 'tradepal:theme') {
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const storedTheme = localStorage.getItem(storageKey)
    if (storedTheme === 'dark') {
      setDarkMode(true)
    }
  }, [storageKey])

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem(storageKey, darkMode ? 'dark' : 'light')
  }, [darkMode, storageKey])

  const toggle = useCallback(() => {
    setDarkMode((prev) => !prev)
  }, [])

  return { darkMode, setDarkMode, toggle }
}
