import { useState, useEffect } from 'react'

type BackendHealth = 'connecting' | 'connected' | 'disconnected'

export function useBackendHealth(): BackendHealth {
  const [health, setHealth] = useState<BackendHealth>('connecting')

  useEffect(() => {
    // Listen for status from main process
    window.api.onBackendStatus((status: string) => {
      if (status === 'ready') setHealth('connected')
      else if (status === 'starting') setHealth('connecting')
      else setHealth('disconnected')
    })

    // Also do an initial check via HTTP
    const check = async (): Promise<void> => {
      try {
        const res = await fetch('http://127.0.0.1:7242/status')
        setHealth(res.ok ? 'connected' : 'disconnected')
      } catch {
        setHealth('disconnected')
      }
    }

    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  return health
}
