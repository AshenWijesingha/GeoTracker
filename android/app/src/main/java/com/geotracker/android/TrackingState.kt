package com.geotracker.android

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/** Live state published by [TrackingService] and observed by the UI. */
data class TrackingSnapshot(
    val running: Boolean = false,
    val status: String = "stopped",
    val motion: String = "moving",
    val lastFix: FirestoreClient.Fix? = null,
    val uploads: Int = 0,
    val queued: Int = 0,
    val lastUploadMs: Long? = null,
    val batteryLevel: Double? = null,
    val charging: Boolean = false,
    val error: String? = null,
    val sosActive: Boolean = false,
    val sosAcknowledged: Boolean = false,
)

object TrackingState {
    private val _state = MutableStateFlow(TrackingSnapshot())
    val state: StateFlow<TrackingSnapshot> = _state

    fun update(block: (TrackingSnapshot) -> TrackingSnapshot) = _state.update(block)
}
