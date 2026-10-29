import { useEffect, useId, useRef } from 'react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles } from '../../../shared/styles'

export function ReturnHomeDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  const { t } = useI18n()
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      const restoreFocus = dialog.contains(document.activeElement)
      dialog.close()
      if (restoreFocus) trigger?.focus()
    }
  }, [])
  return <dialog ref={dialogRef} aria-labelledby={titleId} data-desktop-no-drag
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    className="fixed inset-0 m-auto w-[min(360px,calc(100vw-32px))] rounded-lg border border-line bg-raised p-6 text-ink shadow-[0_24px_80px_rgba(0,0,0,.4)] backdrop:bg-black/65">
    <h2 id={titleId} className="m-0 text-base font-medium">{t('room.returnHomeConfirm')}</h2>
    <div className="mt-6 flex justify-end gap-2">
      <button type="button" autoFocus onClick={onClose} className={buttonStyles({ intent: 'outline', size: 'md' })}>{t('common.cancel')}</button>
      <button type="button" onClick={onConfirm} className={buttonStyles({ intent: 'primary', size: 'md' })}>{t('common.home')}</button>
    </div>
  </dialog>
}
