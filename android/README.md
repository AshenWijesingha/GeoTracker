# GeoTracker for Android

A small Android app that shares the phone's location with the GeoTracker console (the `/dashboard` of the web app). Once sharing is turned on it stays on **all the time**: in the background, with the screen off, after the app is swiped away, and after reboots and updates. It keeps going until the person pauses or stops it in the app.

> **Safety and privacy.** Only install this on a phone whose owner has agreed to be tracked. Android always shows a notification while sharing is on, and the person can pause or stop it at any time. SOS only alerts the tracker's owner on their dashboard. It does **not** contact emergency services.

## Install

- **From your GeoTracker site (easiest):** on the phone, open `https://<you>.github.io/<repo>/download/` (or tap **Get the app** on the dashboard) and tap **Download APK**. Every deploy to GitHub Pages builds and publishes the latest APK there. On a computer, that page shows a QR code to open it on the phone.
- **From GitHub:** open the **Actions → Android** workflow run and download the `GeoTracker-android` artifact. If someone has pushed an `android-v*` tag, the APK is also attached to that release.
- **Build it yourself:** see below.

Android asks you to allow installs from your browser or file manager the first time you install an APK from outside the Play Store.

## Connect a phone to the console

1. On the dashboard, create a tracker (or select one) and click **▦ QR code**.
2. In the app, tap **Scan QR code** and point the camera at the screen.
   You can also paste the tracking link, open the link on the phone and choose GeoTracker, or tap **New Quick Track ID** and add that ID on the dashboard with **Link an existing tracker**.
3. Tap **Start**, read what will be shared and allow location access.
4. The phone appears on the dashboard map within a few seconds.

After **Start**, the app walks through two steps that let it share all the time:

1. **Location → Allow all the time.** Android only lets a location app restart in the background (after a reboot, or when it was stopped) with this permission.
2. **Battery → Unrestricted.** Turn off battery optimisation so the system doesn't stop sharing.

The sharing card shows "✓ Shares all the time" once both are done. If either is missing, buttons there open the right setting.

Some phone makers (for example Xiaomi, Huawei, OnePlus and Samsung) add their own background limits. If sharing still stops, allow **Autostart** or **Background activity** for GeoTracker in the phone's settings.

## How it works

| | |
|---|---|
| Location | Fused Location Provider. High accuracy every 5 s while moving; balanced power while still (no meaningful movement for 30 s). |
| Uploads | Same policy as the web tracker (`TRACKING_CONFIG` in `src/lib/geo.ts`): at most every 5 s while moving, a 60 s heartbeat while still, movements under 8 m ignored. |
| Data | The Firestore REST API writes the **same documents as the web app**: a `trackers/{id}/points/*` point plus the summary on `trackers/{id}` (last location, battery, motion, device, IP, status), in one atomic commit. No Firebase Android SDK or `google-services.json` is needed, and the existing `firestore.rules` already allow these writes. |
| Offline | Fixes are queued on the phone (up to 500) and uploaded in order when the connection returns. |
| SOS | Writes the same `sos` field as the web SOS button. The app checks every 15 s for the owner's **Acknowledge** and shows a notification. |
| Status | Start, Pause and Stop set the tracker's `status` to `active`, `paused` or `stopped`, which the dashboard shows. |
| Always on | The service is sticky, so Android restarts it after a kill. A boot receiver restarts it after a reboot or update, and a WorkManager watchdog checks every 15 minutes. Pausing or stopping turns all of these off. Android's *Force stop* is the only thing that stops it without the app, until the app is next opened. |

Chat with the console isn't in the app yet. Use the web tracker page if you need it.

## Build

Requirements: JDK 17+ and the Android SDK (API 35). Android Studio provides both.

```bash
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest lintDebug
```

The console URL and Firebase project are Gradle properties in `gradle.properties`. Override them if you deploy your own copy:

```bash
./gradlew assembleRelease \
  -PgeotrackerWebUrl=https://you.github.io/GeoTracker \
  -PgeotrackerFirebaseProjectId=your-project \
  -PgeotrackerFirebaseApiKey=your-web-api-key
```

The URL is used for the "Open console" button and for opening tracking links with the app. The project ID and API key must match the web app's Firebase config.

### Release signing

Without a keystore, release builds are signed with the debug key so they still install. The Pages deploy caches that key so each published APK updates the previous one; the separate Android CI workflow does not, so its artifacts can't update each other (uninstall first). To sign properly, add these repository secrets: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 release.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.

### Live test

`FirestoreClientTest.liveWritesAreAcceptedByRules` runs the full write path (create tracker, fix, status, SOS) against the real Firestore project and its rules. It creates a throwaway unowned tracker, so it only runs when you ask for it:

```bash
GEOTRACKER_LIVE_TEST=1 ./gradlew testDebugUnitTest --tests '*liveWrites*'
```
