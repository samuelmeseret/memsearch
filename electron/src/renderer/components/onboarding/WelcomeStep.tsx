import { FolderSearch, Image } from 'lucide-react'
import logo from '../../assets/logo.png'

interface WelcomeStepProps {
  onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps): JSX.Element {
  return (
    <div className="flex flex-col items-center text-center pt-4">
      <img src={logo} alt="MemSearch" className="w-20 h-20 rounded-2xl mb-6" />

      <h2 className="text-xl font-semibold text-foreground">Welcome to MemSearch</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        AI-powered semantic search for your Mac. Find any file by describing what you remember about it.
      </p>

      <div className="mt-8 w-full space-y-3">
        <div className="flex items-start gap-3 text-left p-3 rounded-lg bg-card border border-border">
          <FolderSearch className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-card-foreground">Search by meaning</p>
            <p className="text-xs text-muted-foreground">
              Describe what you're looking for in natural language
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 text-left p-3 rounded-lg bg-card border border-border">
          <Image className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-card-foreground">Images, PDFs & text</p>
            <p className="text-xs text-muted-foreground">
              Indexes documents, photos, code, and more
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onNext}
        className="mt-8 w-full px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
      >
        Get Started
      </button>
    </div>
  )
}
