import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useRoomPanelNavigation } from '../hooks/useRoomPanelNavigation'
import { ReturnHomeDialog } from './ReturnHomeDialog'
import { useAppNavigation } from '../../../shared/useAppNavigation'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { chromeIconButtonStyles, cn } from '../../../shared/styles'

export function RoomHeader({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n()
  const navigation = useAppNavigation()
  const navigate = useNavigate()
  const { panel, closePanel, hasPreviousPanel } = useRoomPanelNavigation()
  const [confirmHome, setConfirmHome] = useState(false)
  function goBack() {
    if (hasPreviousPanel) navigation.back()
    else if (panel) closePanel()
    else setConfirmHome(true)
  }
  const headerRef = useRef<HTMLElement>(null)
  const navigationRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const [titleWidth, setTitleWidth] = useState(0)
  useLayoutEffect(() => {
    const room = headerRef.current?.parentElement
    const measure = () => {
      const header = headerRef.current?.getBoundingClientRect()
      const left = navigationRef.current?.getBoundingClientRect()
      const right = actionsRef.current?.getBoundingClientRect()
      if (!header || !left || !right) return
      room?.style.setProperty('--room-header-bottom', `${header.bottom}px`)
      const center = header.left + header.width / 2
      setTitleWidth(Math.max(0, Math.floor(2 * Math.min(center - left.right - 12, right.left - center - 12))))
    }
    const observer = new ResizeObserver(measure)
    for (const element of [headerRef.current, navigationRef.current, actionsRef.current]) {
      if (element) observer.observe(element)
    }
    measure()
    return () => {
      observer.disconnect()
      room?.style.removeProperty('--room-header-bottom')
    }
  }, [])

  return <><header ref={headerRef} data-desktop-titlebar
    className="relative z-[60] flex min-h-14 w-full shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-1.5">
    <div ref={navigationRef} data-desktop-no-drag className="flex shrink-0 items-center gap-1">
      <button type="button" className={chromeIconButtonStyles} onClick={goBack}
        aria-label={t(navigation.canGoBack ? 'navigation.back' : 'common.home')}
        title={t(navigation.canGoBack ? 'navigation.back' : 'common.home')}>
        <ArrowLeft size={22} aria-hidden="true" />
      </button>
      <button type="button" className={cn(chromeIconButtonStyles, 'disabled:opacity-30')}
        onClick={navigation.forward} disabled={!navigation.canGoForward}
        aria-label={t('navigation.forward')} title={t('navigation.forward')}>
        <ArrowRight size={22} aria-hidden="true" />
      </button>
    </div>
    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-baseline justify-center gap-2.5"
      style={{ width: titleWidth }}>
      <h1 className="min-w-0 truncate text-sm font-medium text-ink" title={title}>{title}</h1>
    </div>
    <div ref={actionsRef} data-desktop-no-drag className="ml-auto flex shrink-0 items-center gap-2">{children}</div>
  </header>
    {confirmHome && <ReturnHomeDialog onClose={() => setConfirmHome(false)} onConfirm={() => {
      setConfirmHome(false)
      void navigate('/')
    }} />}
  </>
}
