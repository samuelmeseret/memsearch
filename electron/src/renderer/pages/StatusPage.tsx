import { useState, useEffect, useRef } from 'react'
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
  Eye,
  Download
} from 'lucide-react'
import { StatusPanel } from '../components/StatusPanel'
import { useStatus } from '../hooks/useStatus'
import { useBackendHealth } from '../hooks/useBackendHealth'
import {
  startIndexing,
  startPhotosIndexing,
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
  const health = useBackendHealth()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false)
  const [actionMessage, setActionMessage] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  // Set when the user triggers a known-intentional restart (stop, restart
  // button, API key change). Suppresses the hard "Cannot connect" banner
  // during the expected downtime window.
  const [isRestarting, setIsRestarting] = useState(false)
  const restartGuardRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [updateCheckStatus, setUpdateCheckStatus] = useState<
    'idle' | 'checking' | 'up-to-date'
  >('idle')
  const upToDateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadConfig()
    loadApiKey()
  }, [])

  // Clear the restart flag once the backend is back and serving status.
  useEffect(() => {
    if (isRestarting && health === 'connected' && status) {
      setIsRestarting(false)
      if (restartGuardRef.current) {
        clearTimeout(restartGuardRef.current)
        restartGuardRef.current = null
      }
    }
  }, [isRestarting, health, status])

  const beginRestart = (): void => {
    setIsRestarting(true)
    if (restartGuardRef.current) clearTimeout(restartGuardRef.current)
    // Safety net: if the backend never comes back within 30s, stop suppressing
    // the hard error so the user can see what's wrong.
    restartGuardRef.current = setTimeout(() => {
      setIsRestarting(false)
      restartGuardRef.current = null
    }, 30000)
  }

  useEffect(() => {
    return () => {
      if (restartGuardRef.current) clearTimeout(restartGuardRef.current)
      if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const clearUpToDateTimer = (): void => {
      if (upToDateTimerRef.current) {
        clearTimeout(upToDateTimerRef.current)
        upToDateTimerRef.current = null
      }
    }
    window.api.onUpdateAvailable(() => {
      clearUpToDateTimer()
      setUpdateCheckStatus('idle')
    })
    window.api.onUpdateNotAvailable(() => {
      clearUpToDateTimer()
      setUpdateCheckStatus('up-to-date')
      upToDateTimerRef.current = setTimeout(() => {
        setUpdateCheckStatus('idle')
        upToDateTimerRef.current = null
      }, 4000)
    })
    window.api.onUpdateError(() => {
      clearUpToDateTimer()
      setUpdateCheckStatus('idle')
    })
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
    // Errors stay longer so the user can read permission instructions.
    setTimeout(() => setActionMessage(null), type === 'error' ? 8000 : 3000)
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

  const handleIndexFolder = async (): Promise<void> => {
    if (!config || status?.is_indexing) return
    try {
      const selected = await window.api.selectFolders()
      if (selected.length === 0) return
      const newFolders = selected.filter((f) => !config.watched_folders.includes(f))
      if (newFolders.length > 0) {
        const merged = [...config.watched_folders, ...newFolders]
        await updateConfig({ watched_folders: merged })
        setConfig({ ...config, watched_folders: merged })
      }
      await startIndexing(selected)
      const msg =
        selected.length === 1
          ? `Indexing ${shortenPath(selected[0])}…`
          : `Indexing ${selected.length} folders…`
      showMessage(msg, 'success')
      refresh()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to index folder', 'error')
    }
  }

  const handleStop = async (): Promise<void> => {
    // The photos indexer can't be cancelled cleanly during a PhotoKit network
    // download, so we restart the backend. Indexed state is persisted in
    // ChromaDB, so the next run resumes from where this one stopped.
    beginRestart()
    try {
      showMessage('Stopping indexing…', 'success')
      await window.api.restartBackend()
      showMessage('Indexing stopped', 'success')
      refresh()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to stop', 'error')
    }
  }

  const handleRestartBackend = async (): Promise<void> => {
    beginRestart()
    try {
      await window.api.restartBackend()
      refresh()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to restart backend', 'error')
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
    const trimmed = apiKey.trim()
    if (!trimmed) {
      showMessage('API key cannot be empty', 'error')
      return
    }
    beginRestart()
    try {
      await window.api.setApiKey(trimmed)
      setApiKey(trimmed)
      showMessage('API key saved, backend restarting…', 'success')
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to save API key', 'error')
    }
  }

  const handleCheckForUpdates = async (): Promise<void> => {
    if (updateCheckStatus === 'checking') return
    setUpdateCheckStatus('checking')
    try {
      await window.api.checkForUpdates()
    } catch (err) {
      setUpdateCheckStatus('idle')
      showMessage(err instanceof Error ? err.message : 'Failed to check for updates', 'error')
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

      {/* Connection banner. A soft "reconnecting" state covers expected
          downtime (restart, API-key change, stop-during-indexing). The hard
          error only shows once we're genuinely disconnected and not mid-restart. */}
      {isRestarting || health === 'connecting' ? (
        <div className="px-3 py-2 rounded-lg bg-muted/60 text-muted-foreground text-xs flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Reconnecting to backend…
        </div>
      ) : error && health === 'disconnected' ? (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          <p className="font-medium">Cannot connect to backend</p>
          <p className="mt-1 text-xs opacity-80">{error}</p>
          <button
            onClick={handleRestartBackend}
            className="mt-2 px-3 py-1 text-xs bg-destructive text-destructive-foreground rounded-md hover:opacity-90"
          >
            Restart Backend
          </button>
        </div>
      ) : null}

      {/* Status panel */}
      {isLoading && !status ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading status...
        </div>
      ) : status ? (
        <StatusPanel status={status} />
      ) : null}

      {/* Empty-state CTA */}
      {config && config.watched_folders.length === 0 && !status?.is_indexing && (
        <div className="bg-card border border-dashed border-border rounded-lg p-6 text-center">
          <Folder className="w-6 h-6 mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-card-foreground">No folders indexed yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a folder on your Mac to get started.
          </p>
          <button
            onClick={handleIndexFolder}
            disabled={health !== 'connected'}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Choose a Folder…
          </button>
        </div>
      )}

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
                onClick={handleIndexFolder}
                disabled={health !== 'connected'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-md hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Index a Folder…
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
              onClick={handleIndexFolder}
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

        {/* App updates */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <label className="flex items-center gap-1.5 text-sm text-card-foreground">
              <Download className="w-3.5 h-3.5" />
              App updates
            </label>
            <p className="text-xs text-muted-foreground">
              {updateCheckStatus === 'up-to-date'
                ? "You're on the latest version"
                : 'Check GitHub for a new release'}
            </p>
          </div>
          <button
            onClick={handleCheckForUpdates}
            disabled={updateCheckStatus === 'checking'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-md border border-border hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateCheckStatus === 'checking' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {updateCheckStatus === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
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
