import { createContext, useContext } from 'react'
import { useNavigate } from 'react-router-dom'

export const NavigationContext = createContext({ canGoBack: false, canGoForward: false })

export function useAppNavigation() {
  const availability = useContext(NavigationContext)
  const navigate = useNavigate()
  return { ...availability,
    back: () => { if (availability.canGoBack) void navigate(-1); else void navigate('/') },
    forward: () => { if (availability.canGoForward) void navigate(1) },
  }
}
