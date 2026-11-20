package com.geotracker.android

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * Minimal Firestore REST client that writes exactly the same documents as the
 * web app (see src/lib/firebase-services.ts), so the GeoTracker console shows
 * an Android device like any other tracker. Using REST instead of the Firebase
 * Android SDK means no google-services.json or app registration is needed:
 * the tracker ID works as the capability, enforced by firestore.rules.
 */
class FirestoreClient(
    private val projectId: String = BuildConfig.FIREBASE_PROJECT_ID,
    private val apiKey: String = BuildConfig.FIREBASE_API_KEY,
) {
    class HttpException(val code: Int, message: String) : IOException(message)

    data class Fix(
        val latitude: Double,
        val longitude: Double,
        val accuracy: Double,
        val timestampMs: Long,
        val speed: Double?,
        val heading: Double?,
        val altitude: Double?,
        val battery: Double?,
    )

    data class Battery(val level: Double, val charging: Boolean)

    data class DeviceInfo(
        val browser: String,
        val os: String,
        val platform: String,
        val screen: String,
        val userAgent: String,
    )

    data class TrackerSummary(
        val exists: Boolean,
        val name: String?,
        val owned: Boolean,
        val sosActive: Boolean,
        val sosAcknowledgedAt: String?,
    )

    private val root = "projects/$projectId/databases/(default)/documents"
    private val base = "https://firestore.googleapis.com/v1"

    private fun trackerPath(id: String) = "$root/trackers/$id"

    // ── Public API ────────────────────────────────────────────────────────

    fun getTracker(id: String): TrackerSummary {
        return try {
            val doc = request("GET", "$base/${trackerPath(id)}", null)
            val fields = doc.optJSONObject("fields") ?: JSONObject()
            val sos = fields.optJSONObject("sos")?.optJSONObject("mapValue")?.optJSONObject("fields")
            TrackerSummary(
                exists = true,
                name = fields.optJSONObject("name")?.optString("stringValue"),
                owned = fields.has("userId"),
                sosActive = sos?.optJSONObject("active")?.optBoolean("booleanValue") ?: false,
                sosAcknowledgedAt = sos?.optJSONObject("acknowledgedAt")?.optString("stringValue")?.takeIf { it.isNotEmpty() },
            )
        } catch (e: HttpException) {
            if (e.code == 404) TrackerSummary(false, null, false, false, null) else throw e
        }
    }

    /** Create an unowned tracker (like Quick Track / opening a link) if it does not exist yet. */
    fun ensureTracker(id: String, name: String) {
        if (getTracker(id).exists) return
        val write = JSONObject()
            .put("update", JSONObject()
                .put("name", trackerPath(id))
                .put("fields", JSONObject()
                    .put("name", str(name.ifBlank { "Android device" }.take(80)))
                    .put("locations", JSONObject().put("arrayValue", JSONObject()))
                    .put("locationCount", int(0))
                    .put("status", str("active"))))
            .put("updateTransforms", JSONArray()
                .put(serverTime("created"))
                .put(serverTime("updatedAt")))
            .put("currentDocument", JSONObject().put("exists", false))
        try {
            commit(JSONArray().put(write))
        } catch (e: HttpException) {
            // 409/400 = someone created it in the meantime; that is fine.
            if (e.code != 409 && e.code != 400) throw e
        }
    }

    /**
     * Upload one fix: a point document plus the tracker summary, atomically
     * (same 2-write batch as `addLocationToTrackerInFirebase`).
     */
    fun addFix(
        id: String,
        fix: Fix,
        battery: Battery?,
        motion: String?,
        device: DeviceInfo?,
        ip: String?,
    ) {
        val point = pointFields(fix)
        val summary = JSONObject()
            .put("lastLocation", JSONObject().put("mapValue", JSONObject().put("fields", point)))
            .put("lastSeen", str(iso(fix.timestampMs)))
        if (battery != null) summary.put("battery", batteryValue(battery))
        if (motion != null) summary.put("motion", str(motion))
        if (device != null) summary.put("device", deviceValue(device))
        if (ip != null) summary.put("ip", str(ip))

        val writes = JSONArray()
            .put(JSONObject()
                .put("update", JSONObject()
                    .put("name", "${trackerPath(id)}/points/${autoId()}")
                    .put("fields", point))
                .put("currentDocument", JSONObject().put("exists", false)))
            .put(JSONObject()
                .put("update", JSONObject().put("name", trackerPath(id)).put("fields", summary))
                .put("updateMask", mask(summary.keys().asSequence().toList()))
                .put("updateTransforms", JSONArray()
                    .put(JSONObject().put("fieldPath", "locationCount").put("increment", int(1)))
                    .put(serverTime("updatedAt")))
                .put("currentDocument", JSONObject().put("exists", true)))
        commit(writes)
    }

    /** Device-side status/battery/device updates (`updateTrackerState`). */
    fun updateState(
        id: String,
        status: String? = null,
        battery: Battery? = null,
        motion: String? = null,
        device: DeviceInfo? = null,
    ) {
        val fields = JSONObject()
        if (status != null) fields.put("status", str(status))
        if (battery != null) fields.put("battery", batteryValue(battery))
        if (motion != null) fields.put("motion", str(motion))
        if (device != null) fields.put("device", deviceValue(device))
        updateFields(id, fields, fields.keys().asSequence().toList())
    }

    fun triggerSos(id: String, fix: Fix?) {
        val sos = JSONObject()
            .put("active", bool(true))
            .put("triggeredAt", str(iso(System.currentTimeMillis())))
            .put("latitude", fix?.let { dbl(it.latitude) } ?: nul())
            .put("longitude", fix?.let { dbl(it.longitude) } ?: nul())
            .put("accuracy", fix?.let { dbl(it.accuracy) } ?: nul())
            .put("acknowledgedAt", nul())
        val fields = JSONObject().put("sos", JSONObject().put("mapValue", JSONObject().put("fields", sos)))
        updateFields(id, fields, listOf("sos"))
    }

    fun cancelSos(id: String) {
        val fields = JSONObject().put("sos", JSONObject().put("mapValue", JSONObject()
            .put("fields", JSONObject().put("active", bool(false)))))
        updateFields(id, fields, listOf("sos.active"))
    }

    // ── Internals ─────────────────────────────────────────────────────────

    private fun updateFields(id: String, fields: JSONObject, paths: List<String>) {
        val write = JSONObject()
            .put("update", JSONObject().put("name", trackerPath(id)).put("fields", fields))
            .put("updateMask", mask(paths))
            .put("updateTransforms", JSONArray().put(serverTime("updatedAt")))
            .put("currentDocument", JSONObject().put("exists", true))
        commit(JSONArray().put(write))
    }

    private fun commit(writes: JSONArray) {
        request("POST", "$base/$root:commit", JSONObject().put("writes", writes))
    }

    private fun request(method: String, url: String, body: JSONObject?): JSONObject {
        val conn = URL("$url?key=$apiKey").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("X-Android-Package", BuildConfig.APPLICATION_ID)
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) {
                val message = runCatching {
                    JSONObject(text).getJSONObject("error").getString("message")
                }.getOrDefault("HTTP $code")
                throw HttpException(code, message)
            }
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally {
            conn.disconnect()
        }
    }

    private fun pointFields(fix: Fix): JSONObject {
        val p = JSONObject()
            .put("latitude", dbl(fix.latitude))
            .put("longitude", dbl(fix.longitude))
            .put("accuracy", dbl(Math.round(fix.accuracy * 10) / 10.0))
            .put("timestamp", str(iso(fix.timestampMs)))
        fix.speed?.takeIf { it.isFinite() }?.let { p.put("speed", dbl(it)) }
        fix.heading?.takeIf { it.isFinite() }?.let { p.put("heading", dbl(it)) }
        fix.altitude?.takeIf { it.isFinite() }?.let { p.put("altitude", dbl(it)) }
        fix.battery?.takeIf { it.isFinite() }?.let { p.put("battery", dbl(it)) }
        return p
    }

    private fun batteryValue(b: Battery) = JSONObject().put("mapValue", JSONObject().put("fields", JSONObject()
        .put("level", dbl(b.level))
        .put("charging", bool(b.charging))
        .put("updatedAt", str(iso(System.currentTimeMillis())))))

    private fun deviceValue(d: DeviceInfo) = JSONObject().put("mapValue", JSONObject().put("fields", JSONObject()
        .put("browser", str(d.browser))
        .put("os", str(d.os))
        .put("platform", str(d.platform))
        .put("screen", str(d.screen))
        .put("userAgent", str(d.userAgent))))

    companion object {
        private val ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)
        private const val ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        private val random = SecureRandom()

        /** Same format as JavaScript's `Date.toISOString()`. */
        fun iso(ms: Long): String = ISO.format(Instant.ofEpochMilli(ms))

        fun autoId(): String = buildString { repeat(20) { append(ID_CHARS[random.nextInt(ID_CHARS.length)]) } }

        private fun str(v: String) = JSONObject().put("stringValue", v)
        private fun dbl(v: Double) = JSONObject().put("doubleValue", v)
        private fun int(v: Long) = JSONObject().put("integerValue", v.toString())
        private fun int(v: Int) = int(v.toLong())
        private fun bool(v: Boolean) = JSONObject().put("booleanValue", v)
        private fun nul() = JSONObject().put("nullValue", JSONObject.NULL)
        private fun serverTime(path: String) = JSONObject().put("fieldPath", path).put("setToServerValue", "REQUEST_TIME")
        private fun mask(paths: List<String>) = JSONObject().put("fieldPaths", JSONArray(paths))
    }
}
