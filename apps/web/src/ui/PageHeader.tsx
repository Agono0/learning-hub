import React, { type ReactNode } from 'react'

export interface PageHeaderProps {
  title: ReactNode
  /** One calm sentence on what this page is for. */
  subtitle?: ReactNode
  /** Page-level actions; they wrap below the title on phones. */
  actions?: ReactNode
  /** Leading icon next to the title. */
  icon?: ReactNode
}

/** Consistent page title row — every page starts with one. */
export function PageHeader({ title, subtitle, actions, icon }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-1">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-strong sm:text-3xl">
          {icon}
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-prose text-sm text-secondary">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  )
}
