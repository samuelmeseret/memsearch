import { ResultCard } from './ResultCard'
import type { SearchResult } from '../types'

interface SearchGridProps {
  results: SearchResult[]
}

export function SearchGrid({ results }: SearchGridProps): JSX.Element {
  return (
    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-4">
      {results.map((result) => (
        <ResultCard key={result.file_path} result={result} />
      ))}
    </div>
  )
}
