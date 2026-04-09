/// <reference types="vite/client" />

interface Window {
  api: {
    openFile: (path: string) => Promise<string>
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
  }
}
