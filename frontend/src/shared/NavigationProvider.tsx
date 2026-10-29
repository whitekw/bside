import { useLayoutEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { updateNavigationHistory, type NavigationHistory } from './navigationHistory'
import { NavigationContext } from './useAppNavigation'

const storageKey = 'jukebox:navigation-maximum:'
function initialHistory(navigationId: string): NavigationHistory {
  const index = Number.isSafeInteger(window.history.state?.idx) ? window.history.state.idx : 0
  let maximum = index
  try {
    const stored = Number(window.sessionStorage.getItem(storageKey + navigationId))
    if (Number.isSafeInteger(stored) && stored >= index) maximum = stored
  } catch { /* Navigation still works without storage. */ }
  return { index, maximum }
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const action = useNavigationType()
  const [navigationId] = useState(() => {
    const existing = window.history.state?.bsideNavigationId
    return typeof existing === 'string' ? existing : window.crypto.randomUUID()
  })
  const [history, setHistory] = useState(() => initialHistory(navigationId))
  useLayoutEffect(() => {
    window.history.replaceState({ ...window.history.state, bsideNavigationId: navigationId }, '')
    setHistory((previous) => {
      const next = updateNavigationHistory(previous, window.history.state?.idx, action)
      try { window.sessionStorage.setItem(storageKey + navigationId, String(next.maximum)) } catch { /* Optional storage. */ }
      return next
    })
  }, [location.key, action, navigationId])
  return <NavigationContext value={{ canGoBack: history.index > 0, canGoForward: history.index < history.maximum }}>
    {children}
  </NavigationContext>
}
