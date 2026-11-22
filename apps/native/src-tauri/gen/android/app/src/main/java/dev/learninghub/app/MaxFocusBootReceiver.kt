package dev.learninghub.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Max Focus boot resume (M2-14): on BOOT_COMPLETED, when a Max Focus session
 * was active at power-off (the plugin sets KEY_RESUME_EXPECTED on session
 * start and clears it on end), relaunch the app — Device Owner apps are
 * exempt from the background-activity-start restriction, so this works from
 * the receiver; the APP's own resume logic (web session state, M2-24) then
 * re-applies the lock, re-issues Lock Task (M2-11) and re-arms the watcher.
 *
 * Thin by design: this receiver owns NO policy — it only surfaces the app.
 * The service/notification/watch state are all re-established through the
 * normal session flow.
 */
class MaxFocusBootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val prefs = context.getSharedPreferences(MaxFocusAccessibilityService.PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_RESUME_EXPECTED, false)) return

        Log.i(TAG, "boot with an expected Max Focus session — relaunching app")
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(launch)
        }
    }

    companion object {
        private const val TAG = "MaxFocusBoot"
        /** Set true by the plugin on Max Focus session start; false on end. */
        const val KEY_RESUME_EXPECTED = "resumeExpectedAfterReboot"
    }
}
