package com.geotracker.android

import android.Manifest
import android.annotation.SuppressLint
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Foreground service that shares this phone's location with the GeoTracker
 * console. It keeps running with the screen off and while other apps are in
 * front, shows a permanent notification (required by Android, and it makes it
 * obvious to the person that sharing is on) and uses the same adaptive,
 * battery-friendly upload policy as the web tracker (src/lib/use-live-tracking.ts):
 *
 *  • moving     → at most one upload every 5 s, high-accuracy GPS
 *  • stationary → balanced-power fixes and a 60 s heartbeat
 *  • jitter     → movements below 8 m are ignored
 *  • offline    → fixes are queued on disk and uploaded when back online
 */
class TrackingService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val uploadMutex = Mutex()
    private val client = FirestoreClient()
    private lateinit var prefs: Prefs
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }

    private var trackerId: String = ""
    private var heartbeatJob: Job? = null
    private var highAccuracy: Boolean? = null

    // Upload policy state (mirrors the refs in use-live-tracking.ts)
    private var lastFix: FirestoreClient.Fix? = null
    private var lastUploaded: FirestoreClient.Fix? = null
    @Volatile private var lastUploadAt = 0L
    private var lastMovementAt = System.currentTimeMillis()
    private var motion = "moving"

    // Extras that only need sending when they change
    private var battery: FirestoreClient.Battery? = null
    private var lastSentBattery: FirestoreClient.Battery? = null
    private var sentDevice = false
    private var ip: String? = null
    private var trackerReady = false

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.locations.forEach { onLocation(it) }
        }
    }

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = onBattery(intent)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        Notifications.ensureChannels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PAUSE -> {
                finish("paused")
                return START_NOT_STICKY
            }
            ACTION_STOP -> {
                finish("stopped")
                return START_NOT_STICKY
            }
        }

        val id = prefs.trackerId
        if (id == null || !hasLocationPermission()) {
            Log.w(TAG, "Not starting: tracker paired=${id != null}, permission=${hasLocationPermission()}")
            stopSelf()
            return START_NOT_STICKY
        }

        try {
            ServiceCompat.startForeground(
                this,
                Notifications.TRACKING_ID,
                Notifications.tracking(this, TrackingState.state.value),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0,
            )
        } catch (e: Exception) {
            // Android 12+ refuses to start a location service from the
            // background without "Allow all the time" location access.
            Log.e(TAG, "startForeground failed", e)
            Notifications.showResumePrompt(this)
            stopSelf()
            return START_NOT_STICKY
        }

        if (trackerId != id) startSharing(id)
        return START_STICKY
    }

    private fun startSharing(id: String) {
        trackerId = id
        prefs.sharing = "active"
        trackerReady = false
        sentDevice = false
        lastUploaded = null
        lastUploadAt = 0L

        TrackingState.update {
            it.copy(running = true, status = "active", error = null, queued = prefs.queueSize())
        }

        ContextCompat.registerReceiver(
            this, batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        requestUpdates(high = true)

        scope.launch {
            runCatching {
                client.ensureTracker(id, prefs.deviceName)
                trackerReady = true
                client.updateState(id, status = "active", battery = battery, device = deviceInfo())
                sentDevice = true
                battery?.let { lastSentBattery = it }
            }.onFailure { Log.w(TAG, "Initial state update failed", it) }
            ip = fetchIp()
            flushQueue()
        }

        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(HEARTBEAT_CHECK_MS)
                heartbeat()
            }
        }
    }

    // ── Location handling ─────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    private fun requestUpdates(high: Boolean) {
        if (highAccuracy == high) return
        highAccuracy = high
        val request = if (high) {
            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, MOVING_INTERVAL_MS)
                .setMinUpdateIntervalMillis(2_000)
                .build()
        } else {
            LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 30_000)
                .setMinUpdateIntervalMillis(10_000)
                .build()
        }
        fused.removeLocationUpdates(locationCallback)
        fused.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
    }

    private fun onLocation(location: Location) {
        val fix = FirestoreClient.Fix(
            latitude = location.latitude,
            longitude = location.longitude,
            accuracy = location.accuracy.toDouble(),
            timestampMs = location.time.takeIf { it > 0 } ?: System.currentTimeMillis(),
            speed = if (location.hasSpeed()) location.speed.toDouble() else null,
            heading = if (location.hasBearing()) location.bearing.toDouble() else null,
            altitude = if (location.hasAltitude()) location.altitude else null,
            battery = battery?.level,
        )
        if (fix.latitude !in -90.0..90.0 || fix.longitude !in -180.0..180.0) return
        lastFix = fix

        val now = System.currentTimeMillis()
        val last = lastUploaded
        val elapsed = now - lastUploadAt
        val moved = if (last != null) distanceMeters(last, fix) else Double.POSITIVE_INFINITY
        val meaningfulMove = moved >= maxOf(MIN_DISTANCE_M, minOf(fix.accuracy, 50.0) * 0.5)
        if (meaningfulMove) lastMovementAt = now

        val nextMotion = if (now - lastMovementAt > STATIONARY_AFTER_MS) "stationary" else "moving"
        if (nextMotion != motion) {
            motion = nextMotion
            requestUpdates(high = motion == "moving")
        }

        val poorFix = fix.accuracy > MAX_ACCEPTABLE_ACCURACY && last != null && last.accuracy < fix.accuracy
        val shouldUpload = last == null ||
            (meaningfulMove && !poorFix && elapsed >= MOVING_INTERVAL_MS) ||
            elapsed >= IDLE_INTERVAL_MS

        TrackingState.update { it.copy(lastFix = fix, motion = motion) }
        if (shouldUpload) enqueue(fix)
    }

    private fun heartbeat() {
        if (System.currentTimeMillis() - lastUploadAt < IDLE_INTERVAL_MS - 1_000) {
            // Still retry anything stuck in the offline queue.
            if (prefs.queueSize() > 0) scope.launch { flushQueue() }
            return
        }
        // Re-send the last known fix so "last seen" stays fresh while still
        // (the same fallback the web tracker uses).
        lastFix?.let { enqueue(it.copy(timestampMs = System.currentTimeMillis(), battery = battery?.level)) }
    }

    private fun enqueue(fix: FirestoreClient.Fix) {
        lastUploaded = fix
        lastUploadAt = System.currentTimeMillis()
        val size = prefs.enqueue(fix)
        TrackingState.update { it.copy(queued = size) }
        scope.launch { flushQueue() }
    }

    /** Upload queued fixes oldest first; stops at the first network failure. */
    private suspend fun flushQueue() = uploadMutex.withLock {
        while (true) {
            val fix = prefs.peekQueue() ?: break
            val sendBattery = battery?.takeIf { it != lastSentBattery }
            val device = if (!sentDevice) deviceInfo() else null
            try {
                if (!trackerReady) {
                    client.ensureTracker(trackerId, prefs.deviceName)
                    trackerReady = true
                }
                try {
                    client.addFix(trackerId, fix, sendBattery, motion, device, ip)
                } catch (e: FirestoreClient.HttpException) {
                    if (e.code != 404) throw e
                    // Tracker was deleted on the console: recreate it and retry once.
                    client.ensureTracker(trackerId, prefs.deviceName)
                    client.addFix(trackerId, fix, sendBattery, motion, device, ip)
                }
                if (sendBattery != null) lastSentBattery = sendBattery
                if (device != null) sentDevice = true
                val remaining = prefs.dequeue()
                TrackingState.update {
                    it.copy(
                        uploads = it.uploads + 1,
                        queued = remaining,
                        lastUploadMs = System.currentTimeMillis(),
                        error = null,
                    )
                }
            } catch (e: FirestoreClient.HttpException) {
                Log.e(TAG, "Upload rejected: ${e.code} ${e.message}")
                val permanent = e.code in 400..499 && e.code != 429
                // Permanent rejection (rules / bad data): drop this fix so the
                // queue cannot get stuck behind it.
                val remaining = if (permanent) prefs.dequeue() else prefs.queueSize()
                TrackingState.update { it.copy(queued = remaining, error = "Console rejected the update: ${e.message}") }
                if (!permanent) break
            } catch (e: IOException) {
                val remaining = prefs.queueSize()
                TrackingState.update { it.copy(queued = remaining, error = "Offline — $remaining update(s) queued") }
                break
            }
        }
        Notifications.updateTracking(this, TrackingState.state.value)
    }

    // ── Battery ───────────────────────────────────────────────────────────

    private fun onBattery(intent: Intent) {
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        if (level < 0 || scale <= 0) return
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        val b = FirestoreClient.Battery(Math.round(level * 100.0 / scale) / 100.0, charging)
        if (b == battery) return
        battery = b
        TrackingState.update { it.copy(batteryLevel = b.level, charging = b.charging) }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private fun deviceInfo(): FirestoreClient.DeviceInfo {
        val dm = resources.displayMetrics
        return FirestoreClient.DeviceInfo(
            browser = "GeoTracker Android ${BuildConfig.VERSION_NAME}",
            os = "Android ${Build.VERSION.RELEASE}",
            platform = Prefs.defaultDeviceName(),
            screen = "${dm.widthPixels}x${dm.heightPixels}",
            userAgent = "GeoTracker-Android/${BuildConfig.VERSION_NAME} (Android ${Build.VERSION.RELEASE}; ${Build.MODEL})",
        )
    }

    private fun fetchIp(): String? = runCatching {
        val conn = URL("https://api.ipify.org?format=json").openConnection() as HttpURLConnection
        conn.connectTimeout = 5_000
        conn.readTimeout = 5_000
        try {
            org.json.JSONObject(conn.inputStream.bufferedReader().readText()).optString("ip").ifBlank { null }
        } finally {
            conn.disconnect()
        }
    }.getOrNull()

    private fun hasLocationPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun finish(status: String) {
        prefs.sharing = status
        val id = prefs.trackerId
        fused.removeLocationUpdates(locationCallback)
        heartbeatJob?.cancel()
        runCatching { unregisterReceiver(batteryReceiver) }
        TrackingState.update { it.copy(running = false, status = status) }
        if (id != null) {
            // Runs on the app scope so it survives this service being destroyed.
            App.scope.launch {
                runCatching { FirestoreClient().updateState(id, status = status) }
                    .onFailure { Log.w(TAG, "Could not report status $status", it) }
            }
        }
        trackerId = ""
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        fused.removeLocationUpdates(locationCallback)
        runCatching { unregisterReceiver(batteryReceiver) }
        scope.cancel()
        if (TrackingState.state.value.running) TrackingState.update { it.copy(running = false) }
        super.onDestroy()
    }

    companion object {
        private const val TAG = "TrackingService"
        const val ACTION_START = "com.geotracker.android.START"
        const val ACTION_PAUSE = "com.geotracker.android.PAUSE"
        const val ACTION_STOP = "com.geotracker.android.STOP"

        // Same values as TRACKING_CONFIG in src/lib/geo.ts
        const val MOVING_INTERVAL_MS = 5_000L
        const val IDLE_INTERVAL_MS = 60_000L
        const val MIN_DISTANCE_M = 8.0
        const val MAX_ACCEPTABLE_ACCURACY = 150.0
        const val STATIONARY_AFTER_MS = 30_000L
        private const val HEARTBEAT_CHECK_MS = 15_000L

        fun start(context: Context) {
            ContextCompat.startForegroundService(
                context, Intent(context, TrackingService::class.java).setAction(ACTION_START),
            )
        }

        fun send(context: Context, action: String) {
            // Pause/stop only matter if the service is running; when it is not,
            // report the status directly instead of starting it just to stop.
            if (TrackingState.state.value.running) {
                context.startService(Intent(context, TrackingService::class.java).setAction(action))
            } else {
                val status = if (action == ACTION_PAUSE) "paused" else "stopped"
                val prefs = Prefs(context)
                prefs.sharing = status
                TrackingState.update { it.copy(status = status) }
                prefs.trackerId?.let { id ->
                    App.scope.launch { runCatching { FirestoreClient().updateState(id, status = status) } }
                }
            }
        }

        /** Haversine distance in metres (same as `distanceMeters` in geo.ts). */
        fun distanceMeters(a: FirestoreClient.Fix, b: FirestoreClient.Fix): Double {
            val r = 6_371_000.0
            val dLat = Math.toRadians(b.latitude - a.latitude)
            val dLng = Math.toRadians(b.longitude - a.longitude)
            val h = Math.sin(dLat / 2).let { it * it } +
                Math.cos(Math.toRadians(a.latitude)) * Math.cos(Math.toRadians(b.latitude)) *
                Math.sin(dLng / 2).let { it * it }
            return 2 * r * Math.asin(Math.sqrt(minOf(1.0, h)))
        }
    }
}
