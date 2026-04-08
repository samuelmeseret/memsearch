import { useState, useEffect, useCallback } from 'react'
import { getPeople, refreshPeople } from '../api'
import type { PersonInfo } from '../types'

export function usePeople(): {
  people: PersonInfo[]
  isLoading: boolean
  isRefreshing: boolean
  refresh: () => Promise<void>
} {
  const [people, setPeople] = useState<PersonInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchPeople = useCallback(() => {
    setIsLoading(true)
    getPeople()
      .then((data) => setPeople(data))
      .catch(() => setPeople([]))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    fetchPeople()
  }, [fetchPeople])

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await refreshPeople()
      // Re-fetch the updated list
      const data = await getPeople()
      setPeople(data)
    } catch {
      // ignore
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  return { people, isLoading, isRefreshing, refresh }
}
