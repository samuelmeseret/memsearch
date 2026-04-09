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
let detailCallback: ((detail: string) => void) | null = null

export function onBackendStatusChange(cb: (status: BackendStatus) => void): void {
  statusCallback = cb
}

export function onBackendDetailChange(cb: (detail: string) => void): void {
  detailCallback = cb
}

function setStatus(status: BackendStatus): void {
  currentStatus = status
  statusCallback?.(status)
}

function setDetail(detail: string): void {
  detailCallback?.(detail)
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

function getVenvDir(): string {
  return join(app.getPath('userData'), 'venv')
}

function findUvBinary(): string | null {
  const home = homedir()
  const candidates = [
    // Bundled with app
    ...(is.dev ? [] : [join(process.resourcesPath, 'bin', 'uv')]),
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

async function installUv(): Promise<string> {
  return new Promise((resolve, reject) => {
    const installProcess = spawn(
      'sh',
      ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'],
      {
        env: { ...(process.env as Record<string, string>), PATH: getShellPath() },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )

    let output = ''
    installProcess.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })
    installProcess.stderr?.on('data', (data: Buffer) => {
      output += data.toString()
    })

    installProcess.on('exit', (code) => {
      if (code === 0) {
        const uvPath = findUvBinary()
        if (uvPath) resolve(uvPath)
        else reject(new Error('uv installed but binary not found'))
      } else {
        reject(new Error(`uv installation failed (exit ${code}): ${output.slice(-500)}`))
      }
    })
  })
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
    setDetail('')
    setStatus('ready')
    return
  }

  // Find or install uv
  setDetail('Checking for Python package manager...')
  let uvBin = findUvBinary()
  if (!uvBin) {
    setStatus('starting')
    setDetail('Installing Python package manager (uv)...')
    try {
      uvBin = await installUv()
    } catch {
      setDetail('')
      setStatus('error')
      throw new Error(
        'Could not install uv automatically. Install it manually:\ncurl -LsSf https://astral.sh/uv/install.sh | sh'
      )
    }
  }

  const backendDir = getBackendDir()
  if (!existsSync(backendDir)) {
    setDetail('')
    setStatus('error')
    throw new Error(`Backend not found at: ${backendDir}`)
  }

  // Use a writable location for the venv — the signed app bundle is read-only
  const venvDir = getVenvDir()
  const isFirstRun = !existsSync(venvDir)

  // Set up logging
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
  logStream = createWriteStream(join(LOG_DIR, 'backend.log'), { flags: 'a' })
  logStream.write(`\n--- MemSearch backend starting at ${new Date().toISOString()} ---\n`)

  setStatus('starting')
  setDetail(isFirstRun ? 'Setting up Python environment (first run)...' : 'Starting backend server...')
  externalBackend = false

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: getShellPath(),
    UV_PROJECT_ENVIRONMENT: venvDir
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

  // Parse stderr for progress hints during first-run dependency installation
  if (isFirstRun) {
    backendProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      if (text.includes('Resolved') || text.includes('Downloading')) {
        setDetail('Installing Python dependencies...')
      } else if (text.includes('Installed')) {
        setDetail('Starting backend server...')
      }
    })
  }

  backendProcess.on('exit', (code, signal) => {
    logStream?.write(`--- Backend exited: code=${code} signal=${signal} ---\n`)
    backendProcess = null

    if (!intentionallyStopped && currentStatus === 'ready') {
      // Unexpected exit — auto-restart once
      logStream?.write('--- Attempting automatic restart ---\n')
      setStatus('starting')
      setDetail('Restarting backend...')
      setTimeout(() => {
        startBackend(lastApiKey).catch((err) => {
          logStream?.write(`--- Auto-restart failed: ${err} ---\n`)
          setDetail('')
          setStatus('error')
        })
      }, 2000)
    } else if (!intentionallyStopped) {
      setDetail('')
      setStatus('error')
    }
  })

  // First run installs Python + all deps — allow up to 120s
  const timeout = isFirstRun ? 120000 : 30000
  const ready = await waitForReady(timeout)
  if (ready) {
    setDetail('')
    setStatus('ready')
  } else {
    setDetail('')
    setStatus('error')
    throw new Error(
      isFirstRun
        ? 'Backend setup timed out. This can happen on first run while dependencies are downloading. Please try again.'
        : 'Backend failed to start within 30 seconds. Check logs at: ' + LOG_DIR
    )
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
    setDetail('')
    setStatus('stopped')
  })
}

export async function restartBackend(apiKey?: string): Promise<void> {
  stopBackend()
  // Wait a moment for port to be released
  await new Promise((r) => setTimeout(r, 1000))
  await startBackend(apiKey)
}
