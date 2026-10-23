export const COLLAPSED_COLLECTIONS_WIDTH = 72
export const DEFAULT_COLLECTIONS_WIDTH = 200
export const MIN_COLLECTIONS_WIDTH = 184
export const MAX_COLLECTIONS_WIDTH = 420
const COLLAPSE_THRESHOLD = 128

export type CollectionsRailPreferences = {
  expanded: boolean
  width: number
}

export function readCollectionsRailPreferences(value: string | null, defaultExpanded: boolean): CollectionsRailPreferences {
  const fallback = { expanded: defaultExpanded, width: DEFAULT_COLLECTIONS_WIDTH }
  try {
    const stored: unknown = JSON.parse(value ?? 'null')
    if (!stored || typeof stored !== 'object') return fallback
    return {
      expanded: 'expanded' in stored && typeof stored.expanded === 'boolean' ? stored.expanded : defaultExpanded,
      width: 'width' in stored && typeof stored.width === 'number' && Number.isFinite(stored.width)
        ? Math.min(MAX_COLLECTIONS_WIDTH, Math.max(MIN_COLLECTIONS_WIDTH, stored.width))
        : DEFAULT_COLLECTIONS_WIDTH,
    }
  } catch {
    return fallback
  }
}

export function getMaxCollectionsWidth(viewportWidth: number, queueOpen: boolean) {
  // The queue is a drawer below 1024px; its docked widths match RoomPage.
  const queueWidth = queueOpen && viewportWidth >= 1024 ? (viewportWidth >= 1536 ? 400 : 360) : 0
  return Math.max(MIN_COLLECTIONS_WIDTH, Math.min(MAX_COLLECTIONS_WIDTH, viewportWidth - queueWidth - 360))
}

export function resizeCollectionsRail(
  previous: CollectionsRailPreferences,
  startWidth: number,
  delta: number,
  maxWidth: number,
): CollectionsRailPreferences {
  const width = startWidth + delta
  return width < COLLAPSE_THRESHOLD
    ? { ...previous, expanded: false }
    : { expanded: true, width: Math.round(Math.min(maxWidth, Math.max(MIN_COLLECTIONS_WIDTH, width))) }
}
