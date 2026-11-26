package dev.learninghub.app

import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    handleInstallStatusIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleInstallStatusIntent(intent)
  }

  private fun handleInstallStatusIntent(intent: Intent?) {
    if (intent == null) return
    if (intent.action == MaxUpdatePlugin.ACTION_INSTALL_STATUS) {
      val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
      // MainActivity is exported, so any app can send this action. Only act on
      // it for an install session this app opened (blocks intent redirection).
      val sessionId = intent.getIntExtra(MaxUpdatePlugin.EXTRA_SESSION_ID, -1)
      val ownSession = packageManager.packageInstaller.mySessions.any { it.sessionId == sessionId }
      if (ownSession && status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
        val confirmIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(Intent.EXTRA_INTENT)
        }
        if (confirmIntent != null && confirmIntent.component?.packageName != packageName) {
          confirmIntent.flags = confirmIntent.flags and (
            Intent.FLAG_GRANT_READ_URI_PERMISSION or
              Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
              Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
              Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
            ).inv()
          confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          startActivity(confirmIntent)
        }
      }
    }
  }
}
