import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { History, Menu, PanelRightOpen, WifiOff, X } from 'lucide-react'
import { roomApi } from '../api'
import { Brand } from '../../../shared/ui/Brand'
import { DesktopUpdateButton } from '../../../shared/ui/DesktopUpdateButton'
import { RoomHeader } from '../components/RoomHeader'
import { AccountMenu } from '../../auth/components/AccountMenu'
import { useAuth } from '../../auth/context'
import { YouTubePlayer } from '../playback/YouTubePlayer'
import { clampVolume, readPlayerAudioSettings, type PlayerAudioSettings } from '../playback/playerAudioSettings'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import {
  buttonStyles,
  chromeIconButtonStyles,
  cn,
  noticeStyles,
  pageMessageStyles,
} from '../../../shared/styles'
import { useRoomState } from '../hooks/useRoomState'
import { NowPlaying } from '../components/NowPlaying'
import { ChatPanel } from '../chat/ChatPanel'
import { ParticipantsMenu } from '../components/ParticipantsMenu'
import { QueuePanel } from '../components/QueuePanel'
import { SongRequestDialog } from '../components/SongRequestDialog'
import { RoomPlaybackBar } from '../components/RoomPlaybackBar'
import { CollectionsRail } from '../components/CollectionsRail'
import { InviteRoomButton } from '../components/InviteRoomButton'
import { RoomJoinPreview } from '../components/RoomJoinPreview'
import { RoomSettingsButton } from '../components/RoomSettingsButton'
import { RoomSettingsPanel } from '../components/RoomSettingsPanel'
import { createRoomSettingsDraft, type RoomSettingsDraft, type RoomSettingsUpdate } from '../roomSettingsDraft'
import { PlaylistTracksPanel } from '../../library/PlaylistTracksPanel'
import type { Playlist } from '../../library/api'
import { canControlSong, canReportPlaybackFailure, getRoomPermissions } from '../roomPermissions'
import { useRoomSession } from '../hooks/useRoomSession'
import { clearStoredRoomCredentials, normalizeRoomCode } from '../roomCredentials'
import { useRoomActions } from '../hooks/useRoomActions'
import { useSongVote } from '../hooks/useSongVote'
import { useRoomPanelNavigation } from '../hooks/useRoomPanelNavigation'

const RoomStatsPanel = lazy(() => import('../components/RoomStatsPanel'))

export function RoomPage() {
  const { t } = useI18n()
  const { user, loading: authLoading } = useAuth()
  const params = useParams()
  const navigate = useNavigate()
  const code = normalizeRoomCode(params.code)
  const onMembershipLeft = useCallback(() => {
    clearStoredRoomCredentials(code)
    navigate('/', { replace: true })
  }, [code, navigate])
  const onDisconnected = useCallback(() => {
    navigate('/', { replace: true, state: { roomDisconnected: true } })
  }, [navigate])
  const {
    hostToken,
    isHost,
    participantToken,
    participant,
    participantLoading,
    participantError,
    retryResume,
    isOwner,
    claimingHost,
    resumeClaimedPlayback,
    revokeHost,
    joinRoom,
    claimPlaybackHost: claimPlaybackHostSession,
  } = useRoomSession(code, user)
  const {
    room,
    setRoom,
    loading,
    connected,
    serverTimeOffsetMs,
    chatMessages,
    recordsRevision,
    appendChatMessage,
    deleted,
    error: roomError,
  } = useRoomState(code, hostToken, participantToken, revokeHost, onMembershipLeft, user?.id ?? '', onDisconnected, participant?.id)
  const [nickname, setNickname] = useState('')
  const [joining, setJoining] = useState(false)
  const { panel, openPanel, closePanel, replacePanel } = useRoomPanelNavigation()
  const requestSongOpen = panel?.type === 'search'
  const statsOpen = panel?.type === 'stats'
  const settingsOpen = panel?.type === 'settings'
  const [settingsDraft, setSettingsDraft] = useState<RoomSettingsDraft | null>(null)
  const [queueOpen, setQueueOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  const [queuePeek, setQueuePeek] = useState(false)
  const selectedPlaylist = panel?.type === 'playlist' ? panel : null
  const [libraryRevision, setLibraryRevision] = useState(0)
  const [playlistMetadata, setPlaylistMetadata] = useState<Record<string, Pick<Playlist, 'id' | 'name' | 'updatedAt'>>>({})
  const [songControlTick, setSongControlTick] = useState(0)
  const [localPlaybackPosition, setLocalPlaybackPosition] = useState<{
    songId: string
    positionSeconds: number
  } | null>(null)
  const [audioSettings, setAudioSettings] = useState<PlayerAudioSettings | null>(null)
  const lastAudibleVolume = useRef(50)
  const [chatTriggerContainer, setChatTriggerContainer] = useState<HTMLDivElement | null>(null)
  const [mobileChatTriggerContainer, setMobileChatTriggerContainer] = useState<HTMLDivElement | null>(null)
  const wasAuthenticated = useRef(false)
  const joinUrl = useMemo(() => `${window.location.origin}/room/${code}`, [code])
  const queuedVideoIds = useMemo(() => new Set(room?.queue.map(({ videoId }) => videoId) ?? []), [room?.queue])
  const renamedPlaylist = selectedPlaylist ? playlistMetadata[`${selectedPlaylist.userId}:${selectedPlaylist.playlist.id}`] : undefined
  const activePlaylist = selectedPlaylist && user?.id === selectedPlaylist.userId
    ? { ...selectedPlaylist.playlist, ...(renamedPlaylist && renamedPlaylist.updatedAt >= selectedPlaylist.playlist.updatedAt ? renamedPlaylist : {}) }
    : null
  const closePlaylist = closePanel
  const closeStats = closePanel
  const closeSettings = closePanel
  function openSongRequest() {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setQueueOpen(false)
      setQueuePeek(false)
    }
    openPanel({ type: 'search' })
  }
  function openPlaylist(playlist: Playlist) {
    if (!user) return
    openPanel({ type: 'playlist', userId: user.id, playlist })
  }
  function toggleStats() {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setQueueOpen(false)
      setQueuePeek(false)
    }
    if (statsOpen) closePanel()
    else openPanel({ type: 'stats' })
  }
  function openSettings() {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setQueueOpen(false)
      setQueuePeek(false)
    }
    openPanel({ type: 'settings' })
  }
  useEffect(() => {
    if (!settingsOpen) return
    const narrowScreen = window.matchMedia('(max-width: 1023px)')
    const fitSettings = () => {
      if (narrowScreen.matches) {
        setQueueOpen(false)
        setQueuePeek(false)
      }
    }
    fitSettings()
    narrowScreen.addEventListener('change', fitSettings)
    return () => narrowScreen.removeEventListener('change', fitSettings)
  }, [settingsOpen])
  const serverNow = Date.now() + serverTimeOffsetMs

  useEffect(() => {
    if (!room) return
    const currentTime = Date.now() + serverTimeOffsetMs
    const nextAvailableAt = [room.currentSong, ...room.queue].reduce(
      (next, song) => {
        const availableAt = song?.otherControlAvailableAt
        return availableAt != null && availableAt > currentTime
          ? Math.min(next, availableAt)
          : next
      },
      Infinity,
    )
    if (!Number.isFinite(nextAvailableAt)) return
    const timer = window.setTimeout(
      () => setSongControlTick((tick) => tick + 1),
      Math.min(nextAvailableAt - currentTime + 50, 2_147_483_647),
    )
    return () => window.clearTimeout(timer)
  }, [room, serverTimeOffsetMs, songControlTick])

  useEffect(() => {
    if (authLoading) return
    if (user) {
      wasAuthenticated.current = true
      return
    }
    if (!wasAuthenticated.current) return
    wasAuthenticated.current = false
    navigate('/', { replace: true, state: { loggedOut: true } })
  }, [authLoading, navigate, user])

  useEffect(() => {
    if (!deleted) return
    clearStoredRoomCredentials(code)
    navigate('/', { replace: true, state: { roomDeleted: true } })
  }, [code, deleted, navigate])

  useEffect(() => {
    if (!user) return
    setNickname((current) => current || user.displayName.slice(0, 20))
  }, [user])

  const {
    isManager,
    isController,
    controlCredentials,
    songActionCredentials,
  } = getRoomPermissions({
    room,
    participant,
    hostToken,
    participantToken,
    isOwner,
  })
  useEffect(() => {
    if (settingsOpen && !participantLoading && !loading && !isOwner && !isManager) replacePanel(null)
  }, [settingsOpen, isOwner, isManager, participantLoading, loading, replacePanel])
  const {
    message,
    error,
    setError,
    addSong,
    sendChatMessage,
    runControllerAction,
    runQueueAction,
    reportPlaybackBlocked,
    reportPlaybackStarted,
    reportPlaybackFailed,
    claimPlaybackHost,
  } = useRoomActions({
    code,
    room,
    setRoom,
    hostToken,
    participantToken,
    controlCredentials,
    appendChatMessage,
    claimPlaybackHostSession,
  })
  const songVote = useSongVote({
    code,
    songId: room?.currentSong?.id,
    participantId: participant?.id,
    participantToken,
    setRoom,
  })

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (joining) return
    setError('')
    setJoining(true)
    try {
      setRoom(await joinRoom(user ? user.displayName.slice(0, 20) : nickname))
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    } finally {
      setJoining(false)
    }
  }

  async function leaveRoom() {
    if (!window.confirm(t('home.leaveRoomConfirm', { code }))) return
    try {
      await roomApi.leaveRoom(code)
      clearStoredRoomCredentials(code)
      navigate('/')
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    }
  }

  if (loading) {
    return (
      <main className={pageMessageStyles}>
        <Brand className="absolute top-[26px] left-[30px]" />
        <h1 className="mt-4 text-[clamp(24px,4vw,38px)]">
          {t('room.connecting')}
        </h1>
      </main>
    )
  }
  if (!room) {
    return (
      <main className={pageMessageStyles}>
        <Brand className="absolute top-[26px] left-[30px]" />
        <h1 className="mt-4 text-[clamp(24px,4vw,38px)]">
          {roomError || t('room.roomNotFound')}
        </h1>
        <Link className={buttonStyles({ intent: 'outline' })} to="/">
          {t('common.home')}
        </Link>
      </main>
    )
  }
  if (authLoading || participantLoading) {
    return (
      <main className={pageMessageStyles}>
        <Brand className="absolute top-[26px] left-[30px]" />
        <h1 className="mt-4 text-[clamp(24px,4vw,38px)]">
          {t('room.connecting')}
        </h1>
      </main>
    )
  }
  if (!participant && !isHost) {
    return (
      <RoomJoinPreview
        room={room}
        user={user}
        nickname={nickname}
        onNicknameChange={setNickname}
        onJoin={join}
        joining={joining}
        joinError={error}
        participantError={participantError}
        onRetry={retryResume}
      />
    )
  }

  const canPlayLocally = isHost || (Boolean(participant) && room.playbackMode === 'all_devices')
  const currentAudioSettings = audioSettings ?? readPlayerAudioSettings(
    room.playbackMode === 'host_only' ? room.hostVolume : 100,
  )
  const playbackSynchronization = {
    positionSeconds: room.playbackPositionSeconds,
    anchorAt: room.playbackAnchorAt,
    revision: room.playbackRevision,
    serverTimeOffsetMs,
    pending: room.playbackPending,
  }
  const saveRoomSettings = async (settings: RoomSettingsUpdate) => {
    if (!controlCredentials) return
    setRoom(await roomApi.updateRoomSettings(code, controlCredentials, settings))
    setSettingsDraft(null)
  }
  const deleteRoom = async (confirmationName: string) => {
    await roomApi.deleteRoom(code, confirmationName)
    clearStoredRoomCredentials(code)
    navigate('/', { replace: true, state: { roomDeleted: true } })
  }

  return (
    <main className="listening-room flex h-dvh min-h-0 flex-col overflow-hidden bg-canvas">
      <RoomHeader title={room.title}>
          {!connected && (
            <span
              role="status"
              className="flex items-center gap-2 text-xs text-yellow-400"
              title={t('room.connecting')}
            >
              <WifiOff size={16} aria-hidden="true" className="shrink-0" />
              <span className="sr-only sm:not-sr-only">{t('room.connecting')}</span>
            </span>
          )}
          {(participant || isHost || isOwner) && (
            <ParticipantsMenu
              participants={room.participants}
              currentParticipantId={participant?.id}
              onLeave={participant?.isMember && !isOwner ? leaveRoom : undefined}
              onJoinAccount={user && participant && !participant.isMember
                ? async () => {
                    try {
                      setRoom(await joinRoom(user.displayName.slice(0, 20)))
                    } catch (requestError) {
                      setError(getErrorMessage(requestError, t))
                    }
                  }
                : undefined}
              onSetManager={
                controlCredentials && (isManager || isOwner)
                  ? (targetParticipantId, nextIsManager) =>
                      runControllerAction(() =>
                        roomApi.setManager(
                          code,
                          controlCredentials,
                          targetParticipantId,
                          nextIsManager,
                        ),
                      )
                  : undefined
              }
              onDisconnect={isOwner
                ? (targetParticipantId) => runControllerAction(() =>
                    roomApi.disconnectParticipant(code, targetParticipantId))
                : undefined}
            />
          )}
          <InviteRoomButton code={code} joinUrl={joinUrl} allowGuests={room.allowGuests}
            triggerClassName="hidden lg:inline-flex" />
          {(isOwner || isManager) && (
            <RoomSettingsButton onClick={openSettings}
              triggerClassName="hidden lg:inline-flex" />
          )}
          <div className="hidden lg:block">
            <AccountMenu
              compact
              logoutConfirmMessage={isHost && room.playbackMode === 'host_only'
                ? t('auth.logoutHostConfirm')
                : undefined}
            />
          </div>
          <DesktopUpdateButton />
          <button type="button" className={cn(chromeIconButtonStyles, 'text-white lg:hidden')}
            aria-label={t(queueOpen ? 'queue.hide' : 'room.openMenu')} title={t(queueOpen ? 'queue.hide' : 'room.openMenu')}
            aria-controls="room-queue-panel" aria-expanded={queueOpen}
            onClick={() => { setQueueOpen((open) => !open); setQueuePeek(false) }}>
            {queueOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
      </RoomHeader>

      <section className={cn(
        'grid min-h-0 w-full flex-1 auto-rows-max grid-cols-1 gap-3 overflow-y-auto overscroll-contain p-4 sm:auto-rows-auto sm:gap-0 sm:overflow-hidden sm:p-0',
        'sm:grid-cols-[auto_minmax(0,1fr)_auto]',
      )}>
          <CollectionsRail chatTriggerRef={participant ? setChatTriggerContainer : undefined} queueOpen={queueOpen}
            statsOpen={statsOpen} onToggleStats={participant ? toggleStats : undefined}
            libraryRevision={libraryRevision} selectedPlaylistId={activePlaylist?.id ?? null} onSelectPlaylist={openPlaylist} />
          <div className={cn(
            'relative min-w-0 sm:h-full sm:min-h-0 sm:overflow-y-auto sm:overscroll-contain sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden',
            (statsOpen || settingsOpen) && 'min-h-[max(420px,calc(100dvh-220px))]',
          )}>
            <div inert={requestSongOpen || Boolean(activePlaylist) || statsOpen || settingsOpen} aria-hidden={requestSongOpen || Boolean(activePlaylist) || statsOpen || settingsOpen} className="flex min-h-full flex-col items-start justify-center px-0 py-6 sm:px-7 sm:py-8">
            <NowPlaying
              onRequestSong={participant ? openSongRequest : undefined}
              song={room.currentSong}
              player={
                canPlayLocally && room.currentSong ? (
                  <YouTubePlayer
                    songId={room.currentSong.id}
                    videoId={room.currentSong.videoId}
                    volume={room.playbackMode === 'host_only' ? room.hostVolume : 100}
                    requestedAudioSettings={audioSettings ?? undefined}
                    onAudioSettingsChange={(settings) => {
                      if (settings.volume > 0) lastAudibleVolume.current = settings.volume
                      setAudioSettings((previous) =>
                        previous?.volume === settings.volume && previous.muted === settings.muted
                          ? previous
                          : settings,
                      )
                    }}
                    paused={room.playbackPaused}
                    onPlaybackFailed={canReportPlaybackFailure(room, participant?.id, isController, isHost, serverNow)
                      ? reportPlaybackFailed : undefined}
                    playbackBlocked={
                      isHost && room.playbackMode === 'host_only'
                        ? room.playbackBlocked
                        : false
                    }
                    onPlaybackBlockedChange={
                      isHost && room.playbackMode === 'host_only'
                        ? reportPlaybackBlocked
                        : undefined
                    }
                    onPlaybackStarted={
                      (participant || isHost) &&
                      room.playbackMode === 'all_devices'
                        ? reportPlaybackStarted
                        : undefined
                    }
                    onPositionChange={(videoId, positionSeconds) => {
                      const songId = room.currentSong?.id
                      if (!songId || videoId !== room.currentSong?.videoId) return
                      setLocalPlaybackPosition((previous) =>
                        previous?.songId === songId &&
                        Math.abs(previous.positionSeconds - positionSeconds) < 0.2
                          ? previous
                          : { songId, positionSeconds },
                      )
                    }}
                    onEnded={
                      isHost && room.playbackMode === 'host_only'
                        ? () =>
                            runQueueAction(() =>
                              roomApi.advance(code, hostToken, { reason: 'ended', songId: room.currentSong?.id }),
                            )
                        : undefined
                    }
                    synchronization={room.playbackMode === 'all_devices' ||
                      (isHost && resumeClaimedPlayback)
                        ? playbackSynchronization
                        : undefined}
                  />
                ) : undefined
              }
              onClaimPlaybackHost={
                isOwner && !isHost && room.playbackMode === 'host_only'
                  ? () => void claimPlaybackHost()
                  : undefined
              }
              claimingPlaybackHost={claimingHost}
            />
            </div>
            {participant && (
              <SongRequestDialog
                code={code}
                participantToken={participantToken}
                open={requestSongOpen}
                onClose={closePanel}
                onAddSong={addSong}
                queuedVideoIds={queuedVideoIds}
                currentVideoId={room.currentSong?.videoId ?? null}
                message={message}
                error={error || roomError}
              />
            )}
            {activePlaylist && (
              <PlaylistTracksPanel
                key={activePlaylist.id}
                playlist={activePlaylist}
                revision={libraryRevision}
                onClose={closePlaylist}
                onAddSong={participant ? addSong : undefined}
                queuedVideoIds={queuedVideoIds}
                currentVideoId={room.currentSong?.videoId ?? null}
                onLibraryChange={(updatedPlaylist) => {
                  setLibraryRevision((revision) => revision + 1)
                  if (updatedPlaylist && selectedPlaylist) {
                    const key = `${selectedPlaylist.userId}:${updatedPlaylist.id}`
                    setPlaylistMetadata((current) => current[key]?.updatedAt > updatedPlaylist.updatedAt
                      ? current : { ...current, [key]: updatedPlaylist })
                  }
                }}
                onPlaylistRenamed={(name, updatedAt) => {
                  if (selectedPlaylist) replacePanel({ ...selectedPlaylist,
                    playlist: { ...selectedPlaylist.playlist, name, updatedAt } })
                }}
                onPlaylistDeleted={() => {
                  replacePanel(null)
                }}
                message={message}
                roomError={error || roomError}
              />
            )}
            {statsOpen && participant && <Suspense fallback={<div className="absolute inset-0 z-20 bg-canvas p-6 text-sm text-muted" role="status">{t('library.loading')}</div>}>
              <RoomStatsPanel key={recordsRevision} code={code} participantToken={participantToken}
                tab={panel?.type === 'stats' ? panel.tab ?? 'stats' : 'stats'}
                onTabChange={(tab) => replacePanel({ type: 'stats', tab })}
                revision={`${room.currentSong?.id ?? ''}:${room.currentSong?.voteRevision ?? 0}:${room.playbackRevision}`}
                historyRevision={room.currentSong?.id ?? ''}
                participants={room.participants} currentParticipantId={participant.id}
                onClose={closeStats} onAddSong={addSong}
                queuedVideoIds={queuedVideoIds} currentVideoId={room.currentSong?.videoId ?? null}
                onLibraryChange={() => setLibraryRevision((revision) => revision + 1)}
                libraryRevision={libraryRevision} message={message} roomError={error || roomError} />
            </Suspense>}
            {settingsOpen && (isOwner || isManager) && <RoomSettingsPanel room={room} isOwner={isOwner}
              draft={settingsDraft ?? createRoomSettingsDraft(room)} onDraftChange={setSettingsDraft}
              onSave={saveRoomSettings} onDelete={deleteRoom} onClose={closeSettings} />}
          </div>
            {queueOpen && <button type="button"
              className="fixed inset-x-0 top-[var(--room-header-bottom,3.5rem)] bottom-0 z-[75] bg-black/60 lg:hidden"
              aria-label={t('queue.hide')}
              onClick={() => { setQueueOpen(false); setQueuePeek(false) }} />}
            <div
              className={cn(
                'fixed top-[var(--room-header-bottom,3.5rem)] right-0 bottom-0 transition-[width] duration-300 ease-out motion-reduce:transition-none lg:relative lg:inset-auto lg:z-30 lg:h-full',
                queueOpen || queuePeek ? 'z-[80]' : 'z-[65]',
                queueOpen
                  ? 'w-[calc(100vw-24px)] max-w-[360px] lg:w-[360px] 2xl:w-[400px] 2xl:max-w-[400px]'
                  : 'w-0',
              )}
              onPointerEnter={(event) => {
                if (!queueOpen && event.pointerType === 'mouse' && window.matchMedia('(min-width: 1024px)').matches) {
                  setQueuePeek(true)
                }
              }}
              onPointerLeave={() => { if (!queueOpen) setQueuePeek(false) }}
              onClick={() => {
                if (!queueOpen && window.matchMedia('(min-width: 1024px)').matches) {
                  setQueueOpen(true)
                  setQueuePeek(false)
                }
              }}
            >
              <div className={cn(
                'absolute inset-y-0 right-0 overflow-hidden transition-[width] duration-300 ease-out motion-reduce:transition-none',
                queueOpen
                  ? 'w-[calc(100vw-24px)] max-w-[360px] lg:w-[360px] 2xl:w-[400px] 2xl:max-w-[400px]'
                  : queuePeek ? 'w-0 lg:w-12' : 'w-0 lg:w-3',
              )}>
                <div className="relative h-full w-[calc(100vw-24px)] max-w-[360px] bg-canvas lg:w-[360px] 2xl:w-[400px] 2xl:max-w-[400px]"
                  inert={!queueOpen} aria-hidden={!queueOpen}>
                  <QueuePanel
                    className="h-full min-h-0 rounded-none border-y-0 border-r-0 bg-canvas lg:bg-panel"
                    onClose={queueOpen ? () => { setQueueOpen(false); setQueuePeek(false) } : undefined}
                    songs={room.queue}
                    autoplaySuggestions={room.autoplaySuggestions}
                    historyAutoplay={room.historyAutoplay}
                    onLibraryChange={() => setLibraryRevision((revision) => revision + 1)}
                    libraryRevision={libraryRevision}
                    onRequestSong={participant ? openSongRequest : undefined}
                    onRefreshAutoplay={controlCredentials
                      ? () => runQueueAction(() => roomApi.refreshAutoplaySuggestions(code, controlCredentials))
                      : undefined}
                    onReorder={
                      controlCredentials
                        ? (songId, targetIndex) =>
                            runQueueAction(() =>
                              roomApi.reorderSong(
                                code,
                                controlCredentials,
                                songId,
                                targetIndex,
                              ),
                            )
                        : undefined
                    }
                    onRemove={
                      songActionCredentials
                        ? (songId) =>
                            runQueueAction(() =>
                              roomApi.removeSong(
                                code,
                                songActionCredentials,
                                songId,
                              ),
                            )
                        : undefined
                    }
                    canRemove={(song) => canControlSong(
                      song,
                      participant?.id,
                      isController,
                      serverNow,
                    )}
                    footer={queueOpen && <nav
                      className="mt-3 flex shrink-0 items-center justify-between gap-1 border-t border-line px-1 pt-3 lg:hidden"
                      aria-label={t('room.mobileMenu')}>
                      {participant && <div ref={setMobileChatTriggerContainer} className="size-10 shrink-0" />}
                      {participant && <button type="button"
                        className={cn(chromeIconButtonStyles, 'text-white')}
                        aria-label={t('stats.open')} title={t('stats.open')}
                        aria-pressed={statsOpen} onClick={toggleStats}>
                        <History size={19} aria-hidden="true" />
                      </button>}
                      {(isOwner || isManager) && <RoomSettingsButton onClick={openSettings}
                        triggerClassName="text-white" />}
                      <InviteRoomButton code={code} joinUrl={joinUrl} allowGuests={room.allowGuests}
                        triggerClassName="text-white" />
                      <AccountMenu compact menuPlacement="above"
                        logoutConfirmMessage={isHost && room.playbackMode === 'host_only'
                          ? t('auth.logoutHostConfirm')
                          : undefined} />
                    </nav>}
                  />
                  {!queueOpen && <div aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-black/25" />}
                </div>
              </div>
              {!queueOpen && <button type="button"
                className="absolute top-1/2 right-0 z-10 hidden h-full w-11 -translate-y-1/2 items-center justify-center bg-transparent text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-soft lg:flex"
                aria-label={t('queue.show')}
                title={t('queue.show')}
                aria-controls="room-queue-panel"
                aria-expanded={false}
                onClick={() => { setQueueOpen(true); setQueuePeek(false) }}>
                <PanelRightOpen size={19} aria-hidden="true"
                  className={cn('shrink-0 drop-shadow-[0_1px_4px_rgba(0,0,0,.9)] transition-opacity', queuePeek ? 'opacity-100' : 'opacity-0')} />
              </button>}
            </div>
      </section>

      <RoomPlaybackBar
        song={room.currentSong}
        vote={{
          myVote: songVote.myVote,
          ready: songVote.ready,
          isOwnRequest: Boolean(room.currentSong && participant &&
            room.currentSong.addedById === participant.id) || songVote.isOwnRequest,
          voting: songVote.voting,
          error: songVote.error,
          onVote: (choice) => { void songVote.vote(choice) },
        }}
        libraryRevision={libraryRevision}
        onLibraryChange={() => setLibraryRevision((revision) => revision + 1)}
        paused={room.playbackPaused}
        blocked={room.playbackMode === 'host_only' && room.playbackBlocked}
        synchronization={playbackSynchronization}
        localPositionSeconds={canPlayLocally && localPlaybackPosition && localPlaybackPosition.songId === room.currentSong?.id
          ? localPlaybackPosition.positionSeconds
          : undefined}
        audioSettings={canPlayLocally && room.currentSong ? currentAudioSettings : undefined}
        onVolumeChange={(volume) => {
          const nextVolume = clampVolume(volume)
          if (nextVolume > 0) lastAudibleVolume.current = nextVolume
          setAudioSettings({ volume: nextVolume, muted: nextVolume === 0 })
        }}
        onMuteToggle={() => setAudioSettings((previous) => {
          const current = previous ?? currentAudioSettings
          if (current.muted || current.volume === 0) {
            return { volume: current.volume || lastAudibleVolume.current, muted: false }
          }
          return { ...current, muted: true }
        })}
        onAdvance={
          songActionCredentials && room.currentSong &&
          canControlSong(room.currentSong, participant?.id, isController, serverNow)
            ? () => runQueueAction(() => roomApi.advance(code, songActionCredentials, { songId: room.currentSong?.id }))
            : undefined
        }
        onGlobalPlaybackToggle={
          controlCredentials
            ? () => runQueueAction(() => roomApi.setPlaybackPaused(
                code,
                controlCredentials,
                !room.playbackPaused,
              ))
            : undefined
        }
      />
      {participant && (
        <ChatPanel
          roomCode={code}
          messages={chatMessages}
          participants={room.participants}
          currentParticipantId={participant.id}
          triggerContainer={chatTriggerContainer}
          mobileTriggerContainer={mobileChatTriggerContainer}
          hideMobileFloatingTrigger
          onMobileTriggerClick={() => { setQueueOpen(false); setQueuePeek(false) }}
          onSend={sendChatMessage}
        />
      )}

      {(error || roomError) && !requestSongOpen && !activePlaylist && (
        <div className={noticeStyles({ tone: 'error' })}>
          {error || roomError}
        </div>
      )}
      {message && !requestSongOpen && !activePlaylist && (
        <div
          className={noticeStyles({ tone: 'success' })}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      )}
    </main>
  )
}
