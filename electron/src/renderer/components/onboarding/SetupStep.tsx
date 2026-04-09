import { useState, useEffect, useRef } from 'react'
import { Loader2, CheckCircle, AlertCircle, Terminal } from 'lucide-react'
import type { OnboardingData } from './OnboardingWizard'

interface SetupStepProps {
  data: OnboardingData
  onNext: () => void
  onBack: () => void
}

export function SetupStep({ data, onNext, onBack }: SetupStepProps): JSX.Element {
  const [phase, setPhase] = useState<'starting' | 'ready' | 'error'>('starting')
  const [detail, setDetail] = useState('Preparing backend...')
  const [error, setError] = useState('')
  const setupRan = useRef(false)

  useEffect(() => {
    window.api.onBackendDetail((d: string) => {
      if (d) setDetail(d)
    })

    window.api.onBackendStatus((status: string) => {
      if (status === 'ready') {
        setPhase('ready')
        setDetail('Backend is ready!')
      }
    })
  }, [])

  useEffect(() => {
    if (setupRan.current) return
    setupRan.current = true
    runSetup()
  }, [])

  // Auto-advance shortly after ready
  useEffect(() => {
    if (phase === 'ready') {
      const timer = setTimeout(onNext, 800)
      return (): void => {
        clearTimeout(timer)
      }
    }
  }, [phase, onNext])

  const runSetup = async (): Promise<void> => {
    try {
      setPhase('starting')
      setDetail('Saving API key and starting backend...')
      // This saves the key and awaits the full backend restart
      await window.api.setApiKey(data.apiKey.trim())
      setPhase('ready')
      setDetail('Backend is ready!')
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : 'Failed to start backend')
    }
  }

  const handleRetry = (): void => {
    setupRan.current = true
    setPhase('starting')
    setError('')
    setDetail('Retrying...')
    runSetup()
  }

  return (
    <div className="pt-4">
      <div className="flex items-center gap-2 mb-2">
        <Terminal className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Setting Up</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Preparing the backend environment. This may take a minute on first launch.
      </p>

      <div className="flex flex-col items-center py-8">
        {phase === 'starting' && (
          <>
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
            <p className="text-sm text-foreground">{detail}</p>
          </>
        )}
        {phase === 'ready' && (
          <>
            <CheckCircle className="w-10 h-10 text-green-500 mb-4" />
            <p className="text-sm text-foreground">{detail}</p>
          </>
        )}
        {phase === 'error' && (
          <>
            <AlertCircle className="w-10 h-10 text-destructive mb-4" />
            <p className="text-sm text-foreground mb-2">Setup failed</p>
            <p className="text-xs text-muted-foreground text-center max-w-sm whitespace-pre-line">
              {error}
            </p>
          </>
        )}
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          disabled={phase === 'starting'}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Back
        </button>
        {phase === 'error' && (
          <button
            onClick={handleRetry}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}
