package dev.learninghub.app

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import app.tauri.Logger
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray

/**
 * Lock Task Mode commands for Max Focus Tier 1 (M2-11).
 *
 * Lives in the SAME `max-focus-android` plugin as [MaxFocusAndroidPlugin]
 * (both classes are registered; Tauri loads every @TauriPlugin class the Rust
 * side registers by name). Lock Task pins the FOREGROUND to a fixed set of
 * packages — the Android-native expression of the locked Phase-1 decision
 * "Tier 1 = Device Owner".
 *
 * Hard rules honored here:
 * - **Device Owner ONLY.** `setLockTaskPackages` + `startLockTask` without
 *   ownership is rejected with the docs pointer — Tier 2 (AccessibilityService,
 *   M2-12) exists precisely because most sideload users are not owners.
 * - **Allowlist is explicit.** The packages list comes from the session
 *   allowlist (the web layer's FocusLockPayload.apps, package-normalized by
 *   the update service); the emergency dialer package MUST be part of it —
 *   M2-15 enforces SYSTEM_ALLOWED_APPS on the web side and validates here.
 * - **Symmetric exit.** Every start has a stop; the Rust drop-style lifecycle
 *   (session end → stop command) is mirrored by `onStop`-safety: Android
 *   itself ends lock task when the owner app is killed, and the M2-24 resume
 *   path re-issues start on boot.
 */
@TauriPlugin
class MaxFocusLockTask(private val activity: Activity) : Plugin(activity) {

    @InvokeArg
    class StartLockTaskArgs {
        /** Allowlisted packages permitted during the pinned session. */
        var packages: MutableList<String> = mutableListOf()
    }

    private fun devicePolicyManager(): DevicePolicyManager =
        activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private fun adminComponent(): ComponentName =
        ComponentName(activity, MaxDeviceAdminReceiver::class.java)

    /** Pin the foreground to `packages` (owner only). Resolves the active set. */
    @Command
    fun startLockTask(invoke: Invoke) {
        val dpm = devicePolicyManager()
        if (!dpm.isDeviceOwnerApp(activity.packageName)) {
            invoke.reject(
                "Lock Task Mode requires Device Owner (Tier 1) — see docs/LIMITATIONS.md; " +
                    "this device falls back to Tier 2 (AccessibilityService, M2-12)",
            )
            return
        }
        val args = invoke.parseArgs(StartLockTaskArgs::class.java)
        val packages = args.packages.filter { it.isNotBlank() }.toTypedArray()
        if (packages.isEmpty()) {
            invoke.reject("Lock Task needs at least one allowlisted package")
            return
        }
        dpm.setLockTaskPackages(adminComponent(), packages)
        activity.startLockTask()
        Logger.info(Logger.tags("MaxFocusLockTask"), "lock task started: ${packages.joinToString()}")
        val data = JSObject()
        data.put("active", true)
        data.put("packages", JSONArray(packages.toList()))
        invoke.resolve(data)
    }

    /** Unpin the foreground (session end / emergency exit). Idempotent. */
    @Command
    fun stopLockTask(invoke: Invoke) {
        try {
            activity.stopLockTask()
        } catch (_: IllegalStateException) {
            // Not in lock task — nothing to stop; idempotent by contract.
        }
        invoke.resolve()
    }

    /** Current lock-task state: permitted, pinned package list (owner only). */
    @Command
    fun lockTaskStatus(invoke: Invoke) {
        val dpm = devicePolicyManager()
        val data = JSObject()
        data.put("packageName", activity.packageName)
        data.put("isDeviceOwner", dpm.isDeviceOwnerApp(activity.packageName))
        data.put("isLockTaskPermitted", dpm.isLockTaskPermitted(activity.packageName))
        if (dpm.isDeviceOwnerApp(activity.packageName)) {
            data.put("packages", JSONArray(dpm.getLockTaskPackages(adminComponent()).toList()))
        }
        invoke.resolve(data)
    }
}
