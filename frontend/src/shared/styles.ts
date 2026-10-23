import { twMerge } from 'tailwind-merge'
import { tv } from 'tailwind-variants'

type ClassValue = string | false | null | undefined

export function cn(...classes: ClassValue[]) {
  return twMerge(...classes.filter((value): value is string => Boolean(value)))
}

export const buttonStyles = tv({
  base: [
    'inline-flex items-center justify-center gap-2 rounded-full font-medium',
    'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-45',
  ],
  variants: {
    intent: {
      primary:
        'bg-ink text-canvas hover:bg-white focus-visible:outline-ink',
      secondary:
        'bg-raised text-ink hover:bg-white/15 focus-visible:outline-ink',
      outline:
        'border border-line bg-transparent text-ink hover:border-muted hover:bg-white/5 focus-visible:outline-ink',
      accent:
        'bg-ink text-canvas hover:bg-white focus-visible:outline-ink',
      player:
        'bg-ink text-canvas hover:bg-white focus-visible:outline-ink',
    },
    size: {
      sm: 'min-h-9 px-3 text-xs',
      md: 'min-h-11 px-3.5 text-sm',
      lg: 'min-h-12 px-[18px]',
    },
    spread: {
      true: 'justify-between',
    },
    fullWidth: {
      true: 'w-full',
    },
  },
  defaultVariants: {
    intent: 'outline',
    size: 'md',
  },
})

export const panelCloseButtonStyles =
  'grid size-9 shrink-0 place-items-center rounded-lg border-0 bg-transparent p-0 text-ink/75 transition-colors hover:bg-white/[0.07] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft'

export const chromeIconButtonStyles =
  'inline-flex size-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border-0 bg-transparent p-0 text-ink/75 transition-colors hover:bg-white/[0.07] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft disabled:cursor-not-allowed disabled:opacity-45'

export const formControlStyles = tv({
  base: [
    'w-full rounded-md border border-line bg-canvas text-ink outline-none',
    'transition-colors placeholder:text-dim',
    'focus:border-accent/75 focus:bg-accent/[0.065]',
    'disabled:cursor-not-allowed disabled:opacity-45',
  ],
  variants: {
    size: {
      default: 'h-11 px-3.5 text-sm',
      large: 'h-[50px] px-3.5',
      code: 'h-[68px] px-[18px] text-3xl font-[850] tracking-[0.24em] uppercase',
    },
    weight: {
      normal: '',
      bold: 'font-bold',
    },
  },
  defaultVariants: {
    size: 'default',
    weight: 'normal',
  },
})

export const panelStyles = tv({
  base: 'min-w-0 rounded-lg border',
  variants: {
    tone: {
      default: 'border-transparent bg-surface',
      soft: 'border-transparent bg-panel',
      accent:
        'border-transparent bg-surface',
    },
    padding: {
      none: '',
      responsive: 'p-4 md:p-[22px]',
      roomy: 'p-4 md:p-6',
    },
  },
  defaultVariants: {
    tone: 'default',
    padding: 'responsive',
  },
})

export const cardIconStyles = tv({
  base: 'mb-6 grid size-12 place-items-center rounded-[13px] border',
  variants: {
    tone: {
      accent: 'border-accent/35 bg-accent/[0.09] text-ink',
      signal: 'border-signal/25 bg-signal/[0.06] text-signal',
    },
  },
  defaultVariants: {
    tone: 'accent',
  },
})

export const connectionDotStyles = tv({
  base: 'size-[7px] shrink-0 rounded-full',
  variants: {
    connected: {
      false: 'bg-dim',
      true:
        'bg-signal',
    },
  },
  defaultVariants: {
    connected: false,
  },
})

export const noticeStyles = tv({
  base: [
    'fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-30px)] -translate-x-1/2',
    'rounded-[9px] border px-4 py-[11px] text-[13px] shadow-[0_14px_45px_rgba(0,0,0,.35)]',
  ],
  variants: {
    tone: {
      error: 'border-danger/35 bg-[#391119]/95 text-[#ffc0ca]',
      success: 'border-line bg-raised text-ink',
    },
  },
  defaultVariants: {
    tone: 'success',
  },
})

export const sectionKickerStyles =
  'text-xs font-medium text-muted'

export const pageMessageStyles =
  'flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas p-6 text-center'

export const vinylStyles = [
  'grid size-[88px] place-items-center rounded-full border border-line text-muted bg-surface',
].join(' ')
