import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { WelcomeStep } from './WelcomeStep'
import { ApiKeyStep } from './ApiKeyStep'
import { SetupStep } from './SetupStep'
import { FolderSelectionStep } from './FolderSelectionStep'
import { AutoIndexStep } from './AutoIndexStep'
import { PhotosStep } from './PhotosStep'
import { CompletionStep } from './CompletionStep'

interface OnboardingWizardProps {
  onComplete: () => void
}

export interface OnboardingData {
  apiKey: string
  folders: string[]
  autoIndexEnabled: boolean
  photosEnabled: boolean
}

const TOTAL_STEPS = 7

export function OnboardingWizard({ onComplete }: OnboardingWizardProps): JSX.Element {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<OnboardingData>({
    apiKey: '',
    folders: [],
    autoIndexEnabled: false,
    photosEnabled: false
  })

  const updateData = (partial: Partial<OnboardingData>): void => {
    setData((prev) => ({ ...prev, ...partial }))
  }

  const next = (): void => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  const back = (): void => setStep((s) => Math.max(s - 1, 0))

  const stepComponent = (() => {
    switch (step) {
      case 0:
        return <WelcomeStep onNext={next} />
      case 1:
        return <ApiKeyStep data={data} updateData={updateData} onNext={next} onBack={back} />
      case 2:
        return <SetupStep data={data} onNext={next} onBack={back} />
      case 3:
        return (
          <FolderSelectionStep data={data} updateData={updateData} onNext={next} onBack={back} />
        )
      case 4:
        return <AutoIndexStep data={data} updateData={updateData} onNext={next} onBack={back} />
      case 5:
        return <PhotosStep data={data} updateData={updateData} onNext={next} onBack={back} />
      case 6:
        return <CompletionStep data={data} onComplete={onComplete} onBack={back} />
      default:
        return null
    }
  })()

  return (
    <Dialog.Root open modal>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-2xl shadow-2xl w-[480px] max-h-[85vh] overflow-y-auto p-0 focus:outline-none">
          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 pt-6 pb-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-primary' : i < step ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="px-8 pb-8">{stepComponent}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
