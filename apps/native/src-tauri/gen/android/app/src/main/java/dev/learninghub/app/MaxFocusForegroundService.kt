package dev.learninghub.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.SystemClock

/**
 * Max Focus foreground service (M2-14): keeps a persistent "session running"
 * notification alive for the duration of a Max Focus session and anchors the
 * session to [SystemClock.elapsedRealtime] (monotonic, sleep-inclusive — the
 * same clock contract as the core session machine's monoAnchor, M2-01/M2-20,
 * so wall-clock manipulation can never move the anchor).
 *
 * anti-uninstall (M2-14, owner only): `DevicePolicyManager.setUninstallBlocked`
 * — called via the plugin command; the receiver also answers disable requests
 * with a warning (MaxDeviceAdminReceiver.onDisableRequested). The guarantee
 * that the policy is ALWAYS restored on session end lives in the web layer's
 * session lifecycle (it calls the stop command in a finally-equivalent path)
 * plus the drop-guard principle: release always clears, and M2-24's resume
 * path reconciles on boot.
 *
 * Android 14+ (targetSdk 37) requires the `specialUse` foreground-service type
 * with a subtype property — declared in AndroidManifest.xml.
 */
class MaxFocusForegroundService : Service() {

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                getString(R.string.max_focus_notification_channel),
                NotificationManager.IMPORTANCE_LOW,
            ),
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Monotonic anchor: elapsedRealtime (sleep-inclusive) — matches the
        // core machine's monoAnchor contract, immune to wall-clock tampering.
        getSharedPreferences(MaxFocusAccessibilityService.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_START_ELAPSED_REALTIME, SystemClock.elapsedRealtime())
            .apply()
        startForeground(NOTIFICATION_ID, buildNotification())
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle(getString(R.string.max_focus_notification_title))
            .setContentText(getString(R.string.max_focus_notification_body))
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val CHANNEL_ID = "max_focus_session"
        const val NOTIFICATION_ID = 4711
        /** Monotonic anchor of the running session (elapsedRealtime ms). */
        const val KEY_START_ELAPSED_REALTIME = "startElapsedRealtimeMs"

        /** Elapsed ms since the running session's monotonic anchor (0 when none). */
        fun elapsedSinceAnchor(context: Context): Long {
            val prefs = context.getSharedPreferences(MaxFocusAccessibilityService.PREFS, Context.MODE_PRIVATE)
            val anchor = prefs.getLong(KEY_START_ELAPSED_REALTIME, -1L)
            return if (anchor < 0) 0 else SystemClock.elapsedRealtime() - anchor
        }
    }
}
