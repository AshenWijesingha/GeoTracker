package com.geotracker.android

import java.net.URI
import java.util.UUID

/** Tracker ID helpers. Mirrors `isValidTrackerId` / `extractTrackerId` in src/lib/geo.ts. */
object TrackerIds {
    private val VALID = Regex("^[A-Za-z0-9_-]{8,128}$")

    fun isValid(id: String): Boolean = VALID.matches(id)

    /**
     * Accepts a raw tracker ID or a tracking link such as
     * `https://host/GeoTracker/track/?id=track_…` (what the dashboard's QR code holds).
     */
    fun extract(input: String): String? {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return null
        if (trimmed.contains("://")) {
            val query = try {
                URI(trimmed).rawQuery
            } catch (_: Exception) {
                null
            } ?: return null
            val id = query.split('&')
                .map { it.split('=', limit = 2) }
                .firstOrNull { it.size == 2 && it[0] == "id" }
                ?.get(1)
                ?.let { java.net.URLDecoder.decode(it, "UTF-8") }
                ?: return null
            return id.takeIf(::isValid)
        }
        return trimmed.takeIf(::isValid)
    }

    /** Same format as `generateTrackingId()` on the web. */
    fun generate(): String = "track_" + UUID.randomUUID().toString()

    fun trackingLink(id: String): String = "${BuildConfig.WEB_URL}/track/?id=$id"
}
