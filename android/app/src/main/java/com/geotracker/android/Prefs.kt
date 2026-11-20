package com.geotracker.android

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/** Persistent settings and the offline upload queue. */
class Prefs(context: Context) {
    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences("geotracker", Context.MODE_PRIVATE)

    var trackerId: String?
        get() = sp.getString(KEY_TRACKER, null)
        set(v) = sp.edit().putString(KEY_TRACKER, v).apply()

    var trackerName: String?
        get() = sp.getString(KEY_TRACKER_NAME, null)
        set(v) = sp.edit().putString(KEY_TRACKER_NAME, v).apply()

    var deviceName: String
        get() = sp.getString(KEY_DEVICE_NAME, null) ?: defaultDeviceName()
        set(v) = sp.edit().putString(KEY_DEVICE_NAME, v).apply()

    /** "active", "paused" or "stopped" — what the user last chose. */
    var sharing: String
        get() = sp.getString(KEY_SHARING, "stopped") ?: "stopped"
        set(v) = sp.edit().putString(KEY_SHARING, v).apply()

    var consentGiven: Boolean
        get() = sp.getBoolean(KEY_CONSENT, false)
        set(v) = sp.edit().putBoolean(KEY_CONSENT, v).apply()

    /** Restart sharing after a reboot or app update if it was on. */
    var autoStart: Boolean
        get() = sp.getBoolean(KEY_AUTOSTART, true)
        set(v) = sp.edit().putBoolean(KEY_AUTOSTART, v).apply()

    /** Fixes recorded without connectivity, oldest first. */
    @Synchronized
    fun loadQueue(): MutableList<FirestoreClient.Fix> {
        val raw = sp.getString(KEY_QUEUE, null) ?: return mutableListOf()
        return runCatching {
            val arr = JSONArray(raw)
            MutableList(arr.length()) { i -> fixFromJson(arr.getJSONObject(i)) }
        }.getOrDefault(mutableListOf())
    }

    @Synchronized
    fun saveQueue(queue: List<FirestoreClient.Fix>) {
        val arr = JSONArray()
        queue.takeLast(MAX_QUEUE).forEach { arr.put(fixToJson(it)) }
        sp.edit().putString(KEY_QUEUE, arr.toString()).apply()
    }

    /** Append a fix; returns the new queue size. */
    @Synchronized
    fun enqueue(fix: FirestoreClient.Fix): Int {
        val q = loadQueue()
        q.add(fix)
        saveQueue(q)
        return minOf(q.size, MAX_QUEUE)
    }

    @Synchronized
    fun peekQueue(): FirestoreClient.Fix? = loadQueue().firstOrNull()

    /** Remove the oldest fix; returns the remaining queue size. */
    @Synchronized
    fun dequeue(): Int {
        val q = loadQueue()
        if (q.isNotEmpty()) q.removeAt(0)
        saveQueue(q)
        return q.size
    }

    fun queueSize(): Int = loadQueue().size

    companion object {
        const val MAX_QUEUE = 500
        private const val KEY_TRACKER = "tracker_id"
        private const val KEY_TRACKER_NAME = "tracker_name"
        private const val KEY_DEVICE_NAME = "device_name"
        private const val KEY_SHARING = "sharing"
        private const val KEY_CONSENT = "consent"
        private const val KEY_AUTOSTART = "autostart"
        private const val KEY_QUEUE = "queue"

        fun defaultDeviceName(): String {
            val maker = android.os.Build.MANUFACTURER.replaceFirstChar { it.uppercase() }
            val model = android.os.Build.MODEL
            return if (model.startsWith(maker, ignoreCase = true)) model else "$maker $model"
        }

        private fun fixToJson(f: FirestoreClient.Fix) = JSONObject()
            .put("lat", f.latitude).put("lng", f.longitude).put("acc", f.accuracy).put("t", f.timestampMs)
            .put("spd", f.speed ?: JSONObject.NULL).put("hdg", f.heading ?: JSONObject.NULL)
            .put("alt", f.altitude ?: JSONObject.NULL).put("bat", f.battery ?: JSONObject.NULL)

        private fun fixFromJson(o: JSONObject): FirestoreClient.Fix {
            fun optD(k: String) = if (o.isNull(k)) null else o.getDouble(k)
            return FirestoreClient.Fix(
                o.getDouble("lat"), o.getDouble("lng"), o.getDouble("acc"), o.getLong("t"),
                optD("spd"), optD("hdg"), optD("alt"), optD("bat"),
            )
        }
    }
}
