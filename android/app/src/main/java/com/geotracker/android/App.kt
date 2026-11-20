package com.geotracker.android

import android.app.Application
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifications.ensureChannels(this)
        val prefs = Prefs(this)
        TrackingState.update { it.copy(status = prefs.sharing, queued = prefs.queueSize()) }
    }

    companion object {
        /** Work that must outlive an Activity or the service (status reports, SOS). */
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
}
