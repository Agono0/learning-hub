'use client'

/**
 * /permissions — Permission Center.
 *
 * The single screen where a user sees every capability Learning HUB can ask
 * the OS for, what each unlocks, what breaks without it, and how to grant it
 * (prompted when possible, guided into OS settings when not). Reaches the
 * review features it protects only through the user's explicit choice —
 * autonomy-preserving permission onboarding (Deci & Ryan 1985).
 */
import { ShieldCheck } from 'lucide-react'
import { PermissionCenter } from '@/components/PermissionCenter'
import { PageHeader } from '@/ui'
import { ClayIn } from '@/lib/motion'

export default function PermissionsPage() {
  return (
    <ClayIn as="div" className="space-y-5 pb-8">
      <PageHeader
        title="Permissions"
        subtitle="What Learning HUB may ask of this device, why, and what keeps working if you say no."
        icon={<ShieldCheck className="h-5 w-5" />}
      />
      <PermissionCenter />
    </ClayIn>
  )
}
