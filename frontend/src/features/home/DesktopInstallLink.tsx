import { useState, type MouseEvent } from 'react'
import { Download } from 'lucide-react'
import { useI18n } from '../../shared/i18n/i18n-context'
import { getLatestDesktopInstallerUrl, latestDesktopReleaseUrl } from './api'

export function DesktopInstallLink() {
  const { t } = useI18n()
  const [resolving, setResolving] = useState(false)

  if ('bsideDesktop' in window || !/Windows NT/i.test(navigator.userAgent)) return null

  async function installLatest(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (resolving) return
    setResolving(true)
    try {
      window.location.assign(await getLatestDesktopInstallerUrl())
    } catch {
      window.location.assign(latestDesktopReleaseUrl)
    } finally {
      setResolving(false)
    }
  }

  return (
    <a
      className="hidden min-h-9 items-center gap-1.5 rounded-sm px-2 text-xs whitespace-nowrap text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent-soft md:inline-flex"
      href={latestDesktopReleaseUrl}
      aria-label={t('home.installWindowsApp')}
      aria-busy={resolving}
      onClick={(event) => void installLatest(event)}
    >
      <Download size={14} aria-hidden="true" />{t('home.installWindowsApp')}
    </a>
  )
}
