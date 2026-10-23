import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/i18n-context'
import { cn } from '../styles'

export function Brand({
  compact = false,
  compactOnMobile = false,
  className,
}: {
  compact?: boolean
  compactOnMobile?: boolean
  className?: string
}) {
  const { t } = useI18n()

  return (
    <Link
      className={cn(
        'inline-flex items-center gap-2.5 text-lg font-semibold tracking-[-0.055em] text-ink',
        compactOnMobile && 'gap-0 md:gap-3',
        className,
      )}
      to="/"
      aria-label={`B-SIDE · ${t('common.home')}`}
    >
      <svg
        className="size-7 shrink-0 text-ink"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="1" fill="currentColor" />
        <path d="M7 12a10 10 0 0 1 5-5M20 25a10 10 0 0 0 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span
        className={cn(
          compact && 'sr-only',
          compactOnMobile && 'sr-only md:not-sr-only',
        )}
      >
        B-SIDE
      </span>
    </Link>
  )
}
