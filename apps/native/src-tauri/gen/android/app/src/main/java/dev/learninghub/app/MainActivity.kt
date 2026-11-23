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
      if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
        val confirmIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(Intent.EXTRA_INTENT)
        }
        if (confirmIntent != null) {
          confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          startActivity(confirmIntent)
        }
      }
    }
  }
}
