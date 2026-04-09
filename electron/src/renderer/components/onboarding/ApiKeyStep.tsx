import { useState } from 'react'
import { Key, ExternalLink } from 'lucide-react'
import type { OnboardingData } from './OnboardingWizard'

interface ApiKeyStepProps {
  data: OnboardingData
  updateData: (partial: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

export function ApiKeyStep({ data, updateData, onNext, onBack }: ApiKeyStepProps): JSX.Element {
  const [error, setError] = useState('')

  const handleContinue = (): void => {
    if (!data.apiKey.trim()) {
      setError('Please enter your API key')
      return
    }
    onNext()
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
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
