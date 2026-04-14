import { useState, useEffect, useRef, useCallback } from 'react'
import { getStatus } from '../api'
import type { IndexStatus } from '../types'

interface UseStatusResult {
  status: IndexStatus | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

// Tolerate one failed poll before surfacing an error — restarts and transient
// hangs routinely drop a single /status request, and flashing a hard error is
// noisy.
const FAILURE_THRESHOLD = 2

export function useStatus(idleInterval: number = 3000, activeInterval: number = 1000): UseStatusResult {
  const [status, setStatus] = useState<IndexStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inFlightRef = useRef(false)
  const failuresRef = useRef(0)

  const fetchStatus = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const s = await getStatus()
      setStatus(s)
      setError(null)
      failuresRef.current = 0
    } catch (err) {
      failuresRef.current += 1
      if (failuresRef.current >= FAILURE_THRESHOLD) {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not connect to backend'
        )
      }
    } finally {
      inFlightRef.current = false
      setIsLoading(false)
    }
  }, [])

  // Poll faster while indexing so the progress bar feels live.
  const interval = status?.is_indexing ? activeInterval : idleInterval

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, interval)
    return () => clearInterval(id)
  }, [interval, fetchStatus])

  return { status, isLoading, error, refresh: fetchStatus }
}
