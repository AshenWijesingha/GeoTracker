package com.geotracker.android

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Sends an SOS to the console (same `sos` field the web SOS button writes) and
 * watches for the owner pressing "Acknowledge" on the dashboard.
 * This only alerts the tracker's owner; it does not contact emergency services.
 */
object SosController {
    private var watchJob: Job? = null

    fun trigger(context: Context, onResult: (Throwable?) -> Unit) {
        val app = context.applicationContext
        val id = Prefs(app).trackerId ?: return onResult(IllegalStateException("No tracker paired"))
        App.scope.launch {
            val result = runCatching { FirestoreClient().triggerSos(id, TrackingState.state.value.lastFix) }
            result.onSuccess {
                TrackingState.update { it.copy(sosActive = true, sosAcknowledged = false) }
                watch(app, id)
            }
            onResult(result.exceptionOrNull())
        }
    }

    fun cancel(context: Context, onResult: (Throwable?) -> Unit) {
        val id = Prefs(context).trackerId ?: return onResult(null)
        watchJob?.cancel()
        App.scope.launch {
            val result = runCatching { FirestoreClient().cancelSos(id) }
            result.onSuccess { TrackingState.update { it.copy(sosActive = false) } }
            onResult(result.exceptionOrNull())
        }
    }

    private fun watch(context: Context, id: String) {
        watchJob?.cancel()
        watchJob = App.scope.launch {
            repeat(240) { // poll for up to an hour
                delay(15_000)
                val tracker = runCatching { FirestoreClient().getTracker(id) }
                    .onFailure { Log.w("SosController", "poll failed", it) }
                    .getOrNull() ?: return@repeat
                if (!tracker.sosActive) {
                    val acknowledged = tracker.sosAcknowledgedAt != null
                    TrackingState.update { it.copy(sosActive = false, sosAcknowledged = acknowledged) }
                    if (acknowledged) Notifications.showSosAcknowledged(context)
                    return@launch
                }
            }
        }
    }
}
