'use client'

/**
 * /notifications — Notification Center.
 *
 * One screen for the user-managed delivery policy: which channels may reach
 * the OS, quiet hours, Do-Not-Disturb, the daily cap, and an honest history
 * of everything that was delivered or held. Pairs with /permissions, which
 * explains the OS-level capabilities underneath.
 */
import { BellRing } from 'lucide-react'
import { NotificationCenter } from '@/components/NotificationCenter'
import { PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'

export default function NotificationsPage() {
  return (
    <ClayIn as="div" className="space-y-5 pb-8">
      <PageHeader
        title="Notification Center"
        subtitle="You decide what may reach you, when, and how much. Everything that was delivered — or held back — is listed honestly."
        icon={<BellRing className="h-5 w-5" />}
      />
      <NotificationCenter />
    </ClayIn>
  )
}
