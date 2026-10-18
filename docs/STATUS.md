# Status

What exists as of 2026-10-18, stated as **code that runs** rather than as intent. The build
plan is [13 steps](./build/README.md); the product contract is [PRD.md](../PRD.md).

**One step is shipped, two are in flight, ten have not been started.** The app installs,
opens in airplane mode and reports what the phone will give it. The data layer is written
and tested but has never been opened on a phone. Nothing the PRD promises a user — log a
find, drop a pin, take a photo — is on a screen yet: every feature screen is still a
placeholder naming the step that brings it.

| Step | State | Evidence |
| --- | --- | --- |
| [00](./build/00-scaffold-and-installable-shell.md) Installable shell | **Shipped** | `main`, deployed, live |
| [01](./build/01-data-layer.md) Data layer | **Built, not accepted** | untracked in git, 325 tests, 1 failing |
| [02](./build/02-map-gps-and-the-first-pin.md) Map + GPS + first Pin | **Groundwork only** | support modules, no map on screen |
| 03–12 | Not started | screens render `Placeholder` |

A step is only *accepted* when its acceptance criteria and its "verify on a phone" list have
been run on real hardware ([rule 1](./build/README.md)). **No step's checkboxes are ticked,
including step 00's.** Step 00 is deployed and the README carries the install procedure, but
the repo holds no signed-off record of the phone run. Treat "shipped" as "deployed and
awaiting its sign-off", not as "verified".

## Step 00 — shipped

On `main` and live at <https://jr12866.github.io/DetectorFinds/>. Pushing to `main` runs
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml): tests, build, Pages.

What is in it:

| Area | Where | What it does |
| --- | --- | --- |
| PWA | `vite.config.ts`, `public/icons/` | `vite-plugin-pwa` `generateSW`, prompt-on-update, precache shell only. Base path and manifest scope both follow the repo name |
| Routing | `src/router/` | Hash routing, route table, active-tab resolution, deep links survive a hard reload |
| Shell | `src/App.tsx`, `src/components/BottomNav.tsx` | Header, one routed screen, five tabs. Detail routes exist for `/finds/:id`, `/sessions/:id`, `/sites/:id`; an unknown hash path gets a way home |
| Diagnostics | `src/screens/DiagnosticsScreen.tsx`, `src/diagnostics/` | Capability table (service worker, IndexedDB, geolocation, wake lock, File System Access, persistence, storage estimate), raw copyable dump, re-request persistence, a test value that must survive a refresh, a simulated Session flag to exercise the update guard |
| Persistence | `src/storage/` | First-run request for persistent storage with a plain-language reason; a refusal is not fatal |
| Updates | `src/updates/updatePrompt.ts`, `src/components/UpdatePrompt.tsx` | Refresh toast, suppressed while a Session is open |
| Session flags | `src/session/` | `sessionOpen` / `trackActive` store, so step 05 has a real flag to set |
| Degradation | `src/platform/` | Android/iOS/desktop detection, iOS banner, no crash on desktop |

## Step 01 — built, not accepted

Written but **untracked**: `src/db/`, `src/units/`, plus `dexie`, `dexie-react-hooks`,
`leaflet`, `uuid` in `package.json`. Roughly a day of work sitting outside git, which breaks
[rule 2](./build/README.md) — a step is not finished until it is committed and deployable.

**Schema** (`src/db/schema.ts`): 13 stores — `finds`, `items`, `photos`, `photoBlobs`,
`sites`, `landowners`, `permissions`, `sessions`, `trackPoints`, `detectors`, `presets`,
`tombstones`, `meta`. Two versions registered; v2 adds `updatedAt` plus a
`[deletedAt+updatedAt]` index to the three busiest stores, with a backfill, so step 11's
incremental export has a tested upgrade path instead of an assumed one. Positions are
metres, times are UTC epoch ms with `utcOffsetMinutes` (R-UNIT-2, R-UNIT-4). `readSchemaVersion`
reports the Dexie number, not the raw IndexedDB one.

**Types** (`src/db/types.ts`): one interface per glossary entity, `SCALE_CEILING` pinned to
PRD §11, `LIVE = 0` as the not-in-the-Bin sentinel.

**Repositories** (`src/db/repos/`): `finds`, `items`, `photos`, `sites` + `landowners` +
`permissions`, `sessions`, `trackPoints`, `detectors`, `meta`, `bin`, wired by
`createRepositories`. No component touches Dexie directly — that is the seam keeping
ADR-0003's sqlite-wasm escape hatch real. Cascade rules are enforced, and deleting a Site or
Session that still contains Finds throws a typed `DeleteBlockedError` the UI can react to
(R-EDIT-3). The Bin delegates cascades to the owning repository rather than repeating them,
and `purgeOlderThan` implements the 30-day window (R-EDIT-2, R-EDIT-4).

**Filter API** (`src/db/filter.ts`): one `FindFilter` covering the whole PRD §12 filter sheet
— Site, Session, date range, Category, silver/gold, Date On year range, hide-Misses,
needs-detail, free-text search across Find, Item, Site and Landowner names. Runs in two
halves: Item-side and name-side predicates produce an id set, Find-side predicates pick rows
off an index. Index choice is deliberately modest, because at 5,000 live Finds a scan costs
single-digit milliseconds and readable rules matter more than the last 5 ms.

**Units** (`src/units/units.ts`): every conversion in ADR-0006, plus parsers that accept what
a human types (`6`, `6"`, `6 in`) and formatters that round to the precision typed. Depth is
inches only. No component may multiply by a constant.

**Seeder** (`src/db/seed.ts`): deterministic (mulberry32), chunked writes so 500,000 Track
points do not blow up a phone's memory, progress callback per store. `FULL_SEED` is the PRD
§11 ceiling — 5,000 Finds, 12,000 Items, 15,000 photos, 30 Sites, 500 Sessions, 500,000
Track points. Photo *metadata* is seeded at full scale because that is what the benchmarks
read; only a sample carries bytes, because 15,000 × 1.5 MB is 22.5 GB. `clearAllData`,
`countRows` and `storageReport` exist for the Diagnostics readout.

**Still missing from step 01:**

- The `liveQuery` hooks (build item 5). No `useLiveQuery` anywhere in `src/`.
- The Diagnostics seed / clear-all / benchmark UI (build item 8). Without it, acceptance
  criteria 2–6 cannot be measured at all — they are timed, not eyeballed.
- All six acceptance criteria, which are phone-gated: seed the ceiling in under 60 s,
  filters under 100 ms, search over 12,000 Items under 300 ms, storage estimate reported,
  data intact after an airplane-mode restart, v1 opens under v2.
- **Untested logic.** There is no `sites.test.ts`: the Site, Landowner and Permission
  repositories have no tests of their own. `ringAreaSqM` and `ringIsClosed` (arithmetic),
  permission expiry against `expiresOn` (date logic) and `plssTownship` lookup are covered
  nowhere, which [rule 3](./build/README.md) requires. The blocked-delete path *is* covered,
  from `finds.test.ts` (`site-has-finds`) and `sessions.test.ts`.
- **One failing test**: `src/db/seed.test.ts:233` expects 10 Misses at
  `smallSeed({ finds: 40, missRatio: 0.25 })` and gets 12. The seeder is what every number in
  this step is measured against, so it has to be honest before any timing is written down.
  Note also that CI runs `npm test` before deploying: committing step 01 as it stands turns
  the build red.

## Step 02 — groundwork only

Support modules exist; the map does not. `MapScreen` still renders a placeholder.

| Module | State |
| --- | --- |
| `src/map/basemaps.ts` | The three USGS layers from ADR-0004, id lookup, tile URL and cache key, `tileCountForBounds`, zoom bounds 6–19 against a native max of 16 |
| `src/map/tiles.ts` | `BasemapLayer` extending Leaflet's `TileLayer` with grey no-tile handling and a retry cap (R-MAP-10) |
| `src/map/pinIcon.ts` | Canvas pin styles, hollow Miss, placed/selected colours, cluster icon, heading-aware user-location icon. One Category until step 07 owns the real list |
| `src/gps/position.ts` | `GpsFeed` (`watchPosition`, high accuracy), `PositionAverager` for R-GPS-3, stale-after-8s and poor-after-25 m rules, heading smoothing |
| `src/gps/compass.ts` | `DeviceOrientationEvent` heading, iOS permission gate that does not throw on Android |

None of it is imported by a screen, and **`src/gps` and `src/map` have no tests**, which
breaks [rule 3](./build/README.md): `PositionAverager`, `smoothHeading`, `isStale`,
`tileCountForBounds` and `pinColourForCategory` are all pure arithmetic and all testable
today. Missing: the Leaflet map component, the basemap control, follow mode and recenter,
"Log find" and "add pin by hand", pin popups, move-pin mode, distance readouts, per-Site
zoom and centre persistence.

## Steps 03–12 — not started

Find editor and photos, the Bin screen, Sessions and Track, Sites and Boundaries, Items and
classification, lists and filters and statistics, Field/Home modes, offline maps, export and
import, the landowner report. The data layer already carries fields these steps need —
`needsDetail`, `positionSource`, `Boundary`, `plssTownship`, `tombstones` — so nothing here
should force a schema change, but that is a claim the step itself has to re-check.

## Tests

`npm test` → **22 files, 325 tests, 1 failing**, all under `fake-indexeddb`, 0.8 s.

| Area | Files | Tests |
| --- | --- | --- |
| `src/db/repos` | 9 | 170 |
| `src/db` (schema, seed) | 2 | 20 |
| `src/units` | 1 | 29 |
| `src/diagnostics` | 3 | 35 |
| `src/router` | 2 | 26 |
| `src/platform` | 2 | 20 |
| `src/storage`, `src/session`, `src/updates` | 3 | 25 |

No component tests. That is deliberate ([rule 3](./build/README.md)): logic is tested,
screens are verified by hand on a phone.

## To check any of this yourself

```bash
npm test                      # the 325
git status --short            # step 01 is the untracked src/db, src/gps, src/map, src/units
npm run build && npm run preview   # the shell, installable locally over HTTPS-less localhost
```

## Next, in order

1. Fix the seeder's Miss ratio.
2. Add the `liveQuery` hooks and the Diagnostics seed / clear / benchmark UI.
3. Run step 01's phone gate and write the numbers down; tick its acceptance criteria.
4. Commit and deploy step 01.
5. Build the step 02 map component, with tests for the arithmetic that already exists.
