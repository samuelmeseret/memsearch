import { useState } from 'react'
import { Key, ExternalLink, Loader2 } from 'lucide-react'
import type { OnboardingData } from './OnboardingWizard'

interface ApiKeyStepProps {
  data: OnboardingData
  updateData: (partial: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

export function ApiKeyStep({ data, updateData, onNext, onBack }: ApiKeyStepProps): JSX.Element {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const waitForBackend = async (maxWait = 15000): Promise<void> => {
    const start = Date.now()
    while (Date.now() - start < maxWait) {
      try {
        const res = await fetch('http://127.0.0.1:7242/status')
        if (res.ok) return
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  const handleContinue = async (): Promise<void> => {
    if (!data.apiKey.trim()) {
      setError('Please enter your API key')
      return
    }
    setSaving(true)
    setError('')
    try {
      await window.api.setApiKey(data.apiKey.trim())
      // Wait for backend to come back up after restart
      await waitForBackend()
      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pt-4">
      <div className="flex items-center gap-2 mb-2">
        <Key className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Gemini API Key</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        MemSearch uses Google's Gemini AI to understand your files. You'll need a free API key.
      </p>

      <div className="space-y-3">
        <input
          type="password"
          value={data.apiKey}
          onChange={(e) => {
            updateData({ apiKey: e.target.value })
            setError('')
          }}
          placeholder="Enter your Gemini API key"
          className="w-full bg-secondary text-secondary-foreground text-sm rounded-lg px-3 py-2.5 outline-none border border-border focus:border-primary transition-colors"
          onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
          autoFocus
        />

        {error && <p className="text-xs text-destructive">{error}</p>}

        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={(e) => {
            e.preventDefault()
            window.api.openFile('https://aistudio.google.com/apikey')
          }}
        >
          Get a free API key from Google AI Studio
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving...
            </span>
          ) : (
            'Continue'
          )}
        </button>
      </div>
    </div>
  )
}
