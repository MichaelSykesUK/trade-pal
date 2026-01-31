import { useEffect, useState } from 'react'
import { API_BASE } from '../config'

export default function Header({ darkMode, onToggleDarkMode, onSearch }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([])
      return
    }
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const resp = await fetch(`${API_BASE}/autocomplete?q=${encodeURIComponent(query.trim())}`)
        const data = await resp.json().catch(() => ({}))
        setSuggestions(data.quotes?.slice(0, 7) || [])
      } catch (_) {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [query])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSearch(query.trim().toUpperCase())
    setSuggestions([])
  }

  return (
    <header id="topRibbon">
      <div id="topRibbonLeft">
        <form id="topSearchContainer" onSubmit={handleSubmit}>
          <input
            type="text"
            id="tickerSearch"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSearch(query.trim().toUpperCase())
                setSuggestions([])
              }
            }}
            placeholder="Search..."
          />
          <div
            id="searchClear"
            className="search-clear-btn"
            style={{ display: query ? 'block' : 'none' }}
            onClick={() => {
              setQuery('')
              setSuggestions([])
            }}
          >
            &times;
          </div>
          <div
            id="tickerSuggestions"
            className="autocomplete-suggestions"
            style={{ display: suggestions.length || loading ? 'block' : 'none' }}
          >
            {loading && <div className="suggestion-loading">Loading...</div>}
            {suggestions.map((item) => (
              <div
                key={item.symbol}
                className="suggestion-item"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSearch(item.symbol)
                  setQuery(item.symbol)
                  setSuggestions([])
                }}
              >
                {item.symbol}
                {item.shortname ? ` — ${item.shortname}` : ''}
              </div>
            ))}
          </div>
        </form>
      </div>
      <div id="topRibbonRight">
        <button className="secondary-btn dark-mode-toggle" onClick={onToggleDarkMode}>
          {darkMode ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>
    </header>
  )
}
