import { Camera, Shield } from 'lucide-react'
import type { OnboardingData } from './OnboardingWizard'

interface PhotosStepProps {
  data: OnboardingData
  updateData: (partial: Partial<OnboardingData>) => void
  onNext: () => void
  onBack: () => void
}

export function PhotosStep({ data, updateData, onNext, onBack }: PhotosStepProps): JSX.Element {
  return (
    <div className="pt-4">
      <div className="flex items-center gap-2 mb-2">
        <Camera className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">iCloud Photos</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        MemSearch can index your iCloud Photos library, making your photos searchable by their
        content.
      </p>

      <button
        onClick={() => updateData({ photosEnabled: !data.photosEnabled })}
        className="w-full flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
      >
        <div className="text-left">
          <p className="text-sm font-medium text-card-foreground">Index iCloud Photos</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Search your photos by describing what's in them
          </p>
        </div>
        <div
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            data.photosEnabled ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              data.photosEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </div>
      </button>

      {data.photosEnabled && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
          <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-card-foreground">Permission required</p>
            <p className="mt-0.5">
              macOS will ask for Photos access. Go to System Settings &rarr; Privacy &amp; Security
              &rarr; Photos to grant access.
            </p>
          </div>
        </div>
      )}

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
