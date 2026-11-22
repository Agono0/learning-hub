package dev.learninghub.app

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Context
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * MaxFocusAndroidPlugin — Device Owner status for Max Focus Tier 1 (M2-10).
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
 * M2-11 (Lock Task Mode) extends this plugin with lock-task commands.
 *
 * Registered from Rust (lib.rs) as the `max-focus-android` plugin.
 */
@TauriPlugin
class MaxFocusAndroidPlugin(private val activity: Activity) : Plugin(activity) {

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
}
