import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerIpcHandlers, readApiKey } from './ipc'
import {
  startBackend,
  stopBackend,
  getBackendStatus,
  onBackendStatusChange,
  onBackendDetailChange,
  BackendStatus
} from './backend'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    trafficLightPosition: { x: 15, y: 10 },
    icon: join(__dirname, '../../resources/icon.png'),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Forward backend status and detail messages to renderer
  onBackendStatusChange((status: BackendStatus) => {
    mainWindow?.webContents.send('backend:status', status)
  })

  onBackendDetailChange((detail: string) => {
    mainWindow?.webContents.send('backend:detail', detail)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function isOnboardingComplete(): Promise<boolean> {
  const Store = (await import('electron-store')).default
  const store = new Store()
  return !!store.get('onboardingComplete', false)
}

async function initBackend(): Promise<void> {
  try {
    const apiKey = await readApiKey()
    await startBackend(apiKey)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error starting backend'
    console.error('Backend start failed:', message)
    // Don't block window creation — the UI will show the error state
  }
}

app.whenReady().then(async () => {
  // Set dock icon only in dev mode — packaged app uses icon.icns from the bundle,
  // which macOS renders with the proper rounded superellipse mask.
  if (is.dev && process.platform === 'darwin') {
    app.dock.setIcon(join(__dirname, '../../resources/icon.png'))
  }

  registerIpcHandlers()
  createWindow()

  // Only start backend automatically if onboarding is already done.
  // During onboarding, the SetupStep handles starting the backend.
  if (await isOnboardingComplete()) {
    await initBackend()
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
    // Ensure backend is running when app is re-activated (post-onboarding only)
    if (await isOnboardingComplete()) {
      const status = getBackendStatus()
      if (status === 'stopped' || status === 'error') {
        await initBackend()
      }
    }
  })
})

app.on('window-all-closed', () => {
  // macOS convention: stay running with dock icon
})

app.on('before-quit', () => {
  stopBackend()
})

export { mainWindow }
