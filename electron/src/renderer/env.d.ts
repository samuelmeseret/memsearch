/// <reference types="vite/client" />

interface Window {
  api: {
    openFile: (path: string) => Promise<string>
    openExternal: (url: string) => Promise<void>
    showInFinder: (path: string) => Promise<void>
    openInPhotos: (id: string) => Promise<void>
    copyToClipboard: (text: string) => Promise<void>
    onBackendStatus: (cb: (status: string) => void) => void
    onBackendDetail: (cb: (detail: string) => void) => void
    restartBackend: () => Promise<void>
    getApiKey: () => Promise<string>
    setApiKey: (key: string) => Promise<void>
    selectFolders: () => Promise<string[]>
    getStoreValue: (key: string) => Promise<unknown>
    setStoreValue: (key: string, value: unknown) => Promise<void>
    checkForUpdates: () => Promise<void>
    downloadUpdate: () => Promise<void>
    installUpdate: () => Promise<void>
    onUpdateChecking: (cb: () => void) => void
    onUpdateAvailable: (cb: (info: { version: string; releaseNotes?: string | null }) => void) => void
    onUpdateNotAvailable: (cb: (info: { version: string }) => void) => void
    onDownloadProgress: (
      cb: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void
    ) => void
    onUpdateDownloaded: (cb: (info: { version: string }) => void) => void
    onUpdateError: (cb: (err: { message: string }) => void) => void
  }
}
