import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Right-aligned actions (buttons, filters) */
  children?: ReactNode
}

/** Shared page header: title + subtitle + optional action area. Responsive stack on mobile. */
export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-950 sm:text-[1.75rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  )
}
