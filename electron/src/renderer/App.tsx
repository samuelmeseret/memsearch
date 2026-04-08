import { useState, useEffect } from 'react'
import SearchPage from './pages/SearchPage'
import StatusPage from './pages/StatusPage'
import { useBackendHealth } from './hooks/useBackendHealth'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'

type Tab = 'search' | 'status'

const healthColors = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  disconnected: 'bg-red-500'
}

const healthLabels = {
  connected: 'Backend connected',
  connecting: 'Connecting to backend...',
  disconnected: 'Backend disconnected'
}

export default function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('search')
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)
  const health = useBackendHealth()

  useEffect(() => {
    window.api.getStoreValue('onboardingComplete').then((val) => {
      setShowOnboarding(!val)
    })
  }, [])

  // Still loading onboarding state
  if (showOnboarding === null) {
    return <div className="h-screen bg-background" />
  }

  if (showOnboarding) {
    return (
      <div className="h-screen flex flex-col bg-background text-foreground">
        {/* Title bar drag region */}
        <div className="h-12 shrink-0 app-drag-region" />
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Title bar drag region */}
      <div className="h-12 flex items-center justify-center shrink-0 app-drag-region relative">
        <nav className="flex gap-1 bg-muted rounded-lg p-1 no-drag">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-1 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'search'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Search
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`px-4 py-1 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'status'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Status
          </button>
        </nav>

        {/* Backend health indicator */}
        <div className="absolute right-4 no-drag" title={healthLabels[health]}>
          <div className={`w-2.5 h-2.5 rounded-full ${healthColors[health]}`} />
        </div>
      </div>

      {/* Page content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'search' ? <SearchPage /> : <StatusPage />}
      </main>
    </div>
  )
}
