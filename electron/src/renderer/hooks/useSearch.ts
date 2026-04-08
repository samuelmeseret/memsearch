import { useState, useEffect, useRef } from 'react'
import { search as searchApi } from '../api'
import type { SearchResult } from '../types'

interface UseSearchResult {
  results: SearchResult[]
  isLoading: boolean
  queryTime: number | null
  error: string | null
}

export function useSearch(query: string, modality: string): UseSearchResult {
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [queryTime, setQueryTime] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setQueryTime(null)
      setError(null)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      setError(null)
      try {
        const mod = modality === 'all' ? undefined : modality
        const res = await searchApi(query, 20, mod)
        setResults(res.results)
        setQueryTime(res.query_time_ms)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not connect to backend'
        )
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, modality])

  return { results, isLoading, queryTime, error }
}
