import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  COLLAPSED_COLLECTIONS_WIDTH,
  MIN_COLLECTIONS_WIDTH,
  getMaxCollectionsWidth,
  readCollectionsRailPreferences,
  resizeCollectionsRail,
  type CollectionsRailPreferences,
} from '../collectionsRailLayout'

const STORAGE_KEY = 'jukebox:collections-rail'

function initialPreferences() {
  const defaultExpanded = window.matchMedia('(min-width: 1024px)').matches
  try {
    return readCollectionsRailPreferences(localStorage.getItem(STORAGE_KEY), defaultExpanded)
  } catch {
    return readCollectionsRailPreferences(null, defaultExpanded)
  }
}

export function useCollectionsRail(queueOpen: boolean) {
  const [preferences, setPreferences] = useState(initialPreferences)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [resizing, setResizing] = useState(false)
  const interaction = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    preferences: CollectionsRailPreferences
  } | null>(null)
  const maxWidth = getMaxCollectionsWidth(viewportWidth, queueOpen)
  const width = preferences.expanded ? Math.min(preferences.width, maxWidth) : COLLAPSED_COLLECTIONS_WIDTH

  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (resizing) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)) } catch {
      // Collapsing and resizing still work when storage is unavailable.
    }
  }, [preferences, resizing])

  useEffect(() => {
    if (!resizing) return
    const { userSelect, cursor } = document.body.style
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    return () => {
      document.body.style.userSelect = userSelect
      document.body.style.cursor = cursor
    }
  }, [resizing])

  function toggle() {
    setPreferences(previous => ({ ...previous, expanded: !previous.expanded }))
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    interaction.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, preferences }
    setResizing(true)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = interaction.current
    if (!start || start.pointerId !== event.pointerId) return
    setPreferences(resizeCollectionsRail(start.preferences, start.startWidth, event.clientX - start.startX, maxWidth))
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>, cancel = false) {
    const start = interaction.current
    if (!start || start.pointerId !== event.pointerId) return
    if (cancel) setPreferences(start.preferences)
    interaction.current = null
    setResizing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Enter') toggle()
    else if (event.key === 'Home' || (event.key === 'ArrowLeft' && width <= MIN_COLLECTIONS_WIDTH)) {
      setPreferences(previous => ({ ...previous, expanded: false }))
    } else if (event.key === 'End') setPreferences({ expanded: true, width: maxWidth })
    else if (!preferences.expanded) setPreferences(previous => ({ ...previous, expanded: true }))
    else setPreferences(previous => resizeCollectionsRail(previous, width, event.key === 'ArrowRight' ? 16 : -16, maxWidth))
  }

  return {
    expanded: preferences.expanded, width, maxWidth, resizing, toggle,
    separatorProps: {
      onPointerDown, onPointerMove, onKeyDown,
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => finishPointer(event),
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => finishPointer(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => finishPointer(event),
    },
  }
}
