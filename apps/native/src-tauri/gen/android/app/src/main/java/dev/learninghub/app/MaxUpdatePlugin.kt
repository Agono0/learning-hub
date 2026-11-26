package dev.learninghub.app

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileInputStream

/**
 * MaxUpdatePlugin — Android sideload installer for Learning HUB updates
 * (mega-run O1-13; architecture in docs/updates.md).
 *
 * The webview's update service downloads the full per-ABI APK into
 * `<app_data>/updates/` through the Rust layer (`update_download_file`, with
 * sha256 verification), then invokes this plugin to hand the verified APK to
 * Android's PackageInstaller. Design law honored here:
 *
 * - **Consent is never skipped.** `REQUEST_INSTALL_PACKAGES` is a
 *   user-granted, per-app "install unknown apps" setting. `installApk` checks
 *   `canRequestPackageInstalls()` FIRST; when missing it opens the exact
 *   system consent screen for THIS package (`ACTION_MANAGE_UNKNOWN_APP_SOURCES`)
 *   and resolves `{ consentRequired: true }` — the UI explains, the user
 *   grants, and re-taps. There is no silent install path, matching the
 *   ask-first update policy (and Google's own sideload consent UX).
 * - **Only app-data APKs are installable.** The path must exist and be a
 *   regular file written by the update downloader — the webview has no way to
 *   aim this at arbitrary storage through the command (the Rust side also
 *   confines downloads to the updates dir).
 * - **Per-ABI payloads.** The caller picks the APK for
 *   `Build.SUPPORTED_ABIS[0]` (or `android-universal` as fallback); this
 *   plugin only installs what it is given, as a MODE_FULL_INSTALL session.
 *
 * Registering layer: `lib.rs` (Rust) registers this class on app start via
 * `PluginApi::register_android_plugin("dev.learninghub.app", "MaxUpdatePlugin")`
 * and exposes it to the webview as the `update_install_android_apk` command.
 */
@TauriPlugin
class MaxUpdatePlugin(private val activity: Activity) : Plugin(activity) {

  @InvokeArg
  class InstallApkArgs {
    /** Absolute path to the downloaded, sha256-verified APK (app data). */
    var apkPath: String? = null
  }

  /** Primary ABI of this device, for the update service's per-ABI pick. */
  @Command
  fun deviceInfo(invoke: Invoke) {
    val data = JSObject()
    data.put("abi", Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown")
    data.put("sdkInt", Build.VERSION.SDK_INT)
    data.put(
      "canInstall",
      Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.packageManager.canRequestPackageInstalls(),
    )
    invoke.resolve(data)
  }

  /**
   * Install the given per-ABI APK as a full package install.
   *
   * Resolves `{ consentRequired: true }` when the user has not yet granted
   * "install unknown apps" for this app (the system consent screen is opened
   * for them); resolves `{ committed: true }` once the PackageInstaller
   * session is committed — from there the SYSTEM installer dialog (the second
   * consent stage) drives the visible flow. Rejects on file/session errors.
   */
  @Command
  fun installApk(invoke: Invoke) {
    val args = invoke.parseArgs(InstallApkArgs::class.java)
    val path = args.apkPath
    if (path.isNullOrEmpty()) {
      invoke.reject("apkPath is required")
      return
    }
    val apk = File(path)
    // Defense in depth (the Rust command already confines the path): only an
    // update APK inside this app's private data dir may be installed.
    val inAppData = apk.canonicalPath.startsWith(activity.dataDir.canonicalPath + File.separator)
    if (!inAppData || !apk.name.startsWith("android-update-") || !apk.name.endsWith(".apk")) {
      invoke.reject("apkPath must be a downloaded update APK")
      return
    }
    if (!apk.isFile) {
      invoke.reject("APK not found at $path")
      return
    }

    // Consent stage 1: the per-app "install unknown apps" grant.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
      Log.i(TAG, "install consent missing — opening system settings for ${activity.packageName}")
      val consent = Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:${activity.packageName}"),
      )
      activity.startActivity(consent)
      val data = JSObject()
      data.put("consentRequired", true)
      invoke.resolve(data)
      return
    }

    try {
      val installer = activity.packageManager.packageInstaller
      val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
      val sessionId = installer.createSession(params)
      val session = installer.openSession(sessionId)

      FileInputStream(apk).use { input ->
        session.openWrite(apk.name, 0, apk.length()).use { out ->
          input.copyTo(out)
          session.fsync(out)
        }
      }

      // The system installer reports its own status dialog; hand it an intent
      // back into the app (mutable on API 31+ so EXTRA_STATUS extras arrive).
      val callbackIntent = Intent(activity, MainActivity::class.java).apply {
        action = ACTION_INSTALL_STATUS
        putExtra(EXTRA_SESSION_ID, sessionId)
      }
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
      val pendingIntent = PendingIntent.getActivity(activity, sessionId, callbackIntent, flags)
      session.commit(pendingIntent.intentSender)
      session.close()

      Log.i(TAG, "committed install session $sessionId for ${apk.name}")
      val data = JSObject()
      data.put("committed", true)
      data.put("sessionId", sessionId)
      invoke.resolve(data)
    } catch (e: Exception) {
      Log.e(TAG, "sideload install failed for ${apk.name}", e)
      invoke.reject(e.message ?: "sideload install failed", e)
    }
  }

  companion object {
    private const val TAG = "MaxUpdatePlugin"
    /** Intent action MainActivity receives with the installer's status extras. */
    const val ACTION_INSTALL_STATUS = "dev.learninghub.app.UPDATE_INSTALL_STATUS"
    const val EXTRA_SESSION_ID = "sessionId"
  }
}
