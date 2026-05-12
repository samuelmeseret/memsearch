import { contextBridge, ipcRenderer } from 'electron'

const api = {
  openFile: (path: string): Promise<string> => ipcRenderer.invoke('shell:open-file', path),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  showInFinder: (path: string): Promise<void> => ipcRenderer.invoke('shell:show-in-finder', path),
  openInPhotos: (id: string): Promise<void> => ipcRenderer.invoke('shell:open-in-photos', id),
  copyToClipboard: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:copy', text),
  onBackendStatus: (cb: (status: string) => void): void => {
    ipcRenderer.on('backend:status', (_event, status) => cb(status))
  },
  onBackendDetail: (cb: (detail: string) => void): void => {
    ipcRenderer.on('backend:detail', (_event, detail) => cb(detail))
  },
  restartBackend: (): Promise<void> => ipcRenderer.invoke('backend:restart'),
  getApiKey: (): Promise<string> => ipcRenderer.invoke('config:get-api-key'),
  setApiKey: (key: string): Promise<void> => ipcRenderer.invoke('config:set-api-key', key),
  selectFolders: (): Promise<string[]> => ipcRenderer.invoke('dialog:select-folders'),
  getStoreValue: (key: string): Promise<unknown> => ipcRenderer.invoke('store:get', key),
  setStoreValue: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('store:set', key, value),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('update:check'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('update:download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  onUpdateChecking: (cb: () => void): void => {
    ipcRenderer.on('update:checking', () => cb())
  },
  onUpdateAvailable: (cb: (info: { version: string; releaseNotes?: string | null }) => void): void => {
    ipcRenderer.on('update:available', (_event, info) => cb(info))
  },
  onUpdateNotAvailable: (cb: (info: { version: string }) => void): void => {
    ipcRenderer.on('update:not-available', (_event, info) => cb(info))
  },
  onDownloadProgress: (
    cb: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void
  ): void => {
    ipcRenderer.on('update:download-progress', (_event, progress) => cb(progress))
  },
  onUpdateDownloaded: (cb: (info: { version: string }) => void): void => {
    ipcRenderer.on('update:downloaded', (_event, info) => cb(info))
  },
  onUpdateError: (cb: (err: { message: string }) => void): void => {
    ipcRenderer.on('update:error', (_event, err) => cb(err))
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
