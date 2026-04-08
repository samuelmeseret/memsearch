import { ipcMain, shell, clipboard, dialog, BrowserWindow, safeStorage } from 'electron'
import { exec } from 'child_process'
import { restartBackend } from './backend'

function encryptApiKey(key: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(key).toString('base64')
  }
  return key
}

function decryptApiKey(stored: string): string {
  if (!stored) return ''
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch {
      // Stored value was plaintext (pre-migration) — return as-is
      return stored
    }
  }
  return stored
}

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:select-folders', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'multiSelections']
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('store:get', async (_event, key: string) => {
    const Store = (await import('electron-store')).default
    const store = new Store()
    return store.get(key)
  })

  ipcMain.handle('store:set', async (_event, key: string, value: unknown) => {
    const Store = (await import('electron-store')).default
    const store = new Store()
    store.set(key, value)
  })

  ipcMain.handle('shell:open-file', async (_event, filePath: string) => {
    return shell.openPath(filePath)
  })

  ipcMain.handle('shell:show-in-finder', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('shell:open-in-photos', async (_event, localIdentifier: string) => {
    const script = `tell application "Photos"
  activate
  set theItem to media item id "${localIdentifier}"
  spotlight theItem
end tell`
    return new Promise<void>((resolve, reject) => {
      exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  ipcMain.handle('clipboard:copy', async (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('backend:restart', async () => {
    const Store = (await import('electron-store')).default
    const store = new Store<{ apiKey: string }>()
    const encrypted = store.get('apiKey', '')
    await restartBackend(decryptApiKey(encrypted))
  })

  ipcMain.handle('config:get-api-key', async () => {
    const Store = (await import('electron-store')).default
    const store = new Store<{ apiKey: string }>()
    const encrypted = store.get('apiKey', '')
    return decryptApiKey(encrypted)
  })

  ipcMain.handle('config:set-api-key', async (_event, key: string) => {
    const Store = (await import('electron-store')).default
    const store = new Store<{ apiKey: string }>()
    store.set('apiKey', encryptApiKey(key))
    // Restart backend with new key (plaintext, passed as env var)
    await restartBackend(key)
  })
}
