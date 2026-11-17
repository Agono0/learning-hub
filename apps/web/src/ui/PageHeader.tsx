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
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          {icon}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-tertiary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
