# Status

What exists as of 2026-10-19, stated as **code that runs** rather than as intent. The build
plan is [13 steps](./build/README.md); the product contract is [PRD.md](../PRD.md).

**One step is shipped, two are in flight, ten have not been started.** The app installs,
opens in airplane mode and reports what the phone will give it. The data layer is written
and tested but has never been opened on a phone. Nothing the PRD promises a user — log a
find, drop a pin, take a photo — is on a screen yet: every feature screen is still a
placeholder naming the step that brings it.

| Step | State | Evidence |
| --- | --- | --- |
| [00](./build/00-scaffold-and-installable-shell.md) Installable shell | **Shipped** | `main`, deployed, live |
| [01](./build/01-data-layer.md) Data layer | **Built, not accepted** | committed, 408 tests passing, never opened on a phone |
| [02](./build/02-map-gps-and-the-first-pin.md) Map + GPS + first Pin | **Groundwork only** | support modules committed, no map on screen |
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

Committed: `src/db/`, `src/units/`, `src/components/DatabaseTools.tsx`,
`scripts/make-jpeg-fixture.mjs`, the `dexie` / `dexie-react-hooks` / `uuid` dependencies, and the
edits to `src/main.tsx` and `src/screens/DiagnosticsScreen.tsx`. What is outstanding is the phone
gate, not the code: no acceptance criterion is ticked, because none has been run on hardware
([rule 1](./build/README.md)).

**Schema** (`src/db/schema.ts`): 13 stores — `finds`, `items`, `photos`, `photoBlobs`,
`sites`, `landowners`, `permissions`, `sessions`, `trackPoints`, `detectors`, `presets`,
`tombstones`, `meta`. Two versions registered; v2 adds `updatedAt` plus a
`[deletedAt+updatedAt]` index to the three busiest stores, with a backfill, so step 11's
incremental export has a tested upgrade path instead of an assumed one. Positions are
metres, times are UTC epoch milliseconds, and Find and Session store no local offset — a
deliberate departure from R-UNIT-4, recorded in the step doc's Deviations section rather than
slipped past it. `readSchemaVersion` reports the Dexie number, not the raw IndexedDB one.

**Types** (`src/db/types.ts`): one interface per glossary entity, `SCALE_CEILING` pinned to
PRD §11, `LIVE = 0` as the not-in-the-Bin sentinel.

**Repositories** (`src/db/repos/`): `finds`, `items`, `photos`, `sites` + `landowners` +
`permissions`, `sessions`, `trackPoints`, `detectors`, `meta`, `bin`, wired by
`createRepositories`. No component touches Dexie directly — that is the seam keeping
ADR-0003's sqlite-wasm escape hatch real. Cascade rules are enforced, and deleting a Site or
Session that still contains Finds throws a typed `DeleteBlockedError` the UI can react to
(R-EDIT-3). The Bin delegates cascades to the owning repository rather than repeating them,
and `purgeOlderThan` implements the 30-day window (R-EDIT-2, R-EDIT-4) and runs at app start:
`runStartupMaintenance` in `src/db/startup.ts`, called from `src/main.tsx` after the first
paint, reporting a failure rather than throwing one.

One rule decides which Items describe a Find: `itemsBelongingTo` in `repos/common.ts` counts
the live Items *plus* the ones the Bin took down because their Find went with it, and
`deriveFromItems` is the only caller that decides. An Item binned in its own right has stopped
describing its Find, which is what makes deleting the last Item turn it into a Miss (R-EDIT-2);
an Item carried down with its Find has not, so a Find in the Bin keeps its `itemCount`, its
Category and its pin colour, and `finds.restore` returns a record that still says what was
recovered. `finds.refresh`, `items.refreshFind`, `items.categoryOf` and the seeder all read
through that one rule, so the Bin list, the popup card and the map cannot disagree about what a
Find was.

**Filter API** (`src/db/filter.ts`): `queryFinds`, `countFinds` and `needsDetailQueue` behind one
`FindFilter` covering the whole PRD §12 filter sheet — Site, Session, date range, Category,
silver/gold, Date On year range, hide-Misses, needs-detail, free-text search across Find, Item,
Site and Landowner names. Runs in two halves: Item-side and name-side predicates produce an id
set, Find-side predicates pick rows off an index, and the halves are joined only when both have
something to say. Two rules it exists to get right, each now pinned by a test after both were
found broken: every range is closed at both ends (`src/db/ranges.ts` → `betweenClosed`, because
Dexie's `between` is open at the top by default), and search is never a gate on its own — a word
may match the Find's note, its Site's name, its Landowner's name, or any one field of any of its
Items, and the words need not come from one Item. Index choice is deliberately modest, because at
5,000 live Finds a scan costs single-digit milliseconds and readable rules matter more than the
last 5 ms.

**Live queries** (`src/db/liveQueries.ts`, build item 5): `useFinds`, `useFindCount`, `useFind`,
`useItemsOfFind`, `usePhotosOfOwner`, `useNeedsDetail`, `useNeedsDetailCount`,
`useFindCountsBySite` (R-STATS-1) and `useLiveFindCount`, all over `dexie-react-hooks`'
`useLiveQuery`. Nothing imports them yet, because step 01 ships no screens; step 03 is where
they get used and therefore verified.

**Units** (`src/units/units.ts`): every conversion in ADR-0006, plus parsers that accept what
a human types (`6`, `6"`, `6 in`) and formatters that round to the precision typed. Depth is
inches only. No component may multiply by a constant.

**Seeder** (`src/db/seed.ts`): deterministic (mulberry32), chunked writes so 500,000 Track
points do not blow up a phone's memory, progress callback per store. `FULL_SEED` is the PRD
§11 ceiling — 5,000 Finds, 12,000 Items, 15,000 photos, 30 Sites, 500 Sessions, 500,000
Track points — and every one of those photos gets a real JPEG, because `Photo.bytes` is a claim
about what is in `photoBlobs` and an estimate built out of bytes nobody wrote is not a
measurement. The images are one checked-in 160×120 baseline JPEG (`src/db/jpegFixture.ts`,
regenerated by `scripts/make-jpeg-fixture.mjs`) padded with JPEG comment segments to the exact
size the plan asks for, with per-photo payload so two photos of the same size are not the same
bytes. The size is a dial on the Diagnostics card: 40 KB per photo is §11's typical (~600 MB
across the ceiling), 150 KB is its worst case (~2.3 GB). `clearAllData`, `countRows` and
`storageReport` exist for the Diagnostics readout. Its Find rows are derived by
calling `deriveFromItems` rather than by recomputing the fields, so the seeded database says
the same thing about a Find as the repositories would — a difference the tests check row by row.

**Diagnostics card** (`src/components/DatabaseTools.tsx`, build item 8): seed a sample or the
full ceiling, clear everything, run the benchmark, and print every number as text — per-store row
counts and stage timings, the three PRD §11 query timings against their ceilings
(`src/db/benchmark.ts`: `runBenchmarks`, `benchmarkReportText`), the photo size dial, and the
image bytes actually written against PRD §11's photo budget. The last benchmark report is kept in
`meta`, so the numbers survive a reload and can be copied off a phone. The card is not behind
`import.meta.env.DEV`, because the build a phone runs is the deployed one.

**Still missing from step 01:**

- The phone gate, which is all seven acceptance criteria. Seed the ceiling in under 60 s, filters
  under 100 ms, search over 12,000 Items under 300 ms, the storage estimate reported, data intact
  after an airplane-mode restart, a thirty-day-old Bin entry gone after a restart, and v1 opening
  under v2. `src/db/benchmark.ts` runs the three named queries against their ceilings and reports
  pass or fail, and the Diagnostics card puts it one tap away — but no numbers exist, because no
  phone has run it yet.
- **`src/db/liveQueries.ts` has no test.** It is a thin wrapper over `useLiveQuery` and the filter
  API, both of which are tested, and the repo's rule is that screens are verified by hand; the
  hooks are verified when step 03 puts them on one.
- **Whether `navigator.storage.estimate()` agrees with the seeded bytes.** The card prints the
  image bytes it wrote and the capability table prints the phone's estimate; comparing them is the
  phone measurement that makes the 40 KB dial worth having.

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

`npm test` → **27 files, 408 tests, all passing**, all under `fake-indexeddb`, 0.7 s.

| Area | Files | Tests |
| --- | --- | --- |
| `src/db/repos` | 10 | 200 |
| `src/db` (schema, seed, filter, benchmark, startup, JPEG fixture) | 6 | 73 |
| `src/units` | 1 | 29 |
| `src/diagnostics` | 3 | 35 |
| `src/router` | 2 | 26 |
| `src/platform` | 2 | 20 |
| `src/storage`, `src/session`, `src/updates` | 3 | 25 |

No component tests. That is deliberate ([rule 3](./build/README.md)): logic is tested,
screens are verified by hand on a phone.

## To check any of this yourself

```bash
npm test                      # the 408
git log --oneline -3          # step 01, then the step 02 groundwork under it
npm run build && npm run preview   # the shell, installable locally over HTTPS-less localhost
```

## Next, in order

1. Push step 01 to `main` so the deploy workflow builds it, then run its phone gate, write the
   numbers down, and tick the acceptance criteria — the same order step 00 went in, and the reason
   step 00 is "deployed and awaiting sign-off". Start the seed with the photo dial low and raise it
   once the row counts are proven.
2. Settle the R-UNIT-4 question: either amend the PRD to match a data layer that stores UTC only,
   or add `utcOffsetMinutes` to Find and Session as a schema version. Leaving the PRD and the code
   disagreeing is how a later step ends up writing a third answer.
3. Close the remaining [rule 3](./build/README.md) gaps: the `src/gps` and `src/map` arithmetic
   that has no tests yet.
4. Build the step 02 map component, with tests for the arithmetic that already exists.
