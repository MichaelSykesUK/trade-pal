const envBase = import.meta?.env?.VITE_API_BASE || globalThis.__VITE_API_BASE__ || 'http://localhost:8000'
export const API_BASE = envBase
