package com.geotracker.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackerIdsTest {
    private val id = "track_123e4567-e89b-12d3-a456-426614174000"

    @Test fun acceptsRawId() = assertEquals(id, TrackerIds.extract("  $id  "))

    @Test fun extractsIdFromTrackingLink() =
        assertEquals(id, TrackerIds.extract("https://example.github.io/GeoTracker/track/?id=$id"))

    @Test fun extractsIdWithOtherParams() =
        assertEquals(id, TrackerIds.extract("https://example.com/track/?utm=x&id=$id#top"))

    @Test fun rejectsLinkWithoutId() = assertNull(TrackerIds.extract("https://example.com/track/"))

    @Test fun rejectsInvalidCharacters() = assertNull(TrackerIds.extract("abc def ghi"))

    @Test fun rejectsTooShort() = assertNull(TrackerIds.extract("abc"))

    @Test fun generatedIdsAreValid() {
        val generated = TrackerIds.generate()
        assertTrue(generated.startsWith("track_"))
        assertTrue(TrackerIds.isValid(generated))
    }
}
