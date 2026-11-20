# 📍 GeoTracker

[![CI](https://github.com/AshenWijesingha/GeoTracker/actions/workflows/ci.yml/badge.svg)](https://github.com/AshenWijesingha/GeoTracker/actions/workflows/ci.yml)
[![Deploy](https://github.com/AshenWijesingha/GeoTracker/actions/workflows/deploy.yml/badge.svg)](https://github.com/AshenWijesingha/GeoTracker/actions/workflows/deploy.yml)

GeoTracker is a real-time location sharing app that runs in the browser and can be installed as a PWA. Location is only shared after the person agrees to it. It is built with **Next.js 15**, **React 19**, **Leaflet** and **Firebase** (Firestore and Auth), and it deploys as a static site, for example on GitHub Pages, with no server to run.

Version 3 adds the features of [Realtime-Location-Tracker](https://github.com/mahmud-r-farhan/Realtime-Location-Tracker): live maps with several map styles, battery-aware adaptive tracking, SOS alerts, fleet battery monitoring, chat and PWA offline support. Here they run on Firestore realtime listeners instead of a Socket.IO server.

![Dashboard Screenshot](https://github.com/user-attachments/assets/52e1a35e-0817-4358-9c0a-046312fbd4fd)

> [!IMPORTANT]
> **Safety and privacy**
> - **This is not an emergency service.** SOS only alerts the owner of the tracker on their dashboard. It does not contact 911, 112 or any other emergency dispatch. In a real emergency, call your local emergency number.
> - **The tracking link works like a password.** Anyone who has a tracker's link can see its location. Share links only with people you trust, and only track people who have agreed to it.

---

## ✨ Features

### Real-time tracking (device side: `/track/?id=…` and `/tracker`)
- **Consent first:** the page lists exactly what will be shared (location, battery, device and IP) before sharing starts.
- **Adaptive, battery-friendly updates:** a single `watchPosition` stream sends an update every **5 s while moving** and a **60 s heartbeat while still**.
  - Movements under **8 m** count as GPS jitter and are not sent.
  - Fixes much worse than the previous one are skipped.
  - The accelerometer switches tracking back to "moving" as soon as the phone moves.
- **Pause / Resume / Stop** at any time. The choice is remembered when the page reloads.
- **Offline queue:** Firestore's IndexedDB cache stores fixes recorded without signal and syncs them when the connection returns.
- **Keep screen awake:** an optional toggle (Screen Wake Lock API) keeps updates reliable on phones.
- **Live map** of the device's own position, accuracy circle and session trail. It also shows fix age, speed, battery and sync status.
- **SOS button:** hold for 2 seconds to send, which prevents accidental alerts. It works with touch, mouse and keyboard and vibrates as feedback. The person can cancel it with "I'm safe".
- **Chat** with the tracker owner.

### Dashboard (`/dashboard`)
- **Realtime updates** through Firestore `onSnapshot` listeners. They replace the old 10-second polling, so updates appear instantly and no reads are wasted.
- **Live map of all trackers**, with a colour per status (live, paused, offline, SOS) and the selected tracker's trail and accuracy radius.
  - **7 map styles:** Dark, Streets, Satellite, Light, Voyager, Topographic and Esri Streets. The last one used is remembered.
  - **Fit all** and **Follow** controls.
  - A warning with a retry button appears when the map tiles fail to load.
- **Overview cards:** total trackers, live now, active SOS alerts and low-battery devices.
- **SOS alerts:** a flashing banner, a siren generated with Web Audio (no sound files), a browser or service-worker notification, mute, **Acknowledge**, and "Show on map".
- **Battery monitoring:** level and charging state for every device, with alerts at **≤ 20 %** (low) and **≤ 10 %** (critical).
- **Per-tracker details:**
  - Last seen, accuracy, motion, device, screen and IP address.
  - **Trip statistics:** distance, duration, average and maximum speed (jitter and outliers are filtered out).
  - Location history table with "Show more" paging.
  - **Export to CSV, JSON or GPX.**
  - Clear history or delete the tracker, including all of its points and messages.
- **Chat** with each tracked device. You get a notification when the device replies.
- **Share links:** native share sheet on mobile, copy to clipboard, or show the link as a **QR code**. The QR code is generated in the browser (the link is never sent to a QR service) and can be saved as a PNG or printed. Scan it with a phone camera to open the link, or with the Android app to pair it.
- **Link an existing tracker:** paste a Quick Track session ID or a tracking link to add it to your account.
- **Search** the tracker list by name, ID, OS or browser.

### Get the app (`/download`)
- **One-tap APK download from your own site.** Every deploy builds the Android app and publishes it at `/downloads/GeoTracker.apk`, with its version, size and SHA-256 checksum.
- **Adapts to the visitor's device:** Android gets the download and install steps, iPhone gets "Add to Home Screen" steps, and a computer gets a QR code to open the page on a phone.
- **Set up in three steps** guide: create a tracker, connect the phone, start sharing.
- Android visitors on a tracking link see a prompt to use the app for background sharing.

### Design
- **Light and dark themes** that follow the system, with a Light / Dark / System switch. The map style follows the theme too.
- **One design system** (`src/styles/globals.css`): colour, type, spacing, radius, elevation and motion tokens, plus shared buttons, inputs, cards, badges, alerts and tabs. See [docs/DESIGN_SYSTEM.md](./docs/DESIGN_SYSTEM.md).
- Inter for text, JetBrains Mono for coordinates and IDs, and [Lucide](https://lucide.dev) icons.

### Platform
- **Installable PWA** with a manifest, PNG, maskable and Apple icons, shortcuts, a service worker that caches static files, and an offline fallback page.
- **Accessibility:** works with the keyboard, has visible focus rings, uses `aria-live`/`role=alert` for status updates, and respects `prefers-reduced-motion`.
- **Responsive design:** the layout is tested at phone width, and buttons and other tap targets are at least 44 px.
- **Firestore security rules** limit the data and validate every point and message (see below).
- **CI:** type checking, unit tests and a production build on Node 20 and 22, plus an Android build (`.github/workflows/android.yml`).

### Android app (`android/`)
- **Shares all the time once turned on**: in the background, with the screen off, after the app is swiped away, and after reboots and app updates. A watchdog restarts it if Android stops it. It runs as a foreground service, and the notification Android requires stays visible while it runs, with **Pause** and **Stop** buttons.
- **Guided always-on setup:** after **Start**, the app asks for location access *Allow all the time* and an exemption from battery optimisation. The sharing card shows whether both are done.
- **Pair by scanning the dashboard's QR code**, pasting a tracking link, opening a tracking link with the app, or creating a **Quick Track ID**.
- Reports to the **same console** as the web tracker: location, accuracy, speed, heading, battery, motion, device model and status (live, paused, stopped). It writes the same Firestore documents, so the dashboard, alerts, statistics and exports work unchanged.
- Uses the **same adaptive policy** as the web tracker: 5 s while moving, a 60 s heartbeat while still, 8 m jitter filter. It switches to low-power location while still.
- **Offline queue** stored on the phone; queued fixes are uploaded in order when the connection returns.
- **SOS** (hold for 2 s), with a notification when the owner acknowledges it on the dashboard.

---

## 🚀 Quick start

```bash
git clone https://github.com/AshenWijesingha/GeoTracker.git
cd GeoTracker
npm ci
npm run dev          # http://localhost:3000
```

Then **deploy the Firestore rules once** (required for history and chat):

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project geotrackerpro-e3149
```

See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for full instructions on setting up Authentication and Firestore.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Static export into `out/` |
| `npm run typecheck` | TypeScript `--noEmit` |
| `npm test` | Unit tests (Vitest) for geo math, stats, exports and status logic |
| `npm run check` | Typecheck and tests (also run before deploying) |

### Environment variables

All of these are optional. The built-in config points at the default Firebase project. See `.env.local.example`.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` | Use your own Firebase project |
| `NEXT_PUBLIC_BASE_PATH` | Sub-path deployments, e.g. `/GeoTracker` on GitHub Pages |

---

## 📖 How to use

1. **Sign in** with email and password, or continue as a guest.
2. **Create a tracker** on the dashboard and send its link with **Share** or **Copy**.
3. The person who opens the link sees what will be shared, taps **Start sharing**, and grants location permission.
4. Watch them live on the map. Select the tracker to see the trail, statistics, history, exports and chat.
5. Click **🔔 Enable alerts** once to get SOS and low-battery notifications even when the tab is in the background.

**Android app:** open **Get the app** on the dashboard (or `/download` on your site) on the phone and tap **Download APK**. After installing, tap **Scan QR code**, scan the tracker's **QR code** on the dashboard, then tap **Start**. The phone appears on the dashboard like any other tracker. See [android/README.md](./android/README.md) for details.

**Quick Track** (`/tracker`) shares the current device without creating a tracker first. To watch it, copy its session ID into **Link an existing tracker** on any dashboard.

> Browsers only allow geolocation, wake lock, notifications and service workers on **HTTPS** (or on `localhost`).

---

## 🏗️ Architecture

```
 Tracked device (/track)                     Firestore                         Owner (/dashboard)
 ┌───────────────────────┐   batch write    ┌──────────────────────────┐   onSnapshot   ┌──────────────────────┐
 │ watchPosition + motion│ ───────────────▶ │ trackers/{id}  (summary) │ ─────────────▶ │ tracker list + map   │
 │ adaptive throttling   │   (2 writes/fix) │   lastLocation, battery, │                │ SOS / battery alerts │
 │ battery, SOS, chat    │                  │   status, sos, device    │                │                      │
 │ IndexedDB offline q.  │                  │ trackers/{id}/points/*   │ ─────────────▶ │ trail, stats, export │
 └───────────────────────┘ ◀──────────────▶ │ trackers/{id}/messages/* │ ◀────────────▶ │ chat                 │
                                   chat     │ users/{uid}              │                └──────────────────────┘
                                            └──────────────────────────┘
```

### Data model (v3)

| Path | Contents |
| --- | --- |
| `trackers/{id}` | `name`, `userId`, `created`, `status` (`active` / `paused` / `stopped`), `lastLocation`, `lastSeen`, `locationCount`, `battery`, `motion`, `device`, `ip`, `sos` |
| `trackers/{id}/points/{auto}` | `latitude`, `longitude`, `accuracy`, `timestamp`, `speed`, `heading`, `altitude`, `battery` |
| `trackers/{id}/messages/{auto}` | `text`, `sender` (`owner` / `device`), `senderName`, `createdAt` |
| `users/{uid}` | profile and last login |

**Why it changed:** v2 added every fix, together with the full device info and IP, to an array inside the tracker document.

- That document grew until it reached Firestore's **1 MiB limit** (about 3,000 fixes).
- Every 10-second poll downloaded the whole document again.

v3 moves the history into a sub-collection:

- The tracker summary stays small.
- Dashboard listeners receive only the changes.
- Device info and IP are sent **once per session**, and battery is sent only when it changes.

**Legacy data is still shown:** the old embedded `locations` arrays are merged into the history view automatically.

### Project structure

```
src/
├── app/
│   ├── dashboard/        Dashboard (realtime map, alerts, stats, chat, export)
│   ├── download/         Get the app: APK download, install and setup guide
│   ├── login/            Email/password + guest sign-in
│   ├── track/            Tracking link page (?id=…)
│   ├── tracker/          Quick Track (self-generated session)
│   ├── users/            Realtime user registry
│   └── layout.tsx        Metadata, PWA manifest/icons, SW registration
├── components/
│   ├── LiveMap.tsx       Leaflet map: layers, markers, accuracy, trail, fit/follow
│   ├── LiveTracker.tsx   Device-side UI (consent, status, controls, SOS, chat)
│   ├── SosButton.tsx     Hold-to-trigger SOS
│   ├── ChatPanel.tsx     Realtime owner ↔ device chat
│   ├── QrCodeDialog.tsx  Show a link as a QR code (save PNG / print)
│   ├── ui/               App header, brand, theme switch, status badge, QR image
│   └── PwaRegister.tsx   Service worker registration
├── lib/
│   ├── firebase.ts            Firebase init (persistent offline cache)
│   ├── firebase-services.ts   Firestore reads/writes + realtime subscriptions
│   ├── use-live-tracking.ts   Adaptive geolocation/battery/wake-lock hook
│   ├── geo.ts                 Pure helpers: haversine, stats, CSV/GPX, config
│   ├── tracker-status.ts      Live/paused/offline/SOS derivation, history merge
│   ├── alerts.ts              Web Audio siren, notifications, vibration
│   ├── theme.ts               Light / dark / system theme preference
│   ├── platform.ts            Android / iOS / desktop detection
│   └── auth-context.tsx       Firebase Auth context
public/
├── manifest.json, sw.js, offline.html, icons/
src/styles/globals.css         Design tokens and shared components
tests/                         Vitest unit tests
android/                       Android app (Kotlin foreground service)
firestore.rules                Security rules (deploy with firebase-tools)
```

### Tuning

All of these settings live in `TRACKING_CONFIG` in `src/lib/geo.ts`:

- Update interval while moving and heartbeat interval while still
- Jitter distance
- Accuracy cut-off
- Time window for "online" status
- Battery alert thresholds
- SOS hold time
- Number of history points loaded

---

## 🌐 Deployment

### Set up your own GeoTracker

1. **Fork** this repository.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Create a Firebase project, enable **Email/Password** and **Anonymous** sign-in, and put its web config in `src/lib/firebase.ts` (or the `NEXT_PUBLIC_FIREBASE_*` variables). Also set `geotrackerFirebaseProjectId` and `geotrackerFirebaseApiKey` in `android/gradle.properties`. See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md).
4. Deploy the security rules once: `npx firebase-tools deploy --only firestore:rules --project <your-project>`.
5. Push to `main`. The site is published at `https://<you>.github.io/<repo>/`, and the app at `…/download/`.
6. *(Recommended)* Add a release signing key so app updates always install over the previous version. Add these repository secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. To create a key:
   ```bash
   keytool -genkeypair -v -keystore release.jks -alias geotracker -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 release.jks   # value for ANDROID_KEYSTORE_BASE64
   ```
   Without these secrets, deploys reuse one cached key, which works until that cache is cleared.

### Hosting

- **GitHub Pages:** already configured. Every push to `main` runs `npm run check`, builds with `NEXT_PUBLIC_BASE_PATH=/<repo>`, builds the Android APK into `out/downloads/`, and deploys `out/`.
- **Vercel / Netlify / Firebase Hosting / any static host:** run `npm run build` and serve the `out/` directory.

---

## 🐛 Troubleshooting

| Symptom | Fix |
| --- | --- |
| `auth/configuration-not-found` | Enable Email/Password and Anonymous sign-in. See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) |
| "History unavailable" / "Chat is unavailable" | Deploy the latest `firestore.rules` |
| "Insufficient permissions" on the dashboard | Deploy the latest `firestore.rules` |
| Location denied | Allow location for the site in browser settings, then press **Retry** |
| Updates stop when the phone screen locks | Browsers pause background pages. Turn on **Keep screen awake** and keep the page open |
| Map is blank | A tile provider is blocked or down. Press **Retry** or pick another map style (top-right layer button) |
| No notifications | Click **🔔 Enable alerts**. On iOS, install the app to the Home Screen first |

---

## 📄 License

MIT. Use GeoTracker only for tracking that people have agreed to, such as family safety, finding your own devices or fleets with informed drivers. You are responsible for following local privacy laws.
