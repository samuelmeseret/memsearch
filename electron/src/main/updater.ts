import { app, BrowserWindow } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import log from 'electron-log'

type WindowGetter = () => BrowserWindow | null

let getWindow: WindowGetter = () => null

function send(channel: string, payload?: unknown): void {
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send(channel, payload)
}

export function initAutoUpdater(windowGetter: WindowGetter): void {
  getWindow = windowGetter

  log.transports.file.level = 'info'
  autoUpdater.logger = log
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    send('update:checking')
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send('update:available', { version: info.version, releaseNotes: info.releaseNotes })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    send('update:not-available', { version: info.version })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    send('update:download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    send('update:downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err: Error) => {
    send('update:error', { message: err.message })
  })

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        log.error('Initial update check failed:', err)
      })
    }, 5000)
  }
}

export async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    log.error('checkForUpdates failed:', err)
    throw err
  }
}

export async function downloadUpdate(): Promise<void> {
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    log.error('downloadUpdate failed:', err)
    throw err
  }
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
