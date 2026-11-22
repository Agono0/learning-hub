package dev.learninghub.app

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * MaxDeviceAdminReceiver — the Device Admin / Device Owner target (M2-10).
 *
 * This receiver is what `adb shell dpm set-device-owner
 * dev.learninghub.app/dev.learninghub.app.MaxDeviceAdminReceiver` binds the
 * owner to. Declared in AndroidManifest.xml with `BIND_DEVICE_ADMIN` and the
 * `@xml/max_device_admin` policy set (force-lock — the minimum needed; Lock
 * Task Mode needs owner status, not extra policies).
 *
 * It deliberately does nothing beyond logging the lifecycle: enabling device
 * admin alone grants nothing to Learning HUB (the useful tiers are Device
 * OWNER via the ADB provisioning command, M2-10, and Lock Task, M2-11).
 */
class MaxDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "device admin enabled (not yet device owner)")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.i(TAG, "device admin disabled")
    }

    companion object {
        private const val TAG = "MaxDeviceAdmin"
    }
}
