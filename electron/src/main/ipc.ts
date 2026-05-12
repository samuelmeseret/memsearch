import { ipcMain, shell, clipboard, dialog, BrowserWindow, safeStorage } from 'electron'
import { exec } from 'child_process'
import { restartBackend } from './backend'
import { checkForUpdates, downloadUpdate, quitAndInstall } from './updater'

function isLikelyPlaintextApiKey(s: string): boolean {
  // Gemini keys: "AIza" prefix, alphanumerics + _-, ~39 chars total.
  return /^AIza[\w-]{30,}$/.test(s)
}

// Reads the stored API key. The store holds plaintext; we best-effort migrate
// any legacy safeStorage-encrypted value written by older builds.
export async function readApiKey(): Promise<string> {
  const Store = (await import('electron-store')).default
  const store = new Store<{ apiKey: string }>()
  const stored = store.get('apiKey', '')
  if (!stored) return ''
  if (isLikelyPlaintextApiKey(stored)) return stored

  // Legacy safeStorage blob. Try to decrypt once and rewrite as plaintext.
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(stored, 'base64'))
      if (isLikelyPlaintextApiKey(decrypted)) {
        store.set('apiKey', decrypted)
        return decrypted
      }
    } catch {
      // Undecryptable (e.g., app signing identity changed). Fall through to discard.
    }
  }

  store.set('apiKey', '')
  return ''
}

async function writeApiKey(key: string): Promise<void> {
  const Store = (await import('electron-store')).default
  const store = new Store<{ apiKey: string }>()
  store.set('apiKey', key)
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
    await restartBackend(await readApiKey())
  })

  ipcMain.handle('config:get-api-key', async () => {
    return readApiKey()
  })

  ipcMain.handle('config:set-api-key', async (_event, key: string) => {
    await writeApiKey(key)
    await restartBackend(key)
  })

  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => quitAndInstall())
}
