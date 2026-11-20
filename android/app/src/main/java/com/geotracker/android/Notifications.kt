package com.geotracker.android

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

object Notifications {
    const val TRACKING_ID = 1
    private const val RESUME_ID = 2
    private const val SOS_ID = 3
    private const val CH_TRACKING = "tracking"
    private const val CH_ALERTS = "alerts"

    fun ensureChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CH_TRACKING, context.getString(R.string.channel_tracking), NotificationManager.IMPORTANCE_LOW).apply {
                description = context.getString(R.string.channel_tracking_desc)
                setShowBadge(false)
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_ALERTS, context.getString(R.string.channel_alerts), NotificationManager.IMPORTANCE_HIGH),
        )
    }

    private fun openApp(context: Context) = PendingIntent.getActivity(
        context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun serviceAction(context: Context, action: String, code: Int) = PendingIntent.getService(
        context, code, Intent(context, TrackingService::class.java).setAction(action),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    fun tracking(context: Context, s: TrackingSnapshot): Notification {
        val text = buildString {
            append(if (s.motion == "stationary") "Still" else "Moving")
            s.lastUploadMs?.let {
                append(" · last sent ")
                append(android.text.format.DateFormat.getTimeFormat(context).format(java.util.Date(it)))
            }
            if (s.queued > 0) append(" · ${s.queued} queued")
        }
        return NotificationCompat.Builder(context, CH_TRACKING)
            .setSmallIcon(R.drawable.ic_stat_location)
            .setContentTitle(context.getString(R.string.notif_sharing))
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(openApp(context))
            .addAction(0, context.getString(R.string.pause), serviceAction(context, TrackingService.ACTION_PAUSE, 1))
            .addAction(0, context.getString(R.string.stop), serviceAction(context, TrackingService.ACTION_STOP, 2))
            .build()
    }

    private fun canPost(context: Context) =
        android.os.Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun post(context: Context, id: Int, notification: Notification) {
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // Permission revoked in the meantime; nothing to show.
        }
    }

    fun updateTracking(context: Context, s: TrackingSnapshot) {
        if (!s.running || !canPost(context)) return
        post(context, TRACKING_ID, tracking(context, s))
    }

    /** Shown when sharing could not restart by itself (e.g. after a reboot). */
    fun showResumePrompt(context: Context) {
        if (!canPost(context)) return
        val n = NotificationCompat.Builder(context, CH_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_location)
            .setContentTitle(context.getString(R.string.notif_resume_title))
            .setContentText(context.getString(R.string.notif_resume_text))
            .setAutoCancel(true)
            .setContentIntent(openApp(context))
            .build()
        post(context, RESUME_ID, n)
    }

    fun showSosAcknowledged(context: Context) {
        if (!canPost(context)) return
        val n = NotificationCompat.Builder(context, CH_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_location)
            .setContentTitle(context.getString(R.string.notif_sos_ack_title))
            .setContentText(context.getString(R.string.notif_sos_ack_text))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(openApp(context))
            .build()
        post(context, SOS_ID, n)
    }
}
