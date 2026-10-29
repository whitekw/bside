import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Playlist } from '../../library/api'

type RoomPanel =
  | { type: 'search' }
  | { type: 'stats'; tab?: 'stats' | 'history' }
  | { type: 'settings' }
  | { type: 'playlist'; userId: string; playlist: Playlist }

type PanelEntry = { panel: RoomPanel | null; previousKey?: string }

export function useRoomPanelNavigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { roomView?: PanelEntry } | null
  const entry = state?.roomView
  const panel = entry?.panel ?? null
  const openPanel = useCallback((next: RoomPanel) => {
    if (panel?.type === next.type && (next.type !== 'playlist' ||
      (panel.type === 'playlist' && panel.playlist.id === next.playlist.id && panel.userId === next.userId))) return
    void navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, {
      state: { ...location.state, roomView: { panel: next, previousKey: location.key } },
      preventScrollReset: true,
    })
  }, [location, navigate, panel])
  const replacePanel = useCallback((next: RoomPanel | null) => {
    void navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, {
      replace: true, state: { ...location.state, roomView: { ...entry, panel: next } },
      preventScrollReset: true,
    })
  }, [entry, location, navigate])
  const closePanel = useCallback(() => {
    if (!panel) return
    if (entry?.previousKey) void navigate(-1)
    else replacePanel(null)
  }, [entry?.previousKey, navigate, panel, replacePanel])
  return { panel, openPanel, closePanel, replacePanel, hasPreviousPanel: Boolean(entry?.previousKey) }
}
