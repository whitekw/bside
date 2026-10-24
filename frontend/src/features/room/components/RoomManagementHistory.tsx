import { useEffect, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles } from '../../../shared/styles'
import { roomApi } from '../api'
import { managementHistoryDetails } from '../managementHistory'
import type { RoomManagementEntry } from '../types'

export function RoomManagementHistory({ code }: { code: string }) {
  const { t, locale } = useI18n()
  const [items, setItems] = useState<RoomManagementEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const loadingMore = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    const current = ++generation.current
    loadingMore.current = false
    setItems([])
    setNextCursor(null)
    setLoading(true)
    setError('')
    void roomApi.getManagementHistory(code, undefined, controller.signal).then((page) => {
      if (current !== generation.current) return
      setItems(page.items)
      setNextCursor(page.nextCursor)
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted && current === generation.current) setError(getErrorMessage(cause, t))
    }).finally(() => {
      if (!controller.signal.aborted && current === generation.current) setLoading(false)
    })
    return () => { controller.abort(); generation.current += 1 }
  }, [code, revision, t])

  async function loadMore() {
    if (!nextCursor || loadingMore.current || loading) return
    loadingMore.current = true
    const current = generation.current
    setLoading(true)
    setError('')
    try {
      const page = await roomApi.getManagementHistory(code, nextCursor)
      if (current !== generation.current) return
      setItems((previous) => [...previous, ...page.items.filter((item) => !previous.some((saved) => saved.id === item.id))])
      setNextCursor(page.nextCursor)
    } catch (cause) {
      if (current === generation.current) setError(getErrorMessage(cause, t))
    } finally {
      if (current === generation.current) { setLoading(false); loadingMore.current = false }
    }
  }

  const dateFormat = new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  return <div aria-busy={loading}>
    <div className="mb-4 flex justify-end">
      <button type="button" className={`${buttonStyles({ intent: 'outline', size: 'sm' })} shrink-0`}
        disabled={loading} onClick={() => setRevision((value) => value + 1)}>
        <RotateCw size={14} aria-hidden="true" />{t('roomManagement.refresh')}
      </button>
    </div>
    {error && <div className="mb-4 flex flex-wrap items-center gap-3" role="alert">
      <p className="text-sm text-danger">{error}</p>
      <button type="button" className={buttonStyles({ intent: 'outline', size: 'sm' })} disabled={loading}
        onClick={() => { if (items.length && nextCursor) void loadMore(); else setRevision((value) => value + 1) }}>{t('common.retry')}</button>
    </div>}
    {!loading && !error && !items.length && <p className="py-8 text-center text-sm text-muted">{t('roomManagement.empty')}</p>}
    <ol className="divide-y divide-line">
      {items.map((entry) => <li key={entry.id} className="py-4 first:pt-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 break-words text-sm font-semibold">{entry.actorName ?? t(entry.actorRole === 'host'
            ? 'roomManagement.hostDevice' : 'roomManagement.deletedUser')}
            <span className="ml-2 text-xs font-normal text-muted">{t(`roomManagement.role.${entry.actorRole}`)}</span>
          </p>
          <time dateTime={new Date(entry.createdAt).toISOString()} className="text-xs tabular-nums text-muted">{dateFormat.format(entry.createdAt)}</time>
        </div>
        <p className="mt-2 text-sm font-medium">{t(`roomManagement.action.${entry.action}`)}</p>
        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted">
          {managementHistoryDetails(entry, t).map((detail, index) => <li key={index} className="break-words">
            {detail.text}{detail.videoId && <> · <a className="text-ink underline-offset-2 hover:underline"
              href={`https://www.youtube.com/watch?v=${encodeURIComponent(detail.videoId)}`} target="_blank" rel="noreferrer">
              {detail.title}</a>{detail.artist && <span> · {detail.artist}</span>}</>}
          </li>)}
        </ul>
      </li>)}
    </ol>
    {loading && <p className="py-4 text-center text-sm text-muted" role="status">{t('roomManagement.loading')}</p>}
    {nextCursor && <button type="button" disabled={loading} className={buttonStyles({ intent: 'outline', size: 'md' })}
      onClick={() => void loadMore()}>{t('roomSettings.loadMore')}</button>}
  </div>
}
