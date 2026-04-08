import { useState } from 'react'
import { Rocket, Loader2, Check, Folder, Eye, Camera } from 'lucide-react'
import { startIndexing, startPhotosIndexing, updateConfig } from '../../api'
import type { OnboardingData } from './OnboardingWizard'

interface CompletionStepProps {
  data: OnboardingData
  onComplete: () => void
  onBack: () => void
}

function shortenPath(path: string): string {
  const home = path.match(/^\/Users\/[^/]+/)
  if (home) return path.replace(home[0], '~')
  return path
}

export function CompletionStep({ data, onComplete, onBack }: CompletionStepProps): JSX.Element {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const handleStart = async (): Promise<void> => {
    setStarting(true)
    setError('')
    try {
      // Save config to backend
      await updateConfig({
        watched_folders: data.folders,
        auto_index_enabled: data.autoIndexEnabled,
        index_photos_enabled: data.photosEnabled
      })

      // Start indexing
      if (data.folders.length > 0) {
        await startIndexing(data.folders)
      }

      // Start photos indexing if enabled
      if (data.photosEnabled) {
        await startPhotosIndexing()
      }

      // Mark onboarding complete
      await window.api.setStoreValue('onboardingComplete', true)

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start indexing')
      setStarting(false)
    }
  }

  const handleSkip = async (): Promise<void> => {
    try {
      // Still save config even if skipping indexing
      await updateConfig({
        watched_folders: data.folders,
        auto_index_enabled: data.autoIndexEnabled,
        index_photos_enabled: data.photosEnabled
      })
      await window.api.setStoreValue('onboardingComplete', true)
      onComplete()
    } catch {
      onComplete()
    }
  }

  return (
    <div className="pt-4">
      <div className="flex items-center gap-2 mb-2">
        <Rocket className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Ready to Go</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Here's a summary of your setup. Click "Start Indexing" to begin.
      </p>

      {/* Summary */}
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 text-sm text-card-foreground mb-2">
            <Folder className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{data.folders.length} folders</span>
          </div>
          <div className="space-y-1 pl-6">
            {data.folders.slice(0, 4).map((f) => (
              <p key={f} className="text-xs text-muted-foreground truncate">
                {shortenPath(f)}
              </p>
            ))}
            {data.folders.length > 4 && (
              <p className="text-xs text-muted-foreground">
                +{data.folders.length - 4} more
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <div
            className={`flex-1 p-3 rounded-lg border ${
              data.autoIndexEnabled
                ? 'bg-primary/5 border-primary/20'
                : 'bg-card border-border'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {data.autoIndexEnabled ? (
                <Check className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span className="text-xs font-medium text-card-foreground">Auto-index</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.autoIndexEnabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
          <div
            className={`flex-1 p-3 rounded-lg border ${
              data.photosEnabled
                ? 'bg-primary/5 border-primary/20'
                : 'bg-card border-border'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {data.photosEnabled ? (
                <Check className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Camera className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span className="text-xs font-medium text-card-foreground">iCloud Photos</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.photosEnabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          disabled={starting}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleSkip}
            disabled={starting}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Skip for Now
          </button>
          <button
            onClick={handleStart}
            disabled={starting}
            className="px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {starting ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Starting...
              </span>
            ) : (
              'Start Indexing'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
