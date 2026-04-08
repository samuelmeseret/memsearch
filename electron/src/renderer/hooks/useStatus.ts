import { useState, useEffect } from 'react'
import { getStatus } from '../api'
import type { IndexStatus } from '../types'

interface UseStatusResult {
  status: IndexStatus | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useStatus(pollInterval: number = 3000): UseStatusResult {
  const [status, setStatus] = useState<IndexStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async (): Promise<void> => {
    try {
      const s = await getStatus()
      setStatus(s)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not connect to backend'
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, pollInterval)
    return () => clearInterval(interval)
  }, [pollInterval])

  return { status, isLoading, error, refresh: fetchStatus }
}
