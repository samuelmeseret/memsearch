import { Search, XCircle } from 'lucide-react'

interface EmptyStateProps {
  type: 'no-query' | 'no-results'
  query?: string
}

export function EmptyState({ type, query }: EmptyStateProps): JSX.Element {
  if (type === 'no-results') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <XCircle className="w-12 h-12 opacity-40" />
        <p className="text-lg font-medium">No Results</p>
        <p className="text-sm">No matches for &ldquo;{query}&rdquo;</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <Search className="w-12 h-12 opacity-40" />
      <p className="text-lg font-medium">Search Your Memory</p>
      <p className="text-sm">Type a natural language query to search your indexed files</p>
    </div>
  )
}
