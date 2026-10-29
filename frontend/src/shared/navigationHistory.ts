export type NavigationHistory = { index: number; maximum: number }

export function updateNavigationHistory(previous: NavigationHistory, index: unknown, action: string): NavigationHistory {
  const current = typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 ? index : 0
  return { index: current, maximum: action === 'PUSH' ? current : Math.max(previous.maximum, current) }
}
