import type { ReactNode } from 'react'
import { Disc3, Play as PlayIcon, Plus, Shuffle } from 'lucide-react'
import type { Song } from '../types'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../../shared/styles'

export const NowPlaying = ({
  song,
  player,
  onClaimPlaybackHost,
  claimingPlaybackHost = false,
  onRequestSong,
}: {
  song: Song | null
  player?: ReactNode
  onClaimPlaybackHost?: () => void
  claimingPlaybackHost?: boolean
  onRequestSong?: () => void
}) => {
  const { t } = useI18n()
  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col items-start">
      {song ? (
        <div className="flex w-full flex-col items-center gap-6">
          <div className="flex w-full max-w-[min(960px,calc(max(180px,100dvh-360px)*16/9))] min-w-0 items-center justify-center">
            {player ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-[4px] bg-black">
                {player}
              </div>
            ) : (
              <img
                className="aspect-video w-full rounded-[4px] bg-black object-contain"
                src={song.thumbnailUrl}
                alt=""
              />
            )}
          </div>
          <div className="flex w-full min-w-0 flex-col items-center gap-4">
            <div className="w-full min-w-0 text-center">
              <h2 className="m-0 line-clamp-2 break-words text-xl font-semibold leading-snug tracking-[-0.025em] text-ink md:text-[28px]" title={song.title}>
                {song.title}
              </h2>
              <p className="m-0 mt-2 truncate text-sm text-muted md:text-base" title={song.artist}>
                {song.artist}
              </p>
            </div>
            <div className="flex max-w-full min-w-0 items-center gap-2 text-sm text-muted">
              <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full bg-raised text-xs font-medium text-ink">
                {song.isAutoplay ? <Shuffle size={14} aria-hidden="true" /> : song.addedByAvatarUrl ? (
                  <img className="size-full object-cover" src={song.addedByAvatarUrl} alt="" />
                ) : (
                  song.addedBy.trim().slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="truncate" title={song.isAutoplay ? t('queue.autoplay') : t('song.requestedBy', { nickname: song.addedBy })}>
                {song.isAutoplay ? t('queue.autoplay') : t('song.requestedBy', { nickname: song.addedBy })}
              </span>
            </div>
            {!player && onClaimPlaybackHost && (
              <button
                className={cn(
                  buttonStyles({ intent: 'primary', size: 'md' }),
                  'mt-1 w-full justify-center sm:w-fit',
                )}
                disabled={claimingPlaybackHost}
                type="button"
                onClick={onClaimPlaybackHost}
              >
                <PlayIcon size={17} />
                {claimingPlaybackHost
                  ? t('host.claimingPlayback')
                  : t('host.claimPlayback')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[280px] w-full flex-1 items-center px-2 py-10 md:min-h-[360px] md:px-6">
          <div className="flex max-w-[460px] flex-col items-start">
            <Disc3 className="mb-8 text-muted" size={40} strokeWidth={1} aria-hidden="true" />
            <h2 className="mb-3 text-2xl font-medium tracking-[-0.035em] text-ink md:text-[32px]">
              {t('nowPlaying.empty')}
            </h2>
            <p className="m-0 text-sm leading-6 text-muted">
              {t('nowPlaying.emptyDescription')}
            </p>
            {onRequestSong && (
              <button
                className={cn(
                  buttonStyles({ intent: 'primary', size: 'md' }),
                  'mt-7 gap-2',
                )}
                type="button"
                aria-haspopup="dialog"
                onClick={onRequestSong}
              >
                <Plus size={18} aria-hidden="true" />{t('search.requestFirstSong')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
