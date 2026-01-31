import { useEffect, useState } from 'react'
import { fetchMlModels } from '../api'
import { ML_MODEL_ALLOWLIST } from '../constants'

export default function useMlModels({ apiBase }) {
  const [mlModels, setMlModels] = useState([])

  useEffect(() => {
    const loadModels = async () => {
      try {
        const data = await fetchMlModels(apiBase)
        if (Array.isArray(data)) {
          const filtered = data.filter((name) => ML_MODEL_ALLOWLIST.includes(name))
          setMlModels(filtered.length ? filtered : data)
        }
      } catch (_) {
        setMlModels(ML_MODEL_ALLOWLIST)
      }
    }
    loadModels()
  }, [apiBase])

  return mlModels
}
