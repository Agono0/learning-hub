package dev.learninghub.app

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import app.tauri.Logger

/**
 * MaxFocusAccessibilityService — Tier 2 return-to-focus watcher (M2-12).
 *
 * For devices WITHOUT Device Owner (Tier 1 = Lock Task, M2-11), this service
 * is the fallback that keeps a Max Focus session in front: on every window
 * transition it checks the foreground package and, when the session is active
 * and the package is not allowlisted, brings Learning HUB straight back.
 *
 * PRIVACY LAW (mirrored verbatim in the disclosure screen,
 * `MaxFocusDisclosures.tsx`, and Google's Tier-2 policy):
 * - Reads ONLY window-transition events (`TYPE_WINDOW_STATE_CHANGED`) — the
 *   service config sets `canRetrieveWindowContent="false"`, so screen CONTENT
 *   is structurally unavailable, not merely unused.
 * - The active flag + allowlist are set per-session by the web layer through
 *   `MaxFocusAndroidPlugin.setWatchState` (SharedPreferences, cleared on
 *   session end). No session active → this service is inert, even when
 *   enabled in system settings.
 * - Nothing is recorded, transmitted, or logged beyond the package name of
 *   the event that triggered a return-to-focus (log only).
 */
class MaxFocusAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        runningInstance = this
        Logger.info(TAG, "accessibility watcher connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ACTIVE, false)) return

        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName) return
        val allowed = prefs.getStringSet(KEY_PACKAGES, emptySet()) ?: emptySet()
        if (pkg in allowed) return

        // Bring the session back in front (Tier 2's "return-to-focus").
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            startActivity(launch)
            Logger.info(TAG, "returned focus from $pkg")
        }
    }

    override fun onInterrupt() {
        // No speech/haptics feedback is configured — nothing to interrupt.
    }

    override fun onDestroy() {
        runningInstance = null
        super.onDestroy()
    }

    companion object {
        private const val TAG = "MaxFocusA11y"
        const val PREFS = "max_focus_watch"
        const val KEY_ACTIVE = "sessionActive"
        const val KEY_PACKAGES = "allowedPackages"

        /** Live instance (null when disabled in system settings) — status only. */
        @Volatile
        var runningInstance: MaxFocusAccessibilityService? = null
            private set

        /** True when the watcher service is connected and can act. */
        val isRunning: Boolean
            get() = runningInstance != null
    }
}
