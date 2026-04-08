import { useState } from 'react'
import { SearchBar } from '../components/SearchBar'
import { SearchGrid } from '../components/SearchGrid'
import { EmptyState } from '../components/EmptyState'
import { useSearch } from '../hooks/useSearch'

export default function SearchPage(): JSX.Element {
  const [query, setQuery] = useState('')
  const [modality, setModality] = useState('all')
  const { results, isLoading, queryTime, error } = useSearch(query, modality)

  return (
    <div className="flex flex-col h-full">
      <SearchBar
        query={query}
        onQueryChange={setQuery}
        modality={modality}
        onModalityChange={setModality}
        queryTime={queryTime}
        isLoading={isLoading}
      />

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-4 mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {!query.trim() ? (
          <EmptyState type="no-query" />
        ) : results.length === 0 && !isLoading ? (
          <EmptyState type="no-results" query={query} />
        ) : (
          <SearchGrid results={results} />
        )}
      </div>
    </div>
  )
}
