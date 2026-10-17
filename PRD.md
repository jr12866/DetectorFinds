# DetectorFinds — Product Requirements

Working title: **DetectorFinds**. Not a brand decision; rename freely.

This document is the contract. Every build step in [`docs/build/`](./docs/build/) traces back to
requirement IDs in here. If a step needs something not in here, the step is wrong or this document
is — fix the document first, in the open, before writing code.

Domain words are not defined here. They are defined once in [`GLOSSARY.md`](./GLOSSARY.md) and code,
UI copy, tests and docs must use them exactly. Decisions that constrain the whole design live in
[`docs/adr/`](./docs/adr/).

---

## 1. What this is

An offline-first web app, installed on one Android phone, for logging metal-detecting finds.

The core loop, and the reason the app exists:

1. You are standing in a field with a metal detector.
2. You dig something up.
3. You take the phone out of your pocket, and in **under 15 seconds** you have recorded *where you
   are*, *when it happened*, and *what came out of the ground*, with a photo.
4. Months later you can point at that exact spot on a map, open the record, and see the photo, the
   coin's date, how deep it was, and which field it came from.
5. You can also answer "have I dug here before?" — including the holes where you found nothing.

Everything else in the app exists to support that loop or to make sense of its output later.

### Who it is for

One person: the user. Detecting in the United States. Their own ground, their own permissions, their
own finds. No accounts, no community, no sharing. See [ADR-0002](./docs/adr/0002-local-first-no-server.md).

### What success looks like

| Measure | Target |
| --- | --- |
| Time from app-open to a saved, geotagged, photographed Find in the field | **under 15 seconds**, reachable in 3 taps or fewer from the start screen |
| Works with the phone in airplane mode | Always. No feature except tile/photo downloads needs a network |
| Data survives an app update, a browser restart, and a phone reboot | Yes, and the user can prove it by exporting |
| A season of data (≈1,000 Finds, ≈3,000 photos) | Map stays interactive, list stays scrollable, no perceptible save lag |
| Recovery from "I wiped my phone" | One export file, restored on a fresh install |

---

## 2. Non-negotiables

These are settled and recorded as ADRs. Do not re-litigate them inside a build step.

- **Android PWA, installed in Chrome.** The app is a web app installed to the home screen. iOS and
  desktop must load without crashing and must degrade honestly, but nothing is promised to them.
  → [ADR-0001](./docs/adr/0001-android-only-pwa-target.md)
- **Local-first, no server, no accounts, no sync.** The only portability path is file export.
  → [ADR-0002](./docs/adr/0002-local-first-no-server.md)
- **Single user, single device.** No multi-user on one phone. No second device holding the same data.
- **Every step ends with an app that runs on the phone.** A step that cannot be verified on a real
  handset is not finished.
- **Nothing is thrown away.** The storage engine and the map stack are chosen in step 01 and 02 and
  everything built on top of them is kept.

---

## 3. What the platform actually gives us

Established October 2026 against live endpoints and MDN's browser-compat data. These facts shape the
design; they are not guesses.

| Capability | Status on Android Chrome | What the app does about it |
| --- | --- | --- |
| `navigator.geolocation.watchPosition` in the **foreground** | Works, good quality, gives accuracy and altitude | This is the Track's engine. [ADR-0005](./docs/adr/0005-foreground-only-track.md) |
| Geolocation when the app is **backgrounded or the screen is off** | **Stops immediately.** Chrome does not resume it; there is no web-platform background geolocation | Track visibly pauses. Never silently. [ADR-0005](./docs/adr/0005-foreground-only-track.md) |
| Screen Wake Lock | Supported | Held while a Session is open, so the screen stays on and the Track keeps running |
| File System Access pickers (`showSaveFilePicker`, `showOpenFilePicker`, `showDirectoryPicker`) | **Chrome Android 132+** | Used for rolling backups when available; falls back to a plain download everywhere else |
| `navigator.storage.persist()` / IndexedDB / Cache Storage | Supported. IndexedDB is *best-effort* until persistence is granted | Persistence is requested at first run and re-checked; quota is shown in Diagnostics |
| Per-origin storage quota | Browser policy, proportional to free disk; large enough for our ceiling by a wide margin | Design ceiling (§11) is set far below any plausible quota |
| `deviceorientation` / absolute heading | Supported on Android, but the magnetometer is unreliable next to a detector coil and needs calibration | Heading-up map is an **opt-in toggle**, never the default. North-up is the default |
| USGS The National Map raster tiles (`USGSTopo`, `USGSImageryOnly`, `USGSImageryTopo`) | Live, 256 px JPEG, `Access-Control-Allow-Origin: *`, public domain, no key, no registration | **The basemaps.** [ADR-0004](./docs/adr/0004-leaflet-usgs-raster-basemaps.md) |
| Esri World Imagery | Live and CORS-enabled, but attribution-encumbered and its terms do not clearly permit offline tile caching | Optional extra layer, off by default, **never** included in a Cached Area |
| OpenFreeMap vector tiles | Live, free, unlimited, no key, OSM data (ODbL) | Deferred. Vector basemaps are a v2 upgrade, not an MVP dependency |
| Service worker + HTTPS | Required. GitHub Pages serves HTTPS | Deployment is GitHub Pages; `base` and manifest scope must honour the subpath |

---

## 4. Shape of the app

### 4.1 Two front doors, one data layer

**Field mode** is what you use standing in a field: portrait, big targets, map-first, minimal chrome,
nothing that needs reading. **Home mode** is what you use at a desk: lists, filters, editing,
enrichment, export, reports.

They are not two apps and not two databases. They are two arrangements of the same records. A Find
created in Field mode appears in Home mode instantly and vice versa.

- **R-MODE-1** Field mode is portrait-locked in v1. No landscape layout.
- **R-MODE-2** Switching modes is one tap and preserves the map's centre and zoom.
- **R-MODE-3** Field mode never shows a control smaller than 56 px, never shows body text below
  16 px, and never requires a long-press, a hover, a drag-past-a-edge or a double-tap.
- **R-MODE-4** A **Large text** toggle in Settings scales the whole UI up one step and persists.
- **R-MODE-5** The theme is a single light, high-contrast theme in v1. No dark mode. Sunlight
  legibility outranks night comfort; dark mode is v2.

### 4.2 Configurable start screen

- **R-START-1** Settings offers a choice of what the app opens on: Field map, Home map, Recent
  Finds, Needs Detail queue, Sessions list, or Stats. Default: Field map.
- **R-START-2** The choice is stored locally and applies on every cold start.
- **R-START-3** Whatever the start screen, the "Log a find" action and the "Start session" action are
  reachable in one tap from it.

### 4.3 First run

- **R-FIRST-1** First launch runs a short guided tour of the six things that matter: the map, the
  blue dot, Log a find, Start session, Sites, Export. Skippable at any point, and replayable from
  Settings.
- **R-FIRST-2** Immediately after the tour, the app makes an explicit offer: *"Have finds from
  before? Import them."* It links to the published CSV schema
  ([`docs/CSV-IMPORT.md`](./docs/CSV-IMPORT.md)) and explains in one sentence that import replaces
  everything.
- **R-FIRST-3** First run requests persistent storage and geolocation permission, each with a
  one-line reason shown before the browser prompt. It does not ask for anything else.
- **R-FIRST-4** A Diagnostics screen (Settings → Diagnostics) shows app version, storage usage and
  quota, persistence granted, geolocation permission state, tile cache size, and whether File System
  Access is available. This exists so the user and the developer can answer "is it broken or is it
  the phone?" without a debugger.

---

## 5. The map

The map is the front door, not a decoration.

- **R-MAP-1** The map shows every **Pin** the current filter allows, coloured by **Category**, with
  **Miss**es drawn as hollow markers.
- **R-MAP-2** Tapping a Pin opens a popup card: thumbnail, category, **Date On**, **Site**, distance
  from the current position, and **Open**. "Open" opens the **Find**. There is no hover interaction
  anywhere on the map; a phone has no hover.
- **R-MAP-3** Pins cluster at low zoom with counts; tapping a cluster zooms in.
- **R-MAP-4** **Basemap** switcher with: **Imagery** (USGS NAIP, the default), **Hybrid** (imagery +
  labels and contours), **Topo** (USGS topographic). Esri World Imagery may be offered as an
  explicitly-labelled extra layer that is excluded from offline caching.
- **R-MAP-5** North-up by default. A heading-up toggle exists but is opt-in, because the detector's
  coil disturbs the compass (§3).
- **R-MAP-6** The user's position is a blue dot with a heading wedge and a translucent accuracy
  circle. The dot is driven by the same GPS service as everything else.
- **R-MAP-7** **Site Boundary** polygons are drawn as outlines; the current Site's outline is
  emphasised.
- **R-MAP-8** Old **Track**s draw as faint lines. Toggleable. Off by default below zoom 13.
- **R-MAP-9** A filter sheet over the map filters by Site, Session, date range, Category, silver,
  gold, **Date On** range, and hide-Misses. One-tap "show only this Site".
- **R-MAP-10** The map must stay interactive with 5,000 Pins on screen (§11).
- **R-MAP-11** Blank or failed tiles must not break the map, must not spin forever, and must leave
  the Pins and the blue dot working. Offline tile failure is the normal case, not an error case.

### 5.1 Cached Areas

- **R-CACHE-1** The user can cache the tiles under a Site Boundary (with a generous buffer), the
  ground around a Session's Track, or an arbitrary rectangle, for a chosen zoom range.
- **R-CACHE-2** A Cached Area reports its tile count and approximate size before downloading, and
  refuses politely when it would exceed a stated budget.
- **R-CACHE-3** Cached tiles live in Cache Storage, are covered by persistent storage, are listed in
  Settings, and can be deleted individually or all at once.
- **R-CACHE-4** Only public-domain USGS tiles may be cached. Attribution-encumbered layers are
  online-only. [ADR-0004](./docs/adr/0004-leaflet-usgs-raster-basemaps.md)

---

## 6. Logging a Find

This is the 15-second flow. It is the most important thing in the app and it is built in step 02,
before any of the supporting structure exists.

### 6.1 The minimum record

- **R-FIND-1** The minimum valid Find is: **Position**, **Date Found**, and one **Photo**. **Depth**
  is optional in the field. The free-text note is the only required field *on an Item*, and an Item
  is not required at all — a **Miss** is a complete record.
- **R-FIND-2** The field flow is: tap **Log a find** → the app is already holding a fix → tap the
  camera button → tap **Save**. Three taps.
- **R-FIND-3** A Find saved with only the minimum is flagged **Needs Detail** and appears in the
  Home-mode queue. It is not a warning and not a scold; it is a badge.
- **R-FIND-4** Nothing in the field flow may require typing to complete. Typing is always optional
  in Field mode.

### 6.2 Position at logging time

- **R-GPS-1** The collapsed **Field strip** leads with the accuracy readout — the number the user
  cares about most while standing in a field.
- **R-GPS-2** When a Find is started, the app waits for a fix rather than saving a stale or
  fabricated position. If no fix arrives, saving is blocked with an explanation, never silently
  substituted.
- **R-GPS-3** The accuracy circle is drawn around the candidate position while logging.
- **R-GPS-4** Accuracy worse than ~10 m shows a warning but still allows saving. Accuracy is stored
  and displayed forever; the app never claims more precision than it had.
- **R-GPS-5** The app samples fixes for a few seconds and offers an **averaged Position**. The
  prompt *"stand still at the hole"* appears while sampling.
- **R-GPS-6** Altitude and accuracy are recorded with the Position.
- **R-GPS-7** **Position source** is recorded as `gps`, `photo` or `hand`, and shown on the Find.
  A **Placed Pin** carries no accuracy claim.
- **R-GPS-8** A **Placed Pin** can be created by long-pressing the map — the one place a long-press
  is allowed, and it is also offered as a two-tap alternative ("Add pin here") so it is discoverable
  without knowing the gesture.

### 6.3 Photos

- **R-PHOTO-1** Photos attach to either a **Find** or an **Item**.
- **R-PHOTO-2** Both the camera and the gallery are accepted.
- **R-PHOTO-3** At ingest every photo is re-encoded to a ~1600 px JPEG plus a thumbnail. The original
  bytes are discarded. This is a storage decision, not an optimisation: it is what keeps 15,000
  photos inside the quota (§11).
- **R-PHOTO-4** EXIF is stripped, except the capture timestamp, which is kept as metadata.
- **R-PHOTO-5** If a photo carries a GPS location, the user is offered *"use this photo's location as
  this Find's Position"* — which is how old finds imported from another app get positioned.
- **R-PHOTO-6** Hard cap of **6 photos per Item**. Find photos are uncapped but warn past ~10.

---

## 7. Sessions, Tracks and detectors

- **R-SESSION-1** Starting a **Session** opens a sheet with **Site** and **Detector** pickers that the
  user chooses from. Nothing is auto-prefilled: picking the wrong Site is worse than one extra tap.
- **R-SESSION-2** Session start and stop are explicit. The app never decides when an outing begins.
- **R-SESSION-3** One Site per Session. One calendar day per Session. Detecting two Sites in a day is
  two Sessions.
- **R-SESSION-4** A **Find** may exist with no Session. Session is an association, not a requirement.
- **R-SESSION-5** If the user has been moving for ~10 minutes with no open Session, the app nags,
  and offers to backfill a Session around the positions it already saw.
- **R-TRACK-1** The **Track** samples every 3 s or 5 m of movement, whichever comes first, and is
  kept forever. Never trimmed, never downsampled.
- **R-TRACK-2** The Track draws live behind the blue dot while recording, and is replayable later.
- **R-TRACK-3** The Track pauses visibly when the app is backgrounded or the screen sleeps, and
  resumes on return, with the gap preserved as a gap. [ADR-0005](./docs/adr/0005-foreground-only-track.md)
- **R-TRACK-4** A screen wake lock is held while a Session is open, released when it stops, and
  re-acquired after an interruption. The Session sheet states plainly that this drains the battery
  and that the phone must stay awake for the Track to keep running.
- **R-TRACK-5** Tracks export as GPX, per Session and all at once.
- **R-DETECTOR-1** **Detector** is a first-class entity: make, model, coil, nickname, plus free-text
  **Settings Preset**s.
- **R-DETECTOR-2** A Session records only the Preset's **name**, never a snapshot of its values.

---

## 8. Sites, boundaries and permissions

- **R-SITE-1** A **Site** has a name, a **Landowner**, a **Ground Kind**, **Access Notes**, a **PLSS
  Reference** (township / range / section / optional quarter-quarter), and a **Site Boundary**.
- **R-SITE-2** Boundary capture supports all three methods: tap-to-trace corners, walk-the-perimeter
  using the Track, and vertex editing afterwards.
- **R-SITE-3** **Permission** is a standalone record: Landowner, date granted, optional expiry,
  free-text conditions, applied to one or many Sites. A Site shows its permission history.
- **R-SITE-4** Permission expiry warnings are **out of scope for v1** (v2).
- **R-SITE-5** Per-Site find counts are the priority statistic: "what have I found in this field".

---

## 9. Items and classification

- **R-ITEM-1** An **Item** belongs to exactly one **Find**. Re-filing an Item between Finds is
  allowed.
- **R-ITEM-2** Classification is a fixed extensible **Category** list (the user can add Categories),
  plus free-text **Sub-type**, plus free **Tags**.
- **R-ITEM-3** US coin fields: country, ruler/monarch, mint mark, denomination, composition.
- **R-ITEM-4** **Silver flag** and **Gold flag** are filterable from the map and the list, because
  "show me the silver" is asked in a field, not at a desk.
- **R-ITEM-5** **Date On** is either an exact year or free-text approximation ("3rd c. AD",
  "c. 1900?"). It is a separate field from **Date Found** and is never derived from it.
- **R-ITEM-6** Also: material, weight (oz **and** g), dimensions, **Depth** in inches, **Condition**,
  cleaning/conservation notes, identified-vs-unknown with notes.
- **R-ITEM-7** The only required field on an Item is the free-text note.
- **R-ITEM-8** **Deliberately absent: no value field and no keep/report status field.** Both were
  considered and cut. Do not add them back.

---

## 10. Editing, deleting, and the Bin

- **R-EDIT-1** Allowed edits after the fact: moving a Pin, re-filing an Item between Finds, and
  re-assigning a Find or Session to a different Site or Session.
- **R-EDIT-2** Deleting anything is a **soft delete** into the **Bin**, recoverable for 30 days, then
  purged.
- **R-EDIT-3** Deleting a Site or Session that still contains Finds is **blocked**, and the same
  dialog offers to re-parent those Finds. One dialog, one decision, no orphan records.
- **R-EDIT-4** Every record carries a modification timestamp and a UUIDv7 id; deletes leave
  tombstones. [ADR-0002](./docs/adr/0002-local-first-no-server.md)

---

## 11. Scale ceiling

The user's real usage is yearly and multi-year, rarely more than ~20 Finds in a day. The app is
designed to a ceiling chosen for headroom, not to today's data:

| Thing | Design ceiling |
| --- | --- |
| Finds | 5,000 |
| Items | 12,000 |
| Photos | 15,000 (re-encoded, ~150 KB average → ~2.3 GB worst case, ~600 MB typical) |
| Sites | 30 |
| Sessions | 500 |
| Track points | 500,000 total |

Every feature must be justified against this table. Anything that only works below it is a bug.

---

## 12. Views other than the map

- **R-LIST-1** A list of Finds with filters matching the map's filter sheet, sorted by Date Found.
- **R-LIST-2** Simple substring **search** over notes, Site and Landowner names, Category, Sub-type,
  Tags, and Date On. Home mode only. No fuzzy matching, no ranking, no stemming — adequate as-is.
- **R-STATS-1** Stats are per-Site find counts first. Broader dashboards are v2.
- **R-VIEW-SEQUENCE** Map first, list second, stats/Sites/Sessions screens late. Do not build them
  early just because they are easy.

---

## 13. Export, import, and the CSV contract

- **R-EXPORT-1** v1 exports: full backup (records + photos), photo-free backup, CSV of Items, GPX of
  Tracks.
- **R-EXPORT-2** GeoJSON export is v2.
- **R-EXPORT-3** If nothing has been exported in 30 days, the app reminds the user, once per session,
  politely, and can be dismissed.
- **R-EXPORT-4** Where File System Access is available, the user can point the app at a folder and it
  writes rolling dated backups there automatically. Where it is not, export is a download. The app
  must be honest about which mode it is in.
- **R-IMPORT-1** Import is **replace-everything**, never merge, and always shows a **preview** —
  counts of Finds, Items, photos, Sites, Sessions, and any rejected rows with reasons — before
  anything is written. [ADR-0002](./docs/adr/0002-local-first-no-server.md)
- **R-IMPORT-2** The **CSV import schema is published and documented** at
  [`docs/CSV-IMPORT.md`](./docs/CSV-IMPORT.md) so users can reformat data from other apps into it.
  Adapters for specific apps come later; the schema is the contract.
- **R-IMPORT-3** Import validates before it writes, and a failed import leaves the existing data
  untouched.

---

## 14. Landowner report

- **R-REPORT-1** A printable per-Site page: find counts, Items with photos, a map image showing the
  **Site Boundary** and the Pins, and a **general free-text notes section** for miscellaneous details
  the user wants on the page.
- **R-REPORT-2** Produced by the browser's print-to-PDF. No PDF library.

---

## 15. Updates

- **R-UPDATE-1** A new version is announced as a *"new version available — Refresh"* toast. It is
  never applied silently.
- **R-UPDATE-2** An update is never offered, and never applied, mid-Session or mid-Track.

---

## 16. Units and locale

- **R-UNIT-1** Display units: inches, ounces **and** grams, feet/yards, acres, miles, °F.
- **R-UNIT-2** Storage is SI: metres, grams, millimetres, square metres. The display layer converts.
  [ADR-0006](./docs/adr/0006-imperial-display-metric-storage.md)
- **R-UNIT-3** Depth is entered and shown in inches; it is stored in metres.
- **R-UNIT-4** Times display in local time; they are stored as UTC with the local offset captured at
  the moment of the record.
- **R-UNIT-5** The published CSV carries imperial column names (`depth_in`, `weight_oz`) because its
  audience is US hobbyists.

---

## 17. Out of scope for v1

Stated so nobody builds it by accident.

- iOS support beyond "loads and degrades honestly".
- Accounts, sync, cloud storage, shared data, multi-user, second device.
- Coin valuation data, price guides, sold-price lookups.
- Detector audio, and any Bluetooth/BLE connection to a detector.
- Legal advice about permission, public land, or the finders-keepers rules of a specific state.
- Image-based coin identification.
- Clubs, leaderboards, social sharing.
- Battery-optimisation work beyond holding the wake lock the Track needs.
- Permission expiry warnings.
- Dark mode. Landscape layouts.
- GeoJSON export, vector basemaps, fuzzy search, dashboards beyond per-Site counts.
- Adapters for other detecting apps. Only the published CSV schema.

---

## 18. How it is built

Stack, chosen by the assistant because the user has no preference, and committed in the ADRs:

- **Vite + React + TypeScript**, strict mode. `vite-plugin-pwa` (Workbox) for the manifest and the
  service worker, with `registerType: "prompt"` so updates are the user's decision (R-UPDATE-1).
- **Dexie (IndexedDB)** as the database, with `liveQuery` driving the UI.
  [ADR-0003](./docs/adr/0003-indexeddb-dexie-storage.md)
- **Leaflet** with **USGS raster tiles**, cached into Cache Storage for offline areas.
  [ADR-0004](./docs/adr/0004-leaflet-usgs-raster-basemaps.md)
- `@turf` subset for polygon maths, `fflate` for ZIP, `uuid` v7 for ids. No UI kit, no state library,
  no date library — hand-rolled where it is under a hundred lines.
- **Deploy: GitHub Pages**, manual deploy first. Public repo, MIT licence.

### Testing

- **Vitest** for the data layer and all logic: repositories, filters, unit conversion, CSV parse and
  emit, GPX, tile-math, averaged positions, import validation. `fake-indexeddb` for the database.
- **GPS and map behaviour are tested on a real Android phone** over Chrome remote debugging, with a
  mock-location app to simulate walking a boundary and driving a Track. There is no emulator
  substitute for this, and no CI gate pretends otherwise.

### Build order

Risk-first: map, live GPS, drop a pin, see it again — with the storage engine chosen in step 01 so
nothing built afterwards is thrown away. The steps are
[`docs/build/00`](./docs/build/00-scaffold-and-installable-shell.md) through
[`docs/build/12`](./docs/build/12-landowner-report-and-polish.md); each one ends with an app that
runs on the phone.

---

## 19. Still open

Small, and none of them block step 00.

1. **Name.** "DetectorFinds" is a placeholder. The GitHub repo name sets the PWA's URL scope, so
   decide before the first deploy, not after.
2. **NAIP coverage gaps.** USGS imagery is not uniformly available at high zoom everywhere. Whether
   to fall back to Esri imagery in those gaps, given its terms, is a decision to make once we see the
   real behaviour on the ground.
3. **Background tracking.** If foreground-only tracking turns out to be unacceptable in practice —
   and it may — the answer is the TWA/APK wrapper with a native location service, which is a much
   larger commitment than the rest of this document. Revisit after step 05 has been used in a real
   Session. See [ADR-0001](./docs/adr/0001-android-only-pwa-target.md) and
   [ADR-0005](./docs/adr/0005-foreground-only-track.md).
