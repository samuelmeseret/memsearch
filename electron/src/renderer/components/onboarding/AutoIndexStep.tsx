import { Eye } from 'lucide-react'
import type { OnboardingData } from './OnboardingWizard'

interface AutoIndexStepProps {
  data: OnboardingData
  updateData: (partial: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

export function AutoIndexStep({
  data,
  updateData,
  onNext,
  onBack
}: AutoIndexStepProps): JSX.Element {
  return (
    <div className="pt-4">
      <div className="flex items-center gap-2 mb-2">
        <Eye className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Automatic Indexing</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        When enabled, MemSearch watches your folders and automatically re-indexes files when they
        change. This keeps your search results up to date without manual intervention.
      </p>

      <button
        onClick={() => updateData({ autoIndexEnabled: !data.autoIndexEnabled })}
        className="w-full flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
      >
        <div className="text-left">
          <p className="text-sm font-medium text-card-foreground">Enable auto-indexing</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Watches for file changes and re-indexes automatically
          </p>
        </div>
        <div
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            data.autoIndexEnabled ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              data.autoIndexEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </div>
      </button>

      <p className="mt-3 text-xs text-muted-foreground">You can change this later in settings.</p>

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
