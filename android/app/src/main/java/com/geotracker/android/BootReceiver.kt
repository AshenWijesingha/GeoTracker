package com.geotracker.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Turns sharing back on after a reboot or app update if it was on before. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (!AlwaysOn.shouldRun(context)) return
        AlwaysOn.schedule(context)
        if (AlwaysOn.hasBackgroundLocation(context)) {
            AlwaysOn.ensureRunning(context)
        } else {
            // Without "Allow all the time" Android won't let a location
            // service start from the background; ask the person to reopen the app.
            Notifications.showResumePrompt(context)
        }
    }
}
