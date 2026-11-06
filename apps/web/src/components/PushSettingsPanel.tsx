'use client'

/**
 * Push notifications panel — subscribes this browser to web-push reminders
 * (delivered by the headless server when VAPID keys are configured). Calm
 * honest states: unsupported / not configured / enabled.
 */
import React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { isPushSubscribed, isPushSupported, subscribeToPush } from '@/platform/pwa'

export function PushSettingsPanel() {
  const vapid = useQuery<{ vapidPublicKey: string | null }>({
    queryKey: ['push-vapid'],
    queryFn: () => apiGet('/api/push'),
  })

  const [subscribed, setSubscribed] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    void isPushSubscribed().then(setSubscribed)
  }, [])

  const enable = useMutation({
    mutationFn: async () => {
      const publicKey = vapid.data?.vapidPublicKey
      if (!publicKey) throw new Error('Push is not configured on this installation yet')
      const sub = await subscribeToPush(publicKey)
      if (!sub) throw new Error('Permission denied or browser unsupported')
      const parsed = JSON.parse(sub) as { endpoint: string; keys: Record<string, string> }
      return apiSend('/api/push', 'POST', parsed)
    },
    onSuccess: () => setSubscribed(true),
  })

  const supported = isPushSupported()
  const configured = Boolean(vapid.data?.vapidPublicKey)

  return (
    <section className="panel space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="label flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Push reminders
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            {supported
              ? configured
                ? 'Receive review reminders even when the app is closed.'
                : 'This installation has no VAPID keys yet — set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY on the headless server to enable delivery.'
              : 'This browser does not support web-push.'}
          </p>
        </div>
        {supported && configured && (
          <button
            type="button"
            className="btn shrink-0"
            disabled={enable.isPending || subscribed === true}
            onClick={() => enable.mutate()}
          >
            {subscribed ? 'Push enabled ✓' : enable.isPending ? 'Enabling…' : 'Enable push'}
          </button>
        )}
      </div>
      {enable.isError && <p className="text-xs text-rose-500">{(enable.error as Error).message}</p>}
    </section>
  )
}
