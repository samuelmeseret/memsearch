import { useState, useEffect } from 'react'
import {
  RefreshCw,
  Square,
  Trash2,
  Camera,
  Key,
  FolderPlus,
  X,
  Loader2,
  Folder,
  Eye
} from 'lucide-react'
import { StatusPanel } from '../components/StatusPanel'
import { useStatus } from '../hooks/useStatus'
import {
  startIndexing,
  startPhotosIndexing,
  stopIndexing,
  clearIndex,
  getConfig,
  updateConfig
} from '../api'
import type { AppConfig } from '../types'

function shortenPath(path: string): string {
  const home = path.match(/^\/Users\/[^/]+/)
  if (home) return path.replace(home[0], '~')
  return path
}

export default function StatusPage(): JSX.Element {
  const { status, isLoading, error, refresh } = useStatus()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false)
  const [actionMessage, setActionMessage] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  useEffect(() => {
    loadConfig()
    loadApiKey()
  }, [])

  const loadConfig = async (): Promise<void> => {
    try {
      const c = await getConfig()
      setConfig(c)
    } catch {
      // Backend not ready yet
    }
  }

  const loadApiKey = async (): Promise<void> => {
    try {
      const key = await window.api.getApiKey()
      setApiKey(key || '')
      setApiKeyLoaded(true)
    } catch {
      setApiKeyLoaded(true)
    }
  }

  const showMessage = (text: string, type: 'success' | 'error'): void => {
    setActionMessage({ text, type })
    setTimeout(() => setActionMessage(null), 3000)
  }

  const handleReindex = async (): Promise<void> => {
    try {
      await startIndexing()
      showMessage('Indexing started', 'success')
      refresh()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to start indexing', 'error')
    }
  }

  const handlePhotos = async (): Promise<void> => {
    try {
      await startPhotosIndexing()
      showMessage('Photos indexing started', 'success')
      refresh()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to start photos indexing', 'error')
    }
  }

  const handleStop = async (): Promise<void> => {
    try {
      await stopIndexing()
      showMessage('Indexing stopping...', 'success')
      refresh()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to stop', 'error')
    }
  }

  const handleClear = async (): Promise<void> => {
    setShowClearConfirm(false)
    try {
      await clearIndex()
      showMessage('Index cleared', 'success')
      refresh()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to clear', 'error')
    }
  }

  const handleSaveApiKey = async (): Promise<void> => {
    try {
      await window.api.setApiKey(apiKey)
      showMessage('API key saved, backend restarting...', 'success')
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to save API key', 'error')
    }
  }

  const handleAddFolders = async (): Promise<void> => {
    if (!config) return
    try {
      const selected = await window.api.selectFolders()
      if (selected.length === 0) return
      const existing = new Set(config.watched_folders)
      const merged = [...config.watched_folders, ...selected.filter((f) => !existing.has(f))]
      await updateConfig({ watched_folders: merged })
      setConfig({ ...config, watched_folders: merged })
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to add folders', 'error')
    }
  }

  const handleRemoveFolder = async (folder: string): Promise<void> => {
    if (!config) return
    const folders = config.watched_folders.filter((f) => f !== folder)
    try {
      await updateConfig({ watched_folders: folders })
      setConfig({ ...config, watched_folders: folders })
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to remove folder', 'error')
    }
  }

  const handleToggleAutoIndex = async (): Promise<void> => {
    if (!config) return
    const newValue = !config.auto_index_enabled
    try {
      await updateConfig({ auto_index_enabled: newValue })
      setConfig({ ...config, auto_index_enabled: newValue })
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update setting', 'error')
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {/* Action message */}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-sm ${
            actionMessage.type === 'success'
              ? 'bg-primary/10 text-primary'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          <p className="font-medium">Cannot connect to backend</p>
          <p className="mt-1 text-xs opacity-80">{error}</p>
          <button
            onClick={() => window.api.restartBackend()}
            className="mt-2 px-3 py-1 text-xs bg-destructive text-destructive-foreground rounded-md hover:opacity-90"
          >
            Restart Backend
          </button>
        </div>
      )}

      {/* Status panel */}
      {isLoading && !status ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading status...
        </div>
      ) : status ? (
        <StatusPanel status={status} />
      ) : null}

      {/* Actions */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Actions</p>
        <div className="flex flex-wrap gap-2">
          {status?.is_indexing ? (
            <button
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-md hover:opacity-80"
            >
              <Square className="w-3.5 h-3.5" />
              Stop Indexing
            </button>
          ) : (
            <>
              <button
                onClick={handleReindex}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reindex All
              </button>
              <button
                onClick={handlePhotos}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-md hover:opacity-80"
              >
                <Camera className="w-3.5 h-3.5" />
                Index Photos
              </button>
            </>
          )}
          <button
            onClick={() => setShowClearConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-destructive/10 text-destructive rounded-md hover:bg-destructive/20"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Index
          </button>
        </div>
      </div>

      {/* Settings */}
      <div className="space-y-4 border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground">Settings</p>

        {/* API Key */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-sm text-card-foreground">
            <Key className="w-3.5 h-3.5" />
            Gemini API Key
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeyLoaded ? 'Enter your Gemini API key' : 'Loading...'}
              className="flex-1 bg-secondary text-secondary-foreground text-sm rounded-md px-3 py-1.5 outline-none border border-border focus:border-primary"
            />
            <button
              onClick={handleSaveApiKey}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>

        {/* Auto-indexing toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <label className="flex items-center gap-1.5 text-sm text-card-foreground">
              <Eye className="w-3.5 h-3.5" />
              Auto-indexing
            </label>
            <p className="text-xs text-muted-foreground">
              Automatically re-index when files change in watched folders
            </p>
          </div>
          <button
            onClick={handleToggleAutoIndex}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              config?.auto_index_enabled ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                config?.auto_index_enabled ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Watched Folders */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-sm text-card-foreground">
              <Folder className="w-3.5 h-3.5" />
              Watched Folders
            </label>
            <button
              onClick={handleAddFolders}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded-md hover:opacity-80 border border-border"
            >
              <FolderPlus className="w-3 h-3" />
              Add Folder
            </button>
          </div>
          {config?.watched_folders.map((folder) => (
            <div
              key={folder}
              className="flex items-center justify-between bg-secondary rounded-md px-3 py-1.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span
                  className="text-sm text-secondary-foreground truncate"
                  title={folder}
                >
                  {shortenPath(folder)}
                </span>
              </div>
              <button
                onClick={() => handleRemoveFolder(folder)}
                className="text-muted-foreground hover:text-destructive shrink-0 ml-2"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Clear index confirmation dialog */}
      {showClearConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowClearConfirm(false)}
          />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-popover border border-border rounded-xl shadow-xl p-6 w-[360px]">
            <h3 className="text-base font-semibold text-popover-foreground">
              Clear entire index?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently delete all indexed embeddings and cached thumbnails. You will need to re-index everything.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-md hover:opacity-80"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                className="px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:opacity-90"
              >
                Clear Index
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
