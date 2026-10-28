import { useEffect, useState } from 'react'
import Splash from './screens/Splash'
import Onboarding from './screens/Onboarding'
import AuthFlow from './screens/AuthFlow'
import Done from './screens/Done'
import BusinessSignIn from './business/BusinessSignIn'
import './App.css'

type Screen = 'splash' | 'onboard' | 'auth' | 'done'
type Route = 'customer' | 'business'
type Session = { variant: 'guest' | 'signed-in'; label?: string }

/** First-run check: onboarding shows once, then `nz.onboarded` skips it. */
function hasOnboarded(): boolean {
  try {
    return localStorage.getItem('nz.onboarded') === '1'
  } catch {
    return false
  }
}

/** `/busdash` (optional trailing slash) opens the merchant flow. */
function readRoute(): Route {
  if (/(^|\/)busdash\/?$/i.test(window.location.pathname)) {
    return 'business'
  }
  return 'customer'
}

function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [screen, setScreen] = useState<Screen>('splash')
  const [session, setSession] = useState<Session>({ variant: 'guest' })

  useEffect(() => {
    function sync() {
      setRoute(readRoute())
    }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  function goBusiness() {
    // Relative push: resolves against the current directory, so sub-path
    // deployments (e.g. /nearzoopweb/) still land next to the app.
    try {
      window.history.pushState({}, '', 'busdash')
    } catch {
      // History may be unavailable in sandboxed contexts; state still flips.
    }
    setRoute('business')
  }

  if (route === 'business') {
    return <BusinessSignIn />
  }

  if (screen === 'splash') {
    // Splash gates navigation: it calls onProceed only on location grant.
    return <Splash onProceed={() => setScreen(hasOnboarded() ? 'auth' : 'onboard')} />
  }

  if (screen === 'onboard') {
    return <Onboarding onExit={() => setScreen('auth')} />
  }

  if (screen === 'auth') {
    return (
      <AuthFlow
        onSignedIn={(label) => {
          setSession({ variant: 'signed-in', label })
          setScreen('done')
        }}
        onSkip={() => {
          setSession({ variant: 'guest' })
          setScreen('done')
        }}
        onBusiness={goBusiness}
      />
    )
  }

  return (
    <Done
      variant={session.variant}
      label={session.label}
      onSignOut={() => setScreen('auth')}
    />
  )
}

export default App
