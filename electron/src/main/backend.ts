import { ChildProcess, spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, createWriteStream, WriteStream } from 'fs'
import { homedir } from 'os'
import http from 'http'
import { is } from '@electron-toolkit/utils'

const BACKEND_HOST = '127.0.0.1'
const BACKEND_PORT = 7242
const HEALTH_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/status`
const LOG_DIR = join(homedir(), 'Library', 'Application Support', 'MemSearch', 'logs')

let backendProcess: ChildProcess | null = null
let externalBackend = false
let logStream: WriteStream | null = null
let lastApiKey: string | undefined
let intentionallyStopped = false

export type BackendStatus = 'stopped' | 'starting' | 'ready' | 'error'
let currentStatus: BackendStatus = 'stopped'
let statusCallback: ((status: BackendStatus) => void) | null = null

export function onBackendStatusChange(cb: (status: BackendStatus) => void): void {
  statusCallback = cb
}

function setStatus(status: BackendStatus): void {
  currentStatus = status
  statusCallback?.(status)
}

export function getBackendStatus(): BackendStatus {
  return currentStatus
}

export function isExternalBackend(): boolean {
  return externalBackend
}

function getBackendDir(): string {
  if (is.dev) {
    return join(app.getAppPath(), '..', 'backend')
  }
  return join(process.resourcesPath, 'backend')
}

function findUvBinary(): string | null {
  const home = homedir()
  const candidates = [
    join(home, '.local', 'bin', 'uv'),
    join(home, '.cargo', 'bin', 'uv'),
    '/usr/local/bin/uv',
    '/opt/homebrew/bin/uv',
    'uv' // fallback to PATH
  ]
  for (const candidate of candidates) {
    if (candidate === 'uv') return candidate // let spawn try PATH
    if (existsSync(candidate)) return candidate
  }
  return null
}

function getShellPath(): string {
  // GUI apps on macOS don't inherit shell PATH. Merge common paths.
  const defaultPath = process.env.PATH || ''
  const home = homedir()
  const extraPaths = [
    join(home, '.local', 'bin'),
    join(home, '.cargo', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin'
  ]
  const allPaths = [...extraPaths, ...defaultPath.split(':')]
  return [...new Set(allPaths)].join(':')
}

function healthCheck(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      resolve(res.statusCode === 200)
      res.resume()
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

export async function detectRunningBackend(): Promise<boolean> {
  return healthCheck()
}

export async function startBackend(apiKey?: string): Promise<void> {
  lastApiKey = apiKey
  intentionallyStopped = false

  // Check if already running (Raycast or manual)
  if (await detectRunningBackend()) {
    externalBackend = true
    setStatus('ready')
    return
  }

  const uvBin = findUvBinary()
  if (!uvBin) {
    setStatus('error')
    throw new Error(
      'Could not find `uv` binary. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh'
    )
  }

  const backendDir = getBackendDir()
  if (!existsSync(backendDir)) {
    setStatus('error')
    throw new Error(`Backend directory not found: ${backendDir}`)
  }

  // Set up logging
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
  logStream = createWriteStream(join(LOG_DIR, 'backend.log'), { flags: 'a' })
  logStream.write(`\n--- MemSearch backend starting at ${new Date().toISOString()} ---\n`)

  setStatus('starting')
  externalBackend = false

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PATH: getShellPath()
  }
  if (apiKey) {
    env.MEMSEARCH_GEMINI_API_KEY = apiKey
  }

  backendProcess = spawn(uvBin, ['run', 'memsearch', 'serve'], {
    cwd: backendDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  backendProcess.stdout?.pipe(logStream, { end: false })
  backendProcess.stderr?.pipe(logStream, { end: false })

  backendProcess.on('exit', (code, signal) => {
    logStream?.write(`--- Backend exited: code=${code} signal=${signal} ---\n`)
    backendProcess = null

    if (!intentionallyStopped && currentStatus === 'ready') {
      // Unexpected exit — auto-restart once
      logStream?.write('--- Attempting automatic restart ---\n')
      setStatus('starting')
      setTimeout(() => {
        startBackend(lastApiKey).catch((err) => {
          logStream?.write(`--- Auto-restart failed: ${err} ---\n`)
          setStatus('error')
        })
      }, 2000)
    } else if (!intentionallyStopped) {
      setStatus('error')
    }
  })

  // Wait for backend to become ready
  const ready = await waitForReady(15000)
  if (ready) {
    setStatus('ready')
  } else {
    setStatus('error')
    throw new Error('Backend failed to start within 15 seconds. Check logs at: ' + LOG_DIR)
  }
}

async function waitForReady(maxMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    if (await healthCheck()) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

export function stopBackend(): void {
  if (externalBackend || !backendProcess) return

  intentionallyStopped = true
  backendProcess.kill('SIGTERM')

  // Force kill after 5 seconds
  const forceKillTimeout = setTimeout(() => {
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill('SIGKILL')
    }
  }, 5000)

  backendProcess.on('exit', () => {
    clearTimeout(forceKillTimeout)
    backendProcess = null
    logStream?.end()
    logStream = null
    setStatus('stopped')
  })
}

export async function restartBackend(apiKey?: string): Promise<void> {
  stopBackend()
  // Wait a moment for port to be released
  await new Promise((r) => setTimeout(r, 1000))
  await startBackend(apiKey)
}
