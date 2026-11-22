package dev.learninghub.app

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * MaxFocusAndroidPlugin — Device Owner status (M2-10) + Tier 2 watcher state
 * (M2-12) for Max Focus on Android.
 *
 * The webview's setup wizard needs to know whether the device already has
 * Learning HUB provisioned as Device Owner (the only tier that permits
 * Lock Task Mode, M2-11, and silent install sessions — see
 * docs/LIMITATIONS.md §"Android: no silent installs without Device Owner").
 *
 * Provisioning itself CANNOT be done from the app: `dpm set-device-owner`
 * must run over ADB on a device with no accounts — the wizard shows the exact
 * command (`DEVICE_OWNER_ADB_COMMAND` in apps/web/src/platform/device-owner.ts)
 * for the user to copy; this plugin reports the status before/after.
 *
 * Tier 2 (M2-12): `setWatchState` arms/disarms the AccessibilityService
 * watcher per session (active flag + allowlisted packages), and
 * `openAccessibilitySettings` deep-links the user to the system screen where
 * they grant the accessibility permission — the DISCLOSURE screen
 * (MaxFocusDisclosures.tsx) is shown BEFORE that jump, store-policy compliant.
 */
@TauriPlugin
class MaxFocusAndroidPlugin(private val activity: Activity) : Plugin(activity) {

    @InvokeArg
    class EnableArgs {
        var enabled: Boolean = false
    }

    @InvokeArg
    class WatchStateArgs {
        var active: Boolean = false
        var packages: MutableList<String> = mutableListOf()
    }

    @Command
    fun deviceOwnerStatus(invoke: Invoke) {
        val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val data = JSObject()
        data.put("packageName", activity.packageName)
        data.put("isDeviceOwner", dpm.isDeviceOwnerApp(activity.packageName))
        // Forward-looking for M2-11: once owner, Lock Task is permitted.
        data.put("isLockTaskPermitted", dpm.isLockTaskPermitted(activity.packageName))
        invoke.resolve(data)
    }

    /**
     * Arm/disarm the Tier 2 watcher for the CURRENT session. Cleared
     * automatically at session end (the web layer calls with active=false);
     * the service itself stays inert whenever `active` is false.
     */
    @Command
    fun setWatchState(invoke: Invoke) {
        val args = invoke.parseArgs(WatchStateArgs::class.java)
        activity
            .getSharedPreferences(MaxFocusAccessibilityService.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(MaxFocusAccessibilityService.KEY_ACTIVE, args.active)
            .putStringSet(MaxFocusAccessibilityService.KEY_PACKAGES, args.packages.filter { it.isNotBlank() }.toSet())
            .apply()
        // Overlay + UsageStats backstops (M2-13) follow the session state.
        val appLabel = activity.applicationInfo.loadLabel(activity.packageManager).toString()
        val service = MaxFocusAccessibilityService.runningInstance
        if (args.active) {
            service?.let { MaxFocusOverlay.show(it, appLabel) }
        } else {
            service?.let { MaxFocusOverlay.dismiss(it) }
        }
        val data = JSObject()
        data.put("active", args.active)
        data.put("watcherConnected", MaxFocusAccessibilityService.isRunning)
        invoke.resolve(data)
    }

    /** Deep-link to the system accessibility settings (Tier 2 grant). */
    @Command
    fun openAccessibilitySettings(invoke: Invoke) {
        activity.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        invoke.resolve()
    }

    /**
     * Start the persistent session service (M2-14): the "session running"
     * notification + monotonic elapsedRealtime anchor. Also marks
     * KEY_RESUME_EXPECTED so a reboot during the session relaunches the app
     * (MaxFocusBootReceiver).
     */
    @Command
    fun sessionServiceStart(invoke: Invoke) {
        activity.getSharedPreferences(MaxFocusAccessibilityService.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(MaxFocusBootReceiver.KEY_RESUME_EXPECTED, true)
            .apply()
        val intent = Intent(activity, MaxFocusForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.startForegroundService(intent)
        } else {
            activity.startService(intent)
        }
        invoke.resolve()
    }

    /** Stop the session service; clears the boot-resume expectation. */
    @Command
    fun sessionServiceStop(invoke: Invoke) {
        activity.getSharedPreferences(MaxFocusAccessibilityService.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(MaxFocusBootReceiver.KEY_RESUME_EXPECTED, false)
            .apply()
        activity.stopService(Intent(activity, MaxFocusForegroundService::class.java))
        invoke.resolve()
    }

    /** Monotonic elapsed ms since the session anchor (0 when none running). */
    @Command
    fun sessionElapsed(invoke: Invoke) {
        val data = JSObject()
        data.put("elapsedRealtimeMs", MaxFocusForegroundService.elapsedSinceAnchor(activity))
        data.put("deviceElapsedRealtimeMs", SystemClock.elapsedRealtime())
        invoke.resolve(data)
    }

    /**
     * Anti-uninstall hard gate (M2-14, Device Owner only): blocks uninstall of
     * Learning HUB while a session is protected. The web layer MUST clear this
     * at session end (release path always pairs set/unset; the policy is
     * per-user-visible in settings and M2-24's boot reconcile re-asserts it).
     */
    @Command
    fun setAntiUninstall(invoke: Invoke) {
        val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (!dpm.isDeviceOwnerApp(activity.packageName)) {
            invoke.reject("uninstall blocking requires Device Owner (Tier 1)")
            return
        }
        val args = invoke.parseArgs(EnableArgs::class.java)
        dpm.setUninstallBlocked(
            ComponentName(activity, MaxDeviceAdminReceiver::class.java),
            activity.packageName,
            args.enabled,
        )
        val data = JSObject()
        data.put("uninstallBlocked", args.enabled)
        invoke.resolve(data)
    }
}
