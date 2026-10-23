import { useId, useState, type DragEvent, type KeyboardEvent, type Ref } from 'react'
import { Heart, History, ListMusic, PanelLeftClose, PanelLeftOpen, Plus, RotateCw } from 'lucide-react'
import { useAuth } from '../../auth/context'
import type { Playlist } from '../../library/api'
import { usePlaylistOrder } from '../../library/usePlaylistOrder'
import { CreatePlaylistDialog } from '../../library/CreatePlaylistDialog'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { cn, panelStyles } from '../../../shared/styles'
import { useCollectionsRail } from '../hooks/useCollectionsRail'

export function CollectionsRail({ chatTriggerRef, statsOpen = false, onToggleStats, libraryRevision = 0, selectedPlaylistId, onSelectPlaylist, queueOpen = false }: {
  chatTriggerRef?: Ref<HTMLDivElement>
  statsOpen?: boolean
  onToggleStats?: () => void
  libraryRevision?: number
  selectedPlaylistId: string | null
  onSelectPlaylist: (playlist: Playlist) => void
  queueOpen?: boolean
}) {
  const { t } = useI18n()
  const { user } = useAuth()
  const userId = user?.id
  const rail = useCollectionsRail(queueOpen)
  const { playlists, loading, error, saving, reorderError, reload, reorder } = usePlaylistOrder(userId, libraryRevision)
  const [creating, setCreating] = useState(false)
  const [draggedId, setDraggedId] = useState('')
  const [dropTarget, setDropTarget] = useState<{ id: string; edge: 'before' | 'after' } | null>(null)
  const reorderHintId = useId()
  const canReorder = !saving && playlists.length > 1

  function finishDragging() {
    setDraggedId('')
    setDropTarget(null)
  }

  function dragOver(event: DragEvent<HTMLButtonElement>, id: string, horizontal: boolean) {
    if (!canReorder || !draggedId || draggedId === id) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const bounds = event.currentTarget.getBoundingClientRect()
    const before = horizontal ? event.clientX < bounds.left + bounds.width / 2 : event.clientY < bounds.top + bounds.height / 2
    setDropTarget({ id, edge: before ? 'before' : 'after' })
  }

  function dropPlaylist(event: DragEvent<HTMLButtonElement>, id: string) {
    event.preventDefault()
    const sourceIndex = playlists.findIndex((playlist) => playlist.id === draggedId)
    const remaining = playlists.filter((playlist) => playlist.id !== draggedId)
    const targetIndex = remaining.findIndex((playlist) => playlist.id === id)
    const insertionIndex = targetIndex + (dropTarget?.id === id && dropTarget.edge === 'after' ? 1 : 0)
    if (canReorder && sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== insertionIndex) {
      void reorder(draggedId, insertionIndex)
    }
    finishDragging()
  }

  function reorderWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, id: string, horizontal: boolean) {
    if (!event.altKey || !canReorder) return
    const direction = event.key === (horizontal ? 'ArrowLeft' : 'ArrowUp') ? -1
      : event.key === (horizontal ? 'ArrowRight' : 'ArrowDown') ? 1 : 0
    if (!direction) return
    event.preventDefault()
    const index = playlists.findIndex((playlist) => playlist.id === id)
    if (index + direction >= 0 && index + direction < playlists.length) void reorder(id, index + direction)
  }

  function dragProps(id: string, horizontal: boolean) {
    return {
      draggable: canReorder,
      'aria-describedby': reorderHintId,
      onDragStart: (event: DragEvent<HTMLButtonElement>) => {
        if (!canReorder) { event.preventDefault(); return }
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', id)
        setDraggedId(id)
      },
      onDragOver: (event: DragEvent<HTMLButtonElement>) => dragOver(event, id, horizontal),
      onDrop: (event: DragEvent<HTMLButtonElement>) => dropPlaylist(event, id),
      onDragEnd: finishDragging,
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => reorderWithKeyboard(event, id, horizontal),
    }
  }

  function dragStyles(id: string, horizontal: boolean) {
    return cn(
      'relative',
      canReorder && 'cursor-grab select-none active:cursor-grabbing',
      draggedId === id && 'opacity-35',
      dropTarget?.id === id && 'before:absolute before:rounded-full before:bg-signal ',
      dropTarget?.id === id && (horizontal
        ? cn('before:top-0 before:h-11 before:w-0.5', dropTarget.edge === 'before' ? 'before:-left-1' : 'before:-right-1')
        : cn('before:left-0 before:h-0.5 before:w-full', dropTarget.edge === 'before' ? 'before:-top-1' : 'before:-bottom-1')),
    )
  }

  return <>
    {userId && <span id={reorderHintId} className="sr-only">{t('library.reorderHint')}</span>}
    {reorderError !== null && <p role="alert" className="fixed bottom-24 left-1/2 z-[80] max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-lg border border-danger/35 bg-canvas px-4 py-3 text-sm text-danger">
      {getErrorMessage(reorderError, t)}
    </p>}
    {userId && <nav className="min-w-0 rounded-[4px] border border-line bg-panel p-2 sm:hidden" aria-label={t('collection.railTitle')}>
      <div className="px-1 pb-2 text-xs font-semibold text-muted">{t('collection.railTitle')}</div>
      <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          className="flex w-14 shrink-0 flex-col items-center gap-1 text-ink focus-visible:outline-2 focus-visible:outline-accent-soft"
          aria-label={t('library.newPlaylist')}
          disabled={saving}
          onClick={() => setCreating(true)}
        >
          <span className="grid size-12 place-items-center rounded-[4px] border border-accent-soft/25 bg-accent-soft/10"><Plus size={21} aria-hidden="true" /></span>
          <span className="w-full truncate text-center text-[11px]">{t('library.newPlaylist')}</span>
        </button>
        {playlists.map((playlist) => {
          const name = playlist.kind === 'favorites' ? t('collection.favorites') : playlist.name
          return <button
            key={playlist.id}
            type="button"
            className={cn('flex w-14 shrink-0 flex-col items-center gap-1 text-ink focus-visible:outline-2 focus-visible:outline-accent-soft', dragStyles(playlist.id, true))}
            aria-label={`${name} · ${t('library.trackCount', { count: playlist.trackCount })}`}
            aria-pressed={selectedPlaylistId === playlist.id}
            onClick={() => onSelectPlaylist(playlist)}
            {...dragProps(playlist.id, true)}
          >
            <span className={cn(
              'grid size-12 place-items-center overflow-hidden rounded-[4px] bg-white/5 text-ink ring-1 ring-inset ring-transparent',
              selectedPlaylistId === playlist.id && 'ring-accent-soft',
            )}>
              {playlist.kind === 'favorites'
                ? <span className="grid size-full place-items-center bg-raised text-white"><Heart size={21} fill="currentColor" aria-hidden="true" /></span>
                : playlist.thumbnailUrl
                  ? <img className="size-full object-cover" src={playlist.thumbnailUrl} alt="" draggable={false} />
                  : <ListMusic size={21} aria-hidden="true" />}
            </span>
            <span className="w-full truncate text-center text-[11px]">{name}</span>
          </button>
        })}
        {loading && playlists.length === 0 && <span className="size-11 shrink-0 animate-pulse rounded-[4px] bg-white/5" aria-label={t('library.loading')} />}
        {error && playlists.length === 0 && <button type="button" className="grid size-11 shrink-0 place-items-center rounded-[4px] border border-line text-muted" aria-label={t('common.retry')} onClick={reload}>
          <RotateCw size={20} aria-hidden="true" />
        </button>}
      </div>
    </nav>}
    <aside
      className={cn(
        panelStyles({ padding: 'none' }),
        'group/collections relative hidden min-h-0 flex-col items-center py-2 sm:flex sm:rounded-none sm:border-0 sm:bg-panel',
      )}
      id="room-collections-panel"
      data-expanded={rail.expanded}
      style={{ width: rail.width }}
      aria-label={t('collection.railTitle')}
    >
      <div className={cn('flex w-full shrink-0 items-center gap-1 px-2 pb-2', !rail.expanded && 'flex-col')}>
        <button type="button"
          className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
          aria-label={t(rail.expanded ? 'collection.collapse' : 'collection.expand')}
          title={t(rail.expanded ? 'collection.collapse' : 'collection.expand')}
          aria-expanded={rail.expanded} aria-controls="room-collections-panel" onClick={rail.toggle}>
          {rail.expanded ? <PanelLeftClose size={19} aria-hidden="true" /> : <PanelLeftOpen size={19} aria-hidden="true" />}
        </button>
        {rail.expanded && <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{t('collection.railTitle')}</h2>}
        {userId && <button type="button"
          className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
          aria-label={t('library.newPlaylist')} title={t('library.newPlaylist')} disabled={saving}
          onClick={() => setCreating(true)}>
          <Plus size={21} aria-hidden="true" />
        </button>}
      </div>
      <div className="flex min-h-0 w-full flex-1 flex-col gap-0 overflow-y-auto overscroll-contain px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {playlists.map((playlist) => {
          const name = playlist.kind === 'favorites' ? t('collection.favorites') : playlist.name
          return <button key={playlist.id} type="button"
            className={cn(
              'flex h-14 w-full shrink-0 items-center gap-3 rounded-md px-1 text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink',
              rail.expanded ? 'justify-start' : 'justify-center',
              selectedPlaylistId === playlist.id && 'bg-raised text-ink',
              dragStyles(playlist.id, false),
            )}
            aria-label={name + ' · ' + t('library.trackCount', { count: playlist.trackCount })}
            aria-pressed={selectedPlaylistId === playlist.id}
            title={name + ' · ' + t('library.trackCount', { count: playlist.trackCount }) + ' · ' + t('library.reorderHint')}
            onClick={() => onSelectPlaylist(playlist)}
            {...dragProps(playlist.id, false)}>
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[4px] bg-raised">
              {playlist.kind === 'favorites'
                ? <Heart size={21} aria-hidden="true" />
                : playlist.thumbnailUrl
                  ? <img className="size-full object-cover" src={playlist.thumbnailUrl} alt="" draggable={false} />
                  : <ListMusic size={21} aria-hidden="true" />}
            </span>
            {rail.expanded && <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px]">{name}</span>
              <span className="block text-xs text-dim">{t('library.trackCount', { count: playlist.trackCount })}</span>
            </span>}
          </button>
        })}
        {userId && loading && playlists.length === 0 && <span className="mx-auto size-12 shrink-0 animate-pulse rounded-[4px] bg-white/5" aria-label={t('library.loading')} />}
        {userId && error && playlists.length === 0 && <button type="button"
          className="mx-auto grid size-12 shrink-0 place-items-center rounded-md text-muted hover:text-ink"
          aria-label={t('common.retry')} title={t('common.retry')} onClick={reload}>
          <RotateCw size={20} aria-hidden="true" />
        </button>}
      </div>
      {(onToggleStats || chatTriggerRef) && <div className="mt-auto flex w-full shrink-0 flex-col gap-1 px-2 pt-2">
        {onToggleStats && <button type="button"
          className={cn(
            'flex h-10 w-full shrink-0 items-center gap-3 rounded-md text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
            rail.expanded ? 'justify-start px-3' : 'justify-center',
            statsOpen && 'bg-raised text-ink',
          )}
          aria-label={t('stats.open')} title={t('stats.open')} aria-pressed={statsOpen}
          onClick={onToggleStats}>
          <History size={21} aria-hidden="true" />
          {rail.expanded && <span className="truncate text-sm">{t('stats.open')}</span>}
        </button>}
        {chatTriggerRef && <div className="flex w-full justify-center" ref={chatTriggerRef} />}
      </div>}
      <div role="separator" tabIndex={0} aria-orientation="vertical"
        aria-label={t('collection.resize')} title={t('collection.resize')}
        aria-controls="room-collections-panel" aria-valuemin={72} aria-valuemax={rail.maxWidth} aria-valuenow={rail.width}
        className={cn(
          'absolute inset-y-0 -right-1 z-40 w-2 cursor-col-resize touch-none focus-visible:outline-2 focus-visible:outline-ink',
          'before:absolute before:inset-y-0 before:left-[3px] before:w-0.5 before:bg-transparent hover:before:bg-muted focus-visible:before:bg-muted',
          rail.resizing && 'before:bg-ink',
        )}
        {...rail.separatorProps} />
    </aside>
    {creating && userId && <CreatePlaylistDialog
      onClose={() => setCreating(false)}
      onCreated={(playlist) => {
        reload()
        onSelectPlaylist(playlist)
        setCreating(false)
      }}
    />}
  </>
}
