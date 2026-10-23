import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, LogOut, Music2, Plus, UsersRound } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { normalizeRoomCode } from '../room/roomCredentials'
import type { RoomState } from '../room/types'
import { useHomeRooms } from './useHomeRooms'
import { EntryLayout } from '../../shared/ui/EntryLayout'
import { AccountMenu } from '../auth/components/AccountMenu'
import { LoginRequiredDialog } from '../auth/components/LoginRequiredDialog'
import { DesktopInstallLink } from './DesktopInstallLink'
import { useAuth } from '../auth/context'
import { useI18n } from '../../shared/i18n/i18n-context'
import { buttonStyles, cn, formControlStyles, noticeStyles } from '../../shared/styles'

export function HomePage() {
  const { t } = useI18n()
  const { loading: authLoading, user, enabled, loginUrl } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [roomCode, setRoomCode] = useState('')
  const [notice, setNotice] = useState('')
  const [loginPromptOpen, setLoginPromptOpen] = useState(false)
  const { ownedRooms, joinedRooms, busyRoomCode, roomError,
    loading: roomsLoading, loadError, reload, leaveJoinedRoom } = useHomeRooms(user)

  useEffect(() => {
    const state = location.state as { roomDeleted?: boolean; loggedOut?: boolean; roomDisconnected?: boolean } | null
    if (!state?.roomDeleted && !state?.loggedOut && !state?.roomDisconnected) return
    setNotice(t(state.roomDisconnected ? 'participants.disconnectedNotice'
      : state.loggedOut ? 'auth.loggedOutRoom' : 'home.roomDeleted'))
    navigate('/', { replace: true, state: null })
  }, [location.state, navigate, t])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  function joinRoom(event: FormEvent) {
    event.preventDefault()
    const code = normalizeRoomCode(roomCode)
    if (code.length === 6) navigate(`/room/${code}`)
  }

  const loading = authLoading || roomsLoading
  const ownedCodes = new Set(ownedRooms.map((room) => room.code))
  const rooms = [...ownedRooms, ...joinedRooms.filter((room) => !ownedCodes.has(room.code))]
  const canJoin = roomCode.length === 6
  const createClass = cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'shrink-0 gap-1.5 rounded-md')

  return (
    <EntryLayout className="flex min-h-dvh flex-col" headerActions={
      <div className="flex items-center gap-2.5"><DesktopInstallLink /><AccountMenu /></div>
    }>
      <div className="mx-auto mt-10 mb-12 w-full max-w-[1120px] flex-1 md:mt-14">
        <h1 className="sr-only">{t('home.roomsTitle')}</h1>
        <form className="flex w-full min-w-0 items-center gap-2 sm:max-w-[360px]" onSubmit={joinRoom}>
          <label className="sr-only" htmlFor="room-code">{t('home.roomCodeLabel')}</label>
          <input id="room-code"
            className={cn(formControlStyles(), 'min-w-0 flex-1 font-mono text-sm tracking-[0.14em] uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case')}
            value={roomCode}
            onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value).slice(0, 6))}
            placeholder={t('home.roomCodePlaceholder')} minLength={6} maxLength={6} autoComplete="off" autoCapitalize="characters" spellCheck={false} required
          />
          <button className={cn(buttonStyles({ intent: 'primary', size: 'md' }), 'shrink-0 rounded-md border border-transparent disabled:border-line disabled:bg-surface disabled:text-dim disabled:opacity-100')} type="submit" disabled={!canJoin} aria-label={t('home.join')}>
            {t('home.join')}<ArrowRight size={16} aria-hidden="true" />
          </button>
        </form>
        <section className="mt-10" aria-labelledby="home-rooms-heading" aria-busy={loading}>
          <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <h2 id="home-rooms-heading" className="text-base font-semibold">{t('home.roomsTitle')}</h2>
              {user && !loading && !loadError && <span className="text-xs text-dim tabular-nums">{rooms.length}</span>}
            </div>
            {user ? (
              <Link className={createClass} to="/rooms/new"><Plus size={16} aria-hidden="true" />{t('home.newRoom')}</Link>
            ) : (
              <button className={createClass} type="button" disabled={authLoading} onClick={() => setLoginPromptOpen(true)} aria-haspopup="dialog">
                <Plus size={16} aria-hidden="true" />{t('home.newRoomLoginRequired')}
              </button>
            )}
          </div>
          {loading ? (
            <p className="py-8 text-sm text-muted" role="status">{t('home.loadingRooms')}</p>
          ) : !user ? (
            <div className="border-t border-line py-6">
              <p className="text-sm leading-6 text-muted">{t('home.signInToSeeRooms')}</p>
              {enabled && <a className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-sm text-sm text-muted underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-soft" href={loginUrl('/')}>
                {t('home.signInToSeeRoomList')}<ArrowRight size={14} aria-hidden="true" />
              </a>}
            </div>
          ) : loadError ? (
            <div className="flex flex-wrap items-center gap-4 py-6" role="alert">
              <p className="text-sm text-danger">{loadError}</p>
              <button className={buttonStyles({ intent: 'outline', size: 'sm' })} type="button" onClick={reload}>{t('common.retry')}</button>
            </div>
          ) : rooms.length === 0 ? (
            <p className="py-8 text-sm text-muted">{t('home.noRooms')}</p>
          ) : (
            <RoomList rooms={rooms} ownedCodes={ownedCodes} busyRoomCode={busyRoomCode} onLeave={(room) => void leaveJoinedRoom(room)} />
          )}
        </section>
      </div>

      {roomError && <div className={noticeStyles({ tone: 'error' })} role="alert">{roomError}</div>}
      {notice && <div className={noticeStyles()} role="status">{notice}</div>}
      <footer className="mx-auto flex w-full max-w-[1120px] shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line pt-5 pb-2 text-xs text-muted">
        <span>Powered by YouTube</span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link className="rounded-sm underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent-soft" to="/terms">{t('terms.link')}</Link>
          <Link className="rounded-sm underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent-soft" to="/privacy">{t('privacy.link')}</Link>
        </div>
      </footer>
      <LoginRequiredDialog open={loginPromptOpen && !user} onClose={() => setLoginPromptOpen(false)} />
    </EntryLayout>
  )
}

function RoomList({ rooms, ownedCodes, busyRoomCode, onLeave }: {
  rooms: RoomState[]
  ownedCodes: ReadonlySet<string>
  busyRoomCode: string
  onLeave: (room: RoomState) => void
}) {
  const { t } = useI18n()

  return (
    <ul className="divide-y divide-line border-y border-line">
      {rooms.map((room) => (
        <li className="group relative flex min-w-0 items-center hover:bg-surface" key={room.code}>
          <Link className="flex min-w-0 flex-1 items-center gap-3 rounded-sm py-3 pr-2 focus-visible:outline-2 focus-visible:outline-accent-soft sm:gap-4 sm:pr-4" to={`/room/${room.code}`}>
            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-sm bg-raised">
              {room.currentSong ? <img className="size-full object-cover" src={room.currentSong.thumbnailUrl} alt="" /> : <Music2 size={20} className="text-dim" aria-hidden="true" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-sm font-semibold" title={room.title || room.code}>{room.title || room.code}</h3>
                {ownedCodes.has(room.code) && <span className="shrink-0 rounded-sm border border-line px-1.5 py-0.5 text-[10px] leading-3 font-medium text-muted">{t('home.activeRoomHost')}</span>}
              </div>
              <p className="mt-1 truncate text-xs text-muted" title={room.currentSong?.title}>
                <span className="sr-only">{t('home.currentTrack')}: </span>{room.currentSong?.title ?? t('home.activeRoomWaiting')}
              </p>
            </div>
            <RoomStats room={room} />
            {ownedCodes.has(room.code) && <ArrowRight size={16} className="hidden shrink-0 text-dim group-hover:text-ink sm:block" aria-hidden="true" />}
          </Link>
          {!ownedCodes.has(room.code) && <button className="mr-1 grid size-10 shrink-0 place-items-center rounded-md text-dim hover:bg-raised hover:text-danger focus-visible:outline-2 focus-visible:outline-accent-soft disabled:opacity-40" type="button" aria-label={`${room.title || room.code} · ${t('home.leaveRoom')}`} title={t('home.leaveRoom')} disabled={Boolean(busyRoomCode)} onClick={() => onLeave(room)}>
            <LogOut size={17} aria-hidden="true" />
          </button>}
        </li>
      ))}
    </ul>
  )
}

function RoomStats({ room }: { room: RoomState }) {
  const { t } = useI18n()
  const participants = room.participants.filter((participant) => participant.online).length
  const songs = room.queue.length

  return (
    <div className="shrink-0 text-xs text-muted tabular-nums sm:min-w-20">
      <span className="sr-only">{t('home.activeRoomStats', { participants, songs })}</span>
      <span className="flex flex-col gap-1.5 sm:flex-row sm:gap-4" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><UsersRound size={14} />{participants}</span>
        <span className="inline-flex items-center gap-1.5"><Music2 size={14} />{songs}</span>
      </span>
    </div>
  )
}
