import { useEffect, useId, useState } from 'react'
import { Download } from 'lucide-react'
import type { DesktopUpdateState } from '../desktopBridge'
import { useI18n } from '../i18n/i18n-context'
import { chromeIconButtonStyles, cn } from '../styles'

export function DesktopUpdateButton() {
  const { t } = useI18n()
  const id = useId()
  const [update, setUpdate] = useState<DesktopUpdateState | null>(null)
  const [opening, setOpening] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const bridge = window.bsideDesktop?.updates
    if (!bridge) return
    let active = true
    let receivedEvent = false
    const unsubscribe = bridge.onChange((state) => {
      receivedEvent = true
      if (active) setUpdate(state)
    })
    void bridge.getState().then((state) => {
      if (active && !receivedEvent) setUpdate(state)
    }).catch(() => { /* Older/offline desktop shells should not interrupt the page. */ })
    return () => { active = false; unsubscribe() }
  }, [])

  if (!update?.availableVersion) return null
  const label = t(failed ? 'desktop.updateOpenFailed' : 'desktop.updateAvailable', { version: update.availableVersion })
  async function openDownload() {
    if (opening) return
    setOpening(true)
    setFailed(false)
    try { setFailed(!await window.bsideDesktop?.updates?.openDownload()) }
    catch { setFailed(true) }
    finally { setOpening(false) }
  }
  return <div data-desktop-no-drag className="group relative shrink-0">
    <button type="button" className={cn(chromeIconButtonStyles, 'bg-signal/10 text-signal hover:bg-signal/20 hover:text-signal')}
      aria-label={label} aria-describedby={id} aria-busy={opening} disabled={opening}
      onClick={() => void openDownload()}>
      <Download size={20} strokeWidth={2} aria-hidden="true" />
    </button>
    <span id={id} role="tooltip"
      className="pointer-events-none absolute top-full right-0 z-[80] mt-2 w-max max-w-64 rounded-lg border border-line bg-raised px-3 py-2 text-xs font-medium whitespace-normal text-ink opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
      {label}
    </span>
  </div>
}
