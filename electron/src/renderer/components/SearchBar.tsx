import { useState, useRef, useEffect } from 'react'
import { Search, User, X, RefreshCw } from 'lucide-react'
import { usePeople } from '../hooks/usePeople'

const MODALITY_OPTIONS = [
  { id: 'all', name: 'All Types' },
  { id: 'image', name: 'Images' },
  { id: 'pdf', name: 'PDFs' },
  { id: 'text', name: 'Text Files' }
]

interface SearchBarProps {
  query: string
  onQueryChange: (q: string) => void
  modality: string
  onModalityChange: (m: string) => void
  queryTime: number | null
  isLoading: boolean
}

export function SearchBar({
  query,
  onQueryChange,
  modality,
  onModalityChange,
  queryTime,
  isLoading
}: SearchBarProps): JSX.Element {
  const { people, isRefreshing, refresh } = usePeople()
  const [selectedPeople, setSelectedPeople] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mentionFilter, setMentionFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Build the actual query sent to backend: @mentions + semantic text
  const buildFullQuery = (text: string, persons: string[]): string => {
    const mentions = persons.map((n) =>
      n.includes(' ') ? `@"${n}"` : `@${n}`
    )
    return [...mentions, text].filter(Boolean).join(' ')
  }

  const filteredPeople = people.filter(
    (p) =>
      !selectedPeople.includes(p.name) &&
      p.name.toLowerCase().includes(mentionFilter.toLowerCase())
  )

  const handleInputChange = (value: string): void => {
    // Check if user just typed @
    const atIndex = value.lastIndexOf('@')
    if (atIndex !== -1 && (atIndex === 0 || value[atIndex - 1] === ' ')) {
      const partial = value.slice(atIndex + 1)
      // Only show suggestions if no space after the partial (still typing the name)
      if (!partial.includes(' ') || partial === '') {
        setMentionFilter(partial)
        setShowSuggestions(true)
        setSelectedIndex(0)
        return // Don't update the query yet while picking a person
      }
    }

    setShowSuggestions(false)
    onQueryChange(buildFullQuery(value, selectedPeople))
  }

  // The display text in the input (without @mentions).
  // Preserve trailing whitespace so the user can type multi-word queries —
  // trimming would strip the space on every keystroke (controlled input).
  const displayText = (() => {
    let text = query
    for (const name of selectedPeople) {
      const quoted = `@"${name}"`
      const unquoted = `@${name}`
      text = text.replace(quoted, '').replace(unquoted, '')
    }
    return text.replace(/^\s+/, '').replace(/ {2,}/g, ' ')
  })()

  const selectPerson = (name: string): void => {
    const newSelected = [...selectedPeople, name]
    setSelectedPeople(newSelected)
    setShowSuggestions(false)
    setMentionFilter('')

    // Remove the @partial from the input and rebuild query
    const input = inputRef.current
    if (input) {
      const currentVal = input.value
      const atIndex = currentVal.lastIndexOf('@')
      const cleanText = atIndex !== -1 ? currentVal.slice(0, atIndex).trim() : currentVal
      onQueryChange(buildFullQuery(cleanText, newSelected))
      // Reset input display
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  const removePerson = (name: string): void => {
    const newSelected = selectedPeople.filter((n) => n !== name)
    setSelectedPeople(newSelected)
    onQueryChange(buildFullQuery(displayText, newSelected))
    inputRef.current?.focus()
  }

  const scrollToIndex = (index: number): void => {
    const container = listRef.current
    if (!container) return
    const item = container.children[index] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    // Backspace on empty input removes last person chip
    if (e.key === 'Backspace' && displayText === '' && !showSuggestions && selectedPeople.length > 0) {
      const input = inputRef.current
      if (input && input.value === '') {
        removePerson(selectedPeople[selectedPeople.length - 1])
        return
      }
    }

    if (!showSuggestions || filteredPeople.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => {
        const next = Math.min(i + 1, filteredPeople.length - 1)
        scrollToIndex(next)
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => {
        const next = Math.max(i - 1, 0)
        scrollToIndex(next)
        return next
      })
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      selectPerson(filteredPeople[selectedIndex].name)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // Close suggestions on outside click
  useEffect(() => {
    if (!showSuggestions) return
    const handleClick = (): void => setShowSuggestions(false)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showSuggestions])

  // The raw input value — when suggestions are showing, include the @partial
  const inputValue = showSuggestions ? `@${mentionFilter}` : displayText

  return (
    <div className="relative flex items-center gap-2 px-4 py-2 border-b border-border">
      <Search className="w-4 h-4 text-muted-foreground shrink-0" />

      {/* Person chips */}
      {selectedPeople.map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 bg-primary/15 text-primary text-xs font-medium pl-1.5 pr-1 py-0.5 rounded-full shrink-0"
        >
          <User className="w-3 h-3" />
          <span className="max-w-[120px] truncate">{name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              removePerson(name)
            }}
            className="hover:bg-primary/20 rounded-full p-0.5"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}

      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          selectedPeople.length > 0
            ? 'Describe what you\u2019re looking for...'
            : 'Search your files... (type @ for people)'
        }
        autoFocus
        className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground min-w-[100px]"
      />
      {isLoading && (
        <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin shrink-0" />
      )}
      {queryTime !== null && !isLoading && (
        <span className="text-xs text-muted-foreground shrink-0">
          {queryTime.toFixed(0)}ms
        </span>
      )}
      <select
        value={modality}
        onChange={(e) => onModalityChange(e.target.value)}
        className="bg-secondary text-secondary-foreground text-xs rounded-md px-2 py-1 outline-none border border-border shrink-0"
      >
        {MODALITY_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>

      {/* People autocomplete dropdown */}
      {showSuggestions && (
        <div className="absolute left-4 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[220px] max-h-[240px] flex flex-col">
          <div ref={listRef} className="overflow-y-auto flex-1 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
          {filteredPeople.map((person, i) => (
            <button
              key={person.name}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
                i === selectedIndex
                  ? 'bg-accent text-accent-foreground'
                  : 'text-popover-foreground hover:bg-accent'
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                selectPerson(person.name)
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{person.name}</span>
              <span className="text-xs text-muted-foreground">
                {person.face_count}
              </span>
            </button>
          ))}
          {filteredPeople.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
          )}
          </div>
          <div className="border-t border-border mt-1 pt-1 shrink-0">
            <button
              className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => {
                e.preventDefault()
                refresh()
              }}
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Syncing from Photos...' : 'Sync people from Photos'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
