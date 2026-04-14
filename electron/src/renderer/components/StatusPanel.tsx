import { useState } from 'react'
import {
  HardDrive,
  Clock,
  Image,
  FileText,
  File,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Camera,
  Folder
} from 'lucide-react'
import * as Progress from '@radix-ui/react-progress'
import type { IndexStatus } from '../types'

interface StatusPanelProps {
  status: IndexStatus
}

function getModalityIcon(modality: string): JSX.Element {
  const cls = 'w-4 h-4'
  switch (modality) {
    case 'image':
      return <Image className={cls} />
    case 'pdf':
      return <FileText className={cls} />
    case 'text':
      return <File className={cls} />
    default:
      return <File className={cls} />
  }
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${Math.round(seconds)}s remaining`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `~${mins}m ${secs}s remaining`
}

function shortenPath(path: string): string {
  const home = path.match(/^\/Users\/[^/]+/)
  if (home) return path.replace(home[0], '~')
  return path
}

const PHASE_LABEL: Record<string, string> = {
  starting: 'Starting…',
  scanning_library: 'Fetching photo library…',
  filtering: 'Checking for new photos…',
  indexing: 'Indexing…',
  downloading: 'Downloading from iCloud…',
  embedding: 'Generating embeddings…',
}

function IndexingProgress({ status }: { status: IndexStatus }): JSX.Element {
  const [showFolders, setShowFolders] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const isPhotos = status.source === 'photos'
  const noun = isPhotos ? 'photos' : 'files'
  const Noun = isPhotos ? 'Photos' : 'Files'

  const done = status.indexed_count + status.error_count
  const total = status.total_files_found
  const isScanning = total === 0
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0

  // ETA calculation
  let etaText = ''
  if (status.start_time && status.indexed_count > 0 && total > done) {
    const elapsed = Date.now() / 1000 - status.start_time
    const rate = done / elapsed
    const remaining = (total - done) / rate
    etaText = formatEta(remaining)
  }

  const folderEntries = Object.entries(status.folder_progress || {})

  const headerLabel = isScanning
    ? isPhotos
      ? 'Preparing Photos…'
      : 'Scanning Files…'
    : isPhotos
      ? 'Indexing Photos'
      : 'Indexing in Progress'

  const phaseLabel = status.phase ? PHASE_LABEL[status.phase] : null

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      {/* Header with status badge */}
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {isPhotos && <Camera className="w-3.5 h-3.5" />}
          {headerLabel}
        </p>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
          {isScanning ? 'Preparing' : percentage >= 100 ? 'Completing' : 'Indexing'}
        </span>
      </div>

      {/* Progress bar */}
      <Progress.Root
        className="h-2 bg-muted rounded-full overflow-hidden"
        value={isScanning ? undefined : percentage}
      >
        <Progress.Indicator
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isScanning ? 'bg-primary animate-pulse w-2/3' : 'bg-primary'
          }`}
          style={isScanning ? undefined : { width: `${percentage}%` }}
        />
      </Progress.Root>

      {/* Stats row */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-card-foreground">
          {isScanning ? (
            phaseLabel ?? `Discovering ${noun}...`
          ) : (
            <>
              <span className="font-medium">{done.toLocaleString()}</span>
              {' of '}
              <span className="font-medium">{total.toLocaleString()}</span>
              {' '}{Noun.toLowerCase()}{' '}
              <span className="text-muted-foreground">({percentage}%)</span>
            </>
          )}
        </span>
        {etaText && (
          <span className="text-xs text-muted-foreground">{etaText}</span>
        )}
      </div>

      {/* Phase / current item detail */}
      {(phaseLabel || status.current_file) && (
        <p className="text-xs text-muted-foreground truncate">
          {isPhotos
            ? status.current_file || phaseLabel
            : status.current_file?.split('/').pop() || phaseLabel}
        </p>
      )}

      {/* Per-folder breakdown */}
      {folderEntries.length > 1 && (
        <div>
          <button
            onClick={() => setShowFolders(!showFolders)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showFolders ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {folderEntries.length} folders
          </button>
          {showFolders && (
            <div className="mt-2 space-y-2 pl-1">
              {folderEntries.map(([folder, progress]) => {
                const folderDone = progress.indexed + progress.errors
                const folderPct = progress.total > 0 ? Math.round((folderDone / progress.total) * 100) : 0
                return (
                  <div key={folder} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-card-foreground truncate">
                        <Folder className="w-3 h-3 shrink-0" />
                        {shortenPath(folder)}
                      </span>
                      <span className="text-muted-foreground shrink-0 ml-2">
                        {folderDone}/{progress.total}
                      </span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full transition-all duration-300"
                        style={{ width: `${folderPct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Errors */}
      {status.error_count > 0 && (
        <div>
          <button
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center gap-1 text-xs text-destructive hover:opacity-80 transition-opacity"
          >
            <AlertCircle className="w-3 h-3" />
            {showErrors ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {status.error_count} {status.error_count === 1 ? 'error' : 'errors'}
          </button>
          {showErrors && status.errors?.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto space-y-1 pl-1">
              {status.errors.map((err, i) => (
                <div key={i} className="text-xs text-muted-foreground">
                  <span className="text-destructive font-medium">
                    {err.file_path.split('/').pop()}
                  </span>
                  {': '}
                  {err.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function StatusPanel({ status }: StatusPanelProps): JSX.Element {
  const lastIndexed = status.last_indexed_at
    ? new Date(status.last_indexed_at * 1000).toLocaleString()
    : 'Never'

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <HardDrive className="w-4 h-4" />
            <span className="text-xs font-medium">Total Indexed</span>
          </div>
          <p className="text-2xl font-semibold text-card-foreground">
            {status.total.toLocaleString()}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium">Last Indexed</span>
          </div>
          <p className="text-sm font-medium text-card-foreground">{lastIndexed}</p>
        </div>
      </div>

      {/* Modality breakdown */}
      {Object.keys(status.modalities).length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Files by Type</p>
          <div className="space-y-2">
            {Object.entries(status.modalities)
              .sort(([, a], [, b]) => b - a)
              .map(([mod, count]) => (
                <div key={mod} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-card-foreground">
                    {getModalityIcon(mod)}
                    <span className="capitalize">{mod}</span>
                  </div>
                  <span className="text-sm font-medium text-card-foreground">
                    {count.toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Indexing progress */}
      {status.is_indexing && <IndexingProgress status={status} />}

      {/* Recent photos-indexing outcome (backend surfaces this for ~60s after finish) */}
      {!status.is_indexing && status.source === 'photos' && (status.last_error || status.last_result) && (
        <PhotosOutcome
          lastError={status.last_error}
          lastResult={status.last_result}
          phase={status.phase}
        />
      )}

      {/* Post-indexing error summary (shown after indexing completes if there were errors) */}
      {!status.is_indexing && status.errors?.length > 0 && (
        <PostIndexErrors errors={status.errors} errorCount={status.error_count} />
      )}
    </div>
  )
}

function PhotosOutcome({
  lastError,
  lastResult,
  phase
}: {
  lastError: string | null
  lastResult: IndexStatus['last_result']
  phase: string | null
}): JSX.Element {
  if (lastError || phase === 'error') {
    return (
      <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
        <div className="text-sm text-destructive-foreground">
          <p className="font-medium text-destructive">Photos indexing failed</p>
          <p className="text-xs text-muted-foreground mt-1">
            {lastError ?? 'Unknown error — check backend logs.'}
          </p>
        </div>
      </div>
    )
  }

  if (!lastResult) return <></>

  const indexed = lastResult.indexed ?? 0
  const errs = lastResult.errors ?? 0
  const skipped = lastResult.skipped ?? 0
  const cancelled = !!lastResult.cancelled
  const elapsed = lastResult.elapsed_seconds ?? 0

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-2">
      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <div className="text-sm flex-1">
        <p className="font-medium text-card-foreground">
          {cancelled ? 'Photos indexing cancelled' : 'Photos indexing complete'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Indexed <span className="font-medium text-card-foreground">{indexed.toLocaleString()}</span>
          {skipped > 0 && <> · {skipped.toLocaleString()} already up to date</>}
          {errs > 0 && <> · <span className="text-destructive">{errs} errors</span></>}
          {elapsed > 0 && <> · {Math.round(elapsed)}s</>}
        </p>
      </div>
    </div>
  )
}

function PostIndexErrors({
  errors,
  errorCount
}: {
  errors: Array<{ file_path: string; error: string }>
  errorCount: number
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-destructive font-medium"
      >
        <AlertCircle className="w-3.5 h-3.5" />
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {errorCount} {errorCount === 1 ? 'file' : 'files'} failed to index
      </button>
      {expanded && (
        <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
          {errors.map((err, i) => (
            <div key={i} className="text-xs text-muted-foreground">
              <span className="text-destructive font-medium">
                {err.file_path.split('/').pop()}
              </span>
              {': '}
              {err.error}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
