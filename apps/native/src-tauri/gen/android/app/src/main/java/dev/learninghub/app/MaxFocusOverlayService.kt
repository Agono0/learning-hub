package dev.learninghub.app

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.TextView

/**
 * Max Focus Tier 2 backstops (M2-13), attached to the accessibility service:
 *
 * 1. **Full-screen overlay.** While the session is armed, a full-screen view
 *    floats above everything: primary window type is
 *    TYPE_ACCESSIBILITY_OVERLAY (the accessibility grant covers it — no extra
 *    permission); the documented SYSTEM_ALERT_WINDOW fallback
 *    (TYPE_APPLICATION_OVERLAY) is used when the accessibility overlay cannot
 *    be created and the user granted "draw over other apps". It shows the
 *    session banner so a window-transition race can never leave the user on a
 *    hidden distraction. Touches do nothing: it is a visual backstop, not a UI
 *    (the real lock UI is the app's own webview surface).
 * 2. **UsageStats backup detector.** Accessibility events can be missed (some
 *    OEM launchers, system dialogs). A 2-second UsageStatsManager poll
 *    re-checks the ACTUAL foreground package through a different OS channel
 *    and re-triggers return-to-focus when needed. PACKAGE_USAGE_STATS is a
 *    special appop granted via settings (the disclosure covers it); when not
 *    granted, the poll degrades to a no-op and the a11y events still work.
 *
 * Privacy: package names only, same law as the watcher (M2-12) — no content.
 * The overlay and poll run ONLY while a session is armed (prefs `active`).
 */
object MaxFocusOverlay {

    private const val TAG = "MaxFocusOverlay"
    private const val POLL_INTERVAL_MS = 2_000L

    private var overlayView: View? = null
    private var pollHandler: Handler? = null
    private var pollRunnable: Runnable? = null

    /** Show the overlay + start the backup poll (idempotent). */
    fun show(service: AccessibilityService, appName: String) {
        if (overlayView != null) return
        val wm = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val view = buildOverlayView(service, appName)
        val type = overlayType(service)
        if (type == null) {
            // No overlay channel available (no accessibility overlay + no
            // draw-over grant): events + poll still work without the visual.
            Log.w(TAG, "no overlay channel available — continuing without visual backstop")
        } else {
            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT,
            )
            params.gravity = Gravity.CENTER
            try {
                wm.addView(view, params)
                overlayView = view
            } catch (e: Exception) {
                Log.w(TAG, "overlay add failed: ${e.message}")
            }
        }
        startUsageStatsPoll(service)
    }

    /** Remove the overlay + stop the poll (session end / disarm). Idempotent. */
    fun dismiss(service: AccessibilityService) {
        overlayView?.let { view ->
            val wm = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            try {
                wm.removeView(view)
            } catch (_: Exception) {
                // already detached
            }
        }
        overlayView = null
        pollRunnable?.let { runnable -> pollHandler?.removeCallbacks(runnable) }
        pollRunnable = null
        pollHandler = null
    }

    /**
     * Overlay window type: accessibility overlays need NO extra permission;
     * TYPE_APPLICATION_OVERLAY (SYSTEM_ALERT_WINDOW) is the fallback when the
     * user granted "draw over other apps". Null = no channel, degrade quietly.
     */
    private fun overlayType(service: AccessibilityService): Int? {
        return when {
            // The service itself renders the overlay: the accessibility grant covers it.
            MaxFocusAccessibilityService.isRunning ->
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
            Settings.canDrawOverlays(service) ->
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else -> null
        }
    }

    /** The minimal overlay content: session banner on an opaque background. */
    @SuppressLint("InflateParams")
    private fun buildOverlayView(service: AccessibilityService, appName: String): View {
        val inflater = LayoutInflater.from(service)
        val view = inflater.inflate(R.layout.max_focus_overlay, null)
        view.setBackgroundColor(Color.argb(245, 12, 12, 16))
        view.findViewById<TextView>(R.id.overlay_title).text = appName
        view.findViewById<TextView>(R.id.overlay_message).text =
            service.getString(R.string.max_focus_overlay_message)
        // Touches do nothing: the overlay is a visual backstop, not a UI.
        view.isClickable = true
        return view
    }

    /** 2-second UsageStats backup poll — a different OS channel than a11y. */
    private fun startUsageStatsPoll(service: AccessibilityService) {
        val handler = Handler(Looper.getMainLooper())
        val runnable = object : Runnable {
            override fun run() {
                if (isSessionArmed(service)) {
                    val foreground = latestForegroundPackage(service)
                    if (foreground != null && foreground != service.packageName && !isAllowed(service, foreground)) {
                        val launch = service.packageManager.getLaunchIntentForPackage(service.packageName)
                        launch?.addFlags(
                            Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
                        )
                        if (launch != null) {
                            service.startActivity(launch)
                            Log.i(TAG, "usage-stats poll returned focus from $foreground")
                        }
                    }
                    handler.postDelayed(this, POLL_INTERVAL_MS)
                }
                // Disarmed: the loop stops; show()/dismiss() re-arm it.
            }
        }
        pollHandler = handler
        pollRunnable = runnable
        handler.postDelayed(runnable, POLL_INTERVAL_MS)
    }

    private fun isSessionArmed(service: AccessibilityService): Boolean =
        service
            .getSharedPreferences(MaxFocusAccessibilityService.PREFS, Context.MODE_PRIVATE)
            .getBoolean(MaxFocusAccessibilityService.KEY_ACTIVE, false)

    private fun isAllowed(service: AccessibilityService, pkg: String): Boolean {
        val prefs = service.getSharedPreferences(MaxFocusAccessibilityService.PREFS, Context.MODE_PRIVATE)
        return prefs.getStringSet(MaxFocusAccessibilityService.KEY_PACKAGES, emptySet())?.contains(pkg) == true
    }

    /** Most recent foreground package from UsageStats (null when unavailable). */
    private fun latestForegroundPackage(service: AccessibilityService): String? {
        return try {
            val usm = service.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val now = System.currentTimeMillis()
            val events = usm.queryEvents(now - POLL_INTERVAL_MS * 4, now)
            var last: String? = null
            val event = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(event)
                if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                    last = event.packageName
                }
            }
            last
        } catch (_: SecurityException) {
            null // PACKAGE_USAGE_STATS appop not granted — a11y events still cover us
        } catch (_: Exception) {
            null
        }
    }
}
