package com.geotracker.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

class FirestoreClientTest {
    @Test fun isoMatchesJavaScriptToIsoString() {
        assertEquals("2026-01-02T03:04:05.000Z", FirestoreClient.iso(1767323045000))
        assertEquals("2026-01-02T03:04:05.007Z", FirestoreClient.iso(1767323045007))
    }

    @Test fun autoIdsLookLikeFirestoreIds() {
        val id = FirestoreClient.autoId()
        assertEquals(20, id.length)
        assertTrue(id.all { it.isLetterOrDigit() })
    }

    @Test fun haversineDistance() {
        val a = FirestoreClient.Fix(0.0, 0.0, 5.0, 0, null, null, null, null)
        val b = a.copy(latitude = 0.001)
        assertEquals(111.2, TrackingService.distanceMeters(a, b), 0.5)
    }

    /**
     * End-to-end check against the real Firestore project and its security
     * rules. Writes to a throwaway tracker, so it only runs when
     * GEOTRACKER_LIVE_TEST=1 is set.
     */
    @Test fun liveWritesAreAcceptedByRules() {
        assumeTrue(System.getenv("GEOTRACKER_LIVE_TEST") == "1")
        val client = FirestoreClient()
        val id = "track_androidtest_" + FirestoreClient.autoId()
        assertFalse(client.getTracker(id).exists)
        client.ensureTracker(id, "Android REST test (safe to delete)")
        val fix = FirestoreClient.Fix(6.9271, 79.8612, 12.3, System.currentTimeMillis(), 1.5, 90.0, 10.0, 0.8)
        val device = FirestoreClient.DeviceInfo("GeoTracker Android test", "Android 15", "Test", "1080x2400", "test")
        client.addFix(id, fix, FirestoreClient.Battery(0.8, false), "moving", device, null)
        client.updateState(id, status = "paused")
        client.triggerSos(id, fix)
        assertTrue(client.getTracker(id).sosActive)
        client.cancelSos(id)
        assertFalse(client.getTracker(id).sosActive)
        client.updateState(id, status = "stopped")
        println("Live test tracker: $id")
    }
}
