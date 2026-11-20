package com.geotracker.android

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

/** Resumes sharing after a reboot or app update if it was on before. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val prefs = Prefs(context)
        if (!prefs.autoStart || prefs.sharing != "active" || prefs.trackerId == null || !prefs.consentGiven) return

        // Starting a location service from the background needs "Allow all
        // the time" on Android 10+. Without it, ask the person to reopen the app.
        val background = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (background) {
            runCatching { TrackingService.start(context) }.onFailure { Notifications.showResumePrompt(context) }
        } else {
            Notifications.showResumePrompt(context)
        }
    }
}
