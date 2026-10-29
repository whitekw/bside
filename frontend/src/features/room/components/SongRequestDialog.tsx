import { useEffect, useId, useRef } from 'react'
import { Search } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { PanelHeader } from '../../../shared/ui/PanelHeader'
import { SearchPanel } from './SearchPanel'

export function SongRequestDialog({ code, participantToken, open, onClose, onAddSong, queuedVideoIds, currentVideoId, message, error }: {
  code: string
  participantToken: string
  open: boolean
  onClose: () => void
  onAddSong: (videoId: string) => Promise<void>
  queuedVideoIds: ReadonlySet<string>
  currentVideoId: string | null
  message: string
  error: string
}) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.show()
    dialog.querySelector('input')?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing ||
        document.querySelector('dialog:modal')) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      const restoreFocus = dialog.contains(document.activeElement)
      dialog.close()
      if (restoreFocus) trigger?.focus()
    }
  }, [open, onClose])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (open) onClose() }}
      className="absolute inset-0 z-20 m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-canvas p-0 text-ink"
    >
      <div className="flex h-full min-h-0 flex-col">
        <PanelHeader titleId={titleId} title={t('search.requestSong')} subtitle={t('search.subtitle')}
          icon={<Search size={20} aria-hidden="true" />} closeLabel={t('common.close')}
          onClose={onClose} />
        <div className="flex min-h-0 flex-1 flex-col px-4 py-5 sm:px-6">
          <SearchPanel code={code} participantToken={participantToken} className="min-h-0 flex-1" onAddSong={onAddSong}
            queuedVideoIds={queuedVideoIds} currentVideoId={currentVideoId} />
          {error && <p className="mt-3 shrink-0 text-sm text-danger" role="alert">{error}</p>}
          {message && !error && <p className="mt-3 shrink-0 text-sm text-signal" role="status">{message}</p>}
        </div>
      </div>
    </dialog>
  )
}
