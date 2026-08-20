import type { ReactNode } from 'react'

type BadgeTone = 'green' | 'red' | 'amber' | 'blue' | 'slate'

interface StatusBadgeProps {
  tone?: BadgeTone
  children: ReactNode
}

const tones: Record<BadgeTone, string> = {
  green: 'border border-green-200 bg-green-50 text-green-700',
  red: 'border border-red-200 bg-red-50 text-red-700',
  amber: 'border border-amber-200 bg-amber-50 text-amber-700',
  blue: 'border border-primary-200 bg-primary-50 text-primary-700',
  slate: 'border border-slate-200 bg-slate-100 text-slate-600',
}

/** Shared status pill used across tables and detail views. */
export function StatusBadge({ tone = 'slate', children }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.04em] ${tones[tone]}`}>
      {children}
    </span>
  )
}
