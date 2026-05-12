import { useEffect, useState } from 'react'
import * as Toast from '@radix-ui/react-toast'
import * as Progress from '@radix-ui/react-progress'
import { X, Download, RotateCcw, RefreshCw } from 'lucide-react'

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

export function UpdateBanner(): JSX.Element {
  const [state, setState] = useState<UpdateState>('idle')
  const [version, setVersion] = useState<string>('')
  const [percent, setPercent] = useState<number>(0)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [open, setOpen] = useState<boolean>(false)

  useEffect(() => {
    window.api.onUpdateChecking(() => {
      setState((prev) => (prev === 'idle' ? 'checking' : prev))
    })

    window.api.onUpdateAvailable((info) => {
      setVersion(info.version)
      setState('available')
      setOpen(true)
    })

    window.api.onUpdateNotAvailable(() => {
      setState((prev) => (prev === 'checking' ? 'idle' : prev))
    })

    window.api.onDownloadProgress((progress) => {
      setPercent(progress.percent)
      setState('downloading')
    })

    window.api.onUpdateDownloaded((info) => {
      setVersion(info.version)
      setPercent(100)
      setState('ready')
      setOpen(true)
    })

    window.api.onUpdateError((err) => {
      setErrorMessage(err.message)
      setState('error')
      setOpen(true)
    })
  }, [])

  const handleDownload = async (): Promise<void> => {
    setState('downloading')
    setPercent(0)
    try {
      await window.api.downloadUpdate()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Download failed')
      setState('error')
    }
  }

  const handleInstall = async (): Promise<void> => {
    await window.api.installUpdate()
  }

  const handleRetry = async (): Promise<void> => {
    setErrorMessage('')
    setState('checking')
    try {
      await window.api.checkForUpdates()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Check failed')
      setState('error')
    }
  }

  if (state === 'idle' || state === 'checking') {
    return <Toast.Provider><Toast.Viewport /></Toast.Provider>
  }

  return (
    <Toast.Provider duration={Infinity}>
      <Toast.Root
        open={open}
        onOpenChange={setOpen}
        className="bg-card border border-border rounded-lg p-4 shadow-lg w-80 no-drag data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2"
      >
        {state === 'available' && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Toast.Title className="text-sm font-medium text-card-foreground">
                  Version {version} available
                </Toast.Title>
                <Toast.Description className="text-xs text-muted-foreground mt-0.5">
                  A new MemSearch release is ready to download.
                </Toast.Description>
              </div>
              <Toast.Close className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </Toast.Close>
            </div>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          </div>
        )}

        {state === 'downloading' && (
          <div className="space-y-3">
            <Toast.Title className="text-sm font-medium text-card-foreground">
              Downloading {version}...
            </Toast.Title>
            <Progress.Root
              className="h-2 bg-muted rounded-full overflow-hidden"
              value={percent}
            >
              <Progress.Indicator
                className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
              />
            </Progress.Root>
            <p className="text-xs text-muted-foreground">{Math.round(percent)}%</p>
          </div>
        )}

        {state === 'ready' && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Toast.Title className="text-sm font-medium text-card-foreground">
                  Version {version} ready
                </Toast.Title>
                <Toast.Description className="text-xs text-muted-foreground mt-0.5">
                  Restart MemSearch to finish installing.
                </Toast.Description>
              </div>
              <Toast.Close className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </Toast.Close>
            </div>
            <button
              onClick={handleInstall}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restart now
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Toast.Title className="text-sm font-medium text-card-foreground">
                  Update failed
                </Toast.Title>
                <Toast.Description className="text-xs text-muted-foreground mt-0.5 break-words">
                  {errorMessage || 'Unknown error checking for updates.'}
                </Toast.Description>
              </div>
              <Toast.Close className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </Toast.Close>
            </div>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 bg-muted text-foreground text-sm font-medium px-3 py-1.5 rounded-md hover:bg-muted/80 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        )}
      </Toast.Root>
      <Toast.Viewport className="fixed top-12 right-4 z-50 flex flex-col gap-2 outline-none" />
    </Toast.Provider>
  )
}
