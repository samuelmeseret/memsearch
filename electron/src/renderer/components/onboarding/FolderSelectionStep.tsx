import { useEffect, useState } from 'react'
import { FolderPlus, Folder, X } from 'lucide-react'
import { getConfig } from '../../api'
import type { OnboardingData } from './OnboardingWizard'

interface FolderSelectionStepProps {
  data: OnboardingData
  updateData: (partial: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

function shortenPath(path: string): string {
  const home = path.match(/^\/Users\/[^/]+/)
  if (home) return path.replace(home[0], '~')
  return path
}

export function FolderSelectionStep({
  data,
  updateData,
  onNext,
  onBack
}: FolderSelectionStepProps): JSX.Element {
  const [loaded, setLoaded] = useState(false)

  // Pre-populate with defaults from backend config (with retry)
  useEffect(() => {
    if (data.folders.length === 0 && !loaded) {
      let attempts = 0
      const tryLoad = (): void => {
        getConfig()
          .then((config) => {
            updateData({ folders: config.watched_folders })
            setLoaded(true)
          })
          .catch(() => {
            attempts++
            if (attempts < 5) {
              setTimeout(tryLoad, 1000)
            } else {
              // Fallback: let user add folders manually
              setLoaded(true)
            }
          })
      }
      tryLoad()
    } else {
      setLoaded(true)
    }
  }, [])

  const handleAddFolders = async (): Promise<void> => {
    const selected = await window.api.selectFolders()
    if (selected.length === 0) return
    const existing = new Set(data.folders)
    const merged = [...data.folders, ...selected.filter((f) => !existing.has(f))]
    updateData({ folders: merged })
  }

  const handleRemove = (folder: string): void => {
    updateData({ folders: data.folders.filter((f) => f !== folder) })
  }

  return (
    <div className="pt-4">
      <div className="flex items-center gap-2 mb-2">
        <Folder className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Choose Folders</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Select which folders MemSearch should index. You can change these later in settings.
      </p>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {data.folders.map((folder) => (
          <div
            key={folder}
            className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-secondary-foreground truncate" title={folder}>
                {shortenPath(folder)}
              </span>
            </div>
            <button
              onClick={() => handleRemove(folder)}
              className="text-muted-foreground hover:text-destructive shrink-0 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={handleAddFolders}
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-lg hover:opacity-80 border border-border transition-opacity"
      >
        <FolderPlus className="w-4 h-4" />
        Add Folder
      </button>

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
