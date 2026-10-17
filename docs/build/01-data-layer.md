# Step 01 — Data layer

**Depends on:** [00](00-scaffold-and-installable-shell.md).
**Ships:** no new user-facing screens. A database, a repository layer, a units module, and a
dev-only seed button.
**Requirements:** R-EDIT-2, R-EDIT-4, R-UNIT-2, R-UNIT-4, and the scale ceiling in PRD §11.
**Decisions honoured:** [ADR-0002](../adr/0002-local-first-no-server.md),
[ADR-0003](../adr/0003-indexeddb-dexie-storage.md),
[ADR-0006](../adr/0006-imperial-display-metric-storage.md).
**Done means:** a seeded database of 5,000 Finds answers every filter the app will need in
well under 100 ms, survives a phone restart in airplane mode, and every piece of logic in
this step has a test.

## Why this step exists

The filters in PRD §12 and the ceiling in PRD §11 are the only place in this project where a
wrong choice is expensive to undo. IndexedDB is index traversal, not SQL: the indexes have
to be designed around the queries before the queries exist. Doing that now, with a seeded
database and a stopwatch, is far cheaper than discovering it at step 08.

## Build

1. **Dexie schema v1.** One store per first-class entity in `GLOSSARY.md`:

   | Store | Key | Indexes that matter |
   | --- | --- | --- |
   | `finds` | `id` | `siteId`, `sessionId`, `dateFound`, `deletedAt`, `[siteId+dateFound]`, `[sessionId+dateFound]`, `[categoryId+dateFound]` |
   | `items` | `id` | `findId`, `category`, `silver`, `gold`, `dateOnYear`, `deletedAt`, `[findId+deletedAt]` |
   | `photos` | `id` | `ownerId`, `ownerKind`, `createdAt` |
   | `sites` | `id` | `name`, `deletedAt`, `landownerId` |
   | `landowners` | `id` | `name` |
   | `permissions` | `id` | `siteId`, `landownerId`, `expiresOn` |
   | `sessions` | `id` | `siteId`, `startedAt`, `deletedAt`, `[siteId+startedAt]` |
   | `trackPoints` | `id` | `sessionId`, `[sessionId+seq]`, `recordedAt` |
   | `detectors` | `id` | `make`, `model` |
   | `settingsPresets` | `id` | `detectorId`, `name` |
   | `tombstones` | `id` | `kind`, `deletedAt` |
   | `meta` | `key` | — singletons: schema version, last export, tour seen, start screen |

   Every record carries `id` (UUIDv7), `updatedAt`, and `deletedAt` (null unless in the Bin).
   Positions are stored as `{ lat, lon, accuracyM, altitudeM }` — metres, always
   (R-UNIT-2). Times are stored as UTC epoch milliseconds alongside the captured
   `utcOffsetMinutes` (R-UNIT-4). Photos are Blobs in their own store (ADR-0003).

2. **Repositories.** `finds`, `items`, `photos`, `sites`, `landowners`, `permissions`,
   `sessions`, `tracks`, `detectors`, `presets`. No component ever touches Dexie directly.
   This is the seam that keeps the sqlite-wasm escape hatch in ADR-0003 real.
3. **Filter API.** One function taking the whole filter-sheet shape from PRD §12 — Site,
   Session, date range, Category, silver, gold, Date On range, hide-Misses, search string —
   returning Finds. It composes index ranges and set intersections in TypeScript. It must be
   pure enough to test without a DOM.
4. **Units module** (ADR-0006). `inchesToM / mToIn`, `ozToG / gToOz`, `ftToM / mToFt`,
   `ydToM / mToYd`, `acresToSqM / sqMToAcres`, `miToM / mToMi`, `mmToIn`. Each with a parse
   function accepting what a human actually types (`6`, `6"`, `6 in`) and a format function
   that rounds to the precision the user typed. Depth is inches only — `1'6"` is not
   accepted. No component may multiply by a constant. Exhaustive tests, including round-trip.
5. **`liveQuery` hooks** for the queries the UI will need: Finds by filter, Items by Find,
   photos by owner, counts by Site (R-STATS-1).
6. **Soft delete and tombstones** (R-EDIT-2, R-EDIT-4): `softDelete(id)` sets `deletedAt`;
   `restore(id)` clears it; `purgeExpired()` moves records older than 30 days into
   `tombstones` and removes them. The Bin screen is step 04 — this step builds only the
   mechanism.
7. **Cascade rules, written as tests before the code:** deleting a Find takes its Items;
   deleting a Site or Session that still contains Finds is refused with a typed error the UI
   can react to (R-EDIT-3); deleting an Item never deletes its Find.
8. **Seed script**, dev-only, reachable from Diagnostics: generates N Finds at realistic
   positions clustered around a few Sites, with Items, photos (small generated JPEG Blobs),
   Sessions and Track points. Defaults to the PRD §11 ceiling: 5,000 Finds, 12,000 Items,
   15,000 photos, 30 Sites, 500 Sessions, 500,000 Track points. A "clear all data" button
   beside it.
9. **Schema versioning discipline.** `db.version(1).stores(...)`. Any later step that changes
   the schema adds a version and a migration test that pushes v1 data through it.

## Acceptance criteria

- [ ] `vitest` passes under `fake-indexeddb`: repositories, cascade rules, blocked deletes,
      filter composition, unit conversion round-trips, tombstone expiry.
- [ ] Seeding the full PRD §11 ceiling completes in under 60 s on a phone and reports its own
      timing in Diagnostics.
- [ ] With that data loaded, on the phone: filter by Site → under 100 ms; date range +
      Category + silver → under 100 ms; substring search over 12,000 Items → under 300 ms.
      Times are logged in Diagnostics, not eyeballed.
- [ ] `navigator.storage.estimate()` after the full seed is reported, and the app still
      installs and opens afterwards.
- [ ] Kill the app, restart in airplane mode: all seeded data present, filter timings still
      hold.
- [ ] A migration test proves a v1 database opens under a v2 schema. Add a trivial v2 to
      prove the path works, then leave it in place.

## Verify on a phone

1. Open Diagnostics → seed the full ceiling. Watch the timing.
2. Over remote debugging, Application → IndexedDB. Read one `finds` row and confirm
   `accuracyM` is metres.
3. Run the filter benchmark from Diagnostics. Write the numbers down.
4. Airplane mode, kill, reopen, re-run the benchmark. The numbers should not move.
5. Confirm persistence is still granted after the seed, and note the storage figure.

## Commit

`git commit -m "step 01: dexie schema v1, repositories, filter api, units module, seed + benchmarks"`
