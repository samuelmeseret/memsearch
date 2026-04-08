import { contextBridge, ipcRenderer } from 'electron'

const api = {
  openFile: (path: string): Promise<string> => ipcRenderer.invoke('shell:open-file', path),
  showInFinder: (path: string): Promise<void> => ipcRenderer.invoke('shell:show-in-finder', path),
  openInPhotos: (id: string): Promise<void> => ipcRenderer.invoke('shell:open-in-photos', id),
  copyToClipboard: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:copy', text),
  onBackendStatus: (cb: (status: string) => void): void => {
    ipcRenderer.on('backend:status', (_event, status) => cb(status))
  },
  restartBackend: (): Promise<void> => ipcRenderer.invoke('backend:restart'),
  getApiKey: (): Promise<string> => ipcRenderer.invoke('config:get-api-key'),
  setApiKey: (key: string): Promise<void> => ipcRenderer.invoke('config:set-api-key', key),
  selectFolders: (): Promise<string[]> => ipcRenderer.invoke('dialog:select-folders'),
  getStoreValue: (key: string): Promise<unknown> => ipcRenderer.invoke('store:get', key),
  setStoreValue: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('store:set', key, value)
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
