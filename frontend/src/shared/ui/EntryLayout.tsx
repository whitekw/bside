import type { ReactNode } from 'react'
import { Brand } from './Brand'
import { cn } from '../styles'

export function EntryLayout({ children, className, headerActions }: { children: ReactNode; className?: string; headerActions?: ReactNode }) {
  return (
    <main className={cn('desktop-entry desktop-entry-shell min-h-screen bg-canvas px-5 py-5 md:px-10 md:py-7', className)}>
      <nav data-desktop-titlebar className="relative z-[60] mx-auto flex w-full max-w-[1120px] shrink-0 items-center justify-between gap-4">
        <Brand />
        {headerActions}
      </nav>
      <div className="desktop-entry-scroll contents">
        <div className="desktop-entry-content contents">{children}</div>
      </div>
    </main>
  )
}
