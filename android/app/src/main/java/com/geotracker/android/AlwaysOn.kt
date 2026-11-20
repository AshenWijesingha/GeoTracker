package com.geotracker.android

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * "Always on" sharing: once the person turns sharing on, it stays on until
 * they pause or stop it in the app — through screen-off, the app being swiped
 * away, reboots, app updates and Android killing the process.
 *
 *  • TrackingService is START_STICKY, so Android restarts it after a kill.
 *  • BootReceiver restarts it after a reboot or update.
 *  • KeepAliveWorker checks every 15 minutes and restarts it if needed.
 *
 * Restarting from the background needs location access "Allow all the time"
 * and works most reliably when battery optimisation is off for the app.
 * The foreground-service notification always stays visible while sharing.
 */
object AlwaysOn {
    private const val TAG = "AlwaysOn"
    private const val WORK_NAME = "geotracker-keep-alive"

    fun hasForegroundLocation(context: Context) =
        granted(context, Manifest.permission.ACCESS_FINE_LOCATION) ||
            granted(context, Manifest.permission.ACCESS_COARSE_LOCATION)

    fun hasBackgroundLocation(context: Context) =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            granted(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)

    fun isBatteryUnrestricted(context: Context): Boolean {
        val pm = context.getSystemService(PowerManager::class.java) ?: return true
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    /** True when the person turned sharing on and hasn't paused or stopped it. */
    fun shouldRun(context: Context): Boolean {
        val prefs = Prefs(context)
        return prefs.sharing == "active" && prefs.trackerId != null && prefs.consentGiven && hasForegroundLocation(context)
    }

    /** Start the service if sharing should be on but isn't running. */
    fun ensureRunning(context: Context) {
        if (!shouldRun(context) || TrackingState.state.value.running) return
        try {
            TrackingService.start(context)
        } catch (e: Exception) {
            // Android 12+ blocks background starts without "Allow all the time"
            // or an exemption from battery optimisation.
            Log.w(TAG, "Could not restart sharing from the background", e)
            Notifications.showResumePrompt(context)
        }
    }

    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<KeepAliveWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }

    private fun granted(context: Context, permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
}

/** Watchdog: restarts sharing if Android stopped it while it should be on. */
class KeepAliveWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        AlwaysOn.ensureRunning(applicationContext)
        return Result.success()
    }
}
