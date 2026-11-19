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

### Command Center (`/dashboard`)
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
- **Share links:** native share sheet on mobile, or copy to clipboard.
- **Link an existing tracker:** paste a Quick Track session ID or a tracking link to add it to your account.
- **Search** the tracker list by name, ID, OS or browser.

### Platform
- **Installable PWA** with a manifest, PNG, maskable and Apple icons, shortcuts, a service worker that caches static files, and an offline fallback page.
- **Accessibility:** works with the keyboard, has visible focus rings, uses `aria-live`/`role=alert` for status updates, and respects `prefers-reduced-motion`.
- **Responsive design:** the layout is tested at phone width, and buttons and other tap targets are at least 44 px.
- **Firestore security rules** limit the data and validate every point and message (see below).
- **CI:** type checking, unit tests and a production build on Node 20 and 22.

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
│   ├── dashboard/        Command Center (realtime map, alerts, stats, chat, export)
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
│   └── PwaRegister.tsx   Service worker registration
├── lib/
│   ├── firebase.ts            Firebase init (persistent offline cache)
│   ├── firebase-services.ts   Firestore reads/writes + realtime subscriptions
│   ├── use-live-tracking.ts   Adaptive geolocation/battery/wake-lock hook
│   ├── geo.ts                 Pure helpers: haversine, stats, CSV/GPX, config
│   ├── tracker-status.ts      Live/paused/offline/SOS derivation, history merge
│   ├── alerts.ts              Web Audio siren, notifications, vibration
│   └── auth-context.tsx       Firebase Auth context
public/
├── manifest.json, sw.js, offline.html, icons/
tests/                         Vitest unit tests
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

- **GitHub Pages:** already configured. Every push to `main` runs `npm run check`, builds with `NEXT_PUBLIC_BASE_PATH=/<repo>`, and deploys `out/`.
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
