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

1. **Dexie schema v1.** One store per first-class entity in `GLOSSARY.md`, plus a store for the
   image bytes themselves (ADR-0003). What shipped, in `src/db/schema.ts`:

   | Store | Key | Indexes |
   | --- | --- | --- |
   | `finds` | `id` | `foundAt`, `deletedAt`, `[siteId+foundAt]`, `[sessionId+foundAt]`, `[categoryId+foundAt]`, `[deletedAt+foundAt]`, `[needsDetail+foundAt]`, `[deletedAt+siteId]` |
   | `items` | `id` | `findId`, `categoryId`, `subType`, `material`, `*tags`, `isSilver`, `isGold`, `dateOnYear`, `createdAt`, `deletedAt`, `[findId+categoryId]` |
   | `photos` | `id` | `ownerId`, `ownerKind`, `createdAt`, `captureAt`, `deletedAt`, `[ownerId+createdAt]` |
   | `photoBlobs` | `photoId` | — one row per photo, holding the `full` and `thumb` Blobs |
   | `sites` | `id` | `name`, `landownerId`, `deletedAt`, `createdAt`, `plssTownship` |
   | `landowners` | `id` | `name`, `deletedAt` |
   | `permissions` | `id` | `landownerId`, `*siteIds`, `grantedOn`, `expiresOn`, `deletedAt` |
   | `sessions` | `id` | `date`, `siteId`, `detectorId`, `startedAt`, `endedAt`, `deletedAt`, `[siteId+startedAt]` |
   | `trackPoints` | `id` | `sessionId`, `at`, `[sessionId+at]` |
   | `detectors` | `id` | `make`, `model`, `deletedAt` |
   | `presets` | `id` | `detectorId`, `name`, `deletedAt` |
   | `tombstones` | `id` | `store`, `deletedAt`, `purgedAt` |
   | `meta` | `key` | — singletons: last export, last seed, last benchmark, tour seen, start screen |

   Every record carries `id` (UUIDv7) and `deletedAt`, where **0 means live** — IndexedDB will not
   index `null` or `undefined`, so a null sentinel would make live rows invisible to the very
   indexes the Bin and the "everything except deleted" queries are built on. `finds`, `items` and
   `sessions` also carry `updatedAt`, added at schema v2 together with a `[deletedAt+updatedAt]`
   index, so step 11's "everything changed since the last export" is an index range rather than a
   scan. Positions are stored as `{ lat, lon, accuracyM, altitudeM }` — metres, always
   (R-UNIT-2). Times are stored as UTC epoch milliseconds, and Find and Session store no offset
   at all (see Deviations, and the R-UNIT-4 decision recorded there). Photos are Blobs in their
   own store (ADR-0003).

   The index set differs from the list this step started with, and the differences are the point of
   doing this work before the queries existed: `finds` has no bare `siteId` or `sessionId` index,
   because every query that touches those also filters or sorts by `foundAt`, which a composite
   covers; `items` indexes `[findId+categoryId]` rather than `[findId+deletedAt]`, because the
   cascade and the per-Find item list are what actually run; `trackPoints` keys its order on `at`
   (the sample timestamp) rather than a `seq` counter the writer would have to maintain; a
   Permission covers several Sites, so `siteIds` is a multi-valued index; and a tombstone names its
   `store` rather than a `kind`, because the thing a sync has to reapply a delete to is a store.

2. **Repositories.** `finds`, `items`, `photos`, `sites`, `landowners`, `permissions`,
   `sessions`, `trackPoints`, `detectors` (which also owns the detector presets), `meta` and
   `bin`, built as one set by `createRepositories` in `src/db/repos/` and reached through
   `getRepositories()`, so the running app has exactly one connection and one injected clock.
   No component ever touches Dexie directly.
   This is the seam that keeps the sqlite-wasm escape hatch in ADR-0003 real.
3. **Filter API.** One function taking the whole filter-sheet shape from PRD §12 — Site,
   Session, date range, Category, silver, gold, Date On range, hide-Misses, search string —
   returning Finds: `queryFinds(db, filter)`, with `countFinds` for the same shape and
   `needsDetailQueue` for the Needs Detail queue (`src/db/filter.ts`). It composes index ranges
   and set intersections in TypeScript, and it is pure enough to test without a DOM. Two rules
   it exists to get right, each with a test written against it:
   - Every range is closed at both ends (`src/db/ranges.ts` → `betweenClosed`). A Find logged
     exactly at the end of a date range is inside it. Dexie's `between` is open at the top by
     default, so this is one shared helper rather than a flag repeated at each call site. The
     one deliberate exception is the Bin's expiry, where "older than 30 days" means strictly
     older.
   - Search is never a gate on its own. Every word must appear somewhere on the same Find — its
     note or category, its Site's name, its Landowner's name, or any one field of any of its
     Items — but the words need not come from one Item, and a search that matches only Site
     names still returns the Finds.
4. **Units module** (ADR-0006). `inchesToM / mToInches`, `inchesToMm / mmToInches`,
   `ozToG / gToOz`, `ftToM / mToFt`, `ydToM / mToYd`, `acresToSqM / sqMToAcres`,
   `miToM / mToMi`, `mmToM / mToMm`. Each with a parse
   function accepting what a human actually types (`6`, `6"`, `6 in`) and a format function
   that rounds to the precision the user typed. Depth is inches only — `1'6"` is not
   accepted. No component may multiply by a constant. Exhaustive tests, including round-trip.
5. **`liveQuery` hooks** for the queries the UI will need (`src/db/liveQueries.ts`): `useFinds`
   and `useFindCount` by filter, `useFind`, `useItemsOfFind`, `usePhotosOfOwner`,
   `useNeedsDetail` and `useNeedsDetailCount`, `useFindCountsBySite` (R-STATS-1),
   `useLiveFindCount`.
6. **Soft delete and tombstones** (R-EDIT-2, R-EDIT-4): `softDelete(id)` sets `deletedAt`;
   `restore(store, id)` clears it; `purgeOlderThan()` destroys what has been in the Bin for
   thirty days and writes its tombstone; `empty()` is the same for the whole Bin.
   `purgeOlderThan()` runs at app start — `runStartupMaintenance` in `src/db/startup.ts`, called
   from `src/main.tsx` after the first paint, reporting a failure rather than throwing one,
   because nothing else in the app asks and a phone opened once a week would otherwise hold
   deleted rows for months. The Bin screen is step 04 — this step builds only the mechanism.
7. **Cascade rules, written as tests before the code:** deleting a Find takes its Items;
   deleting a Site or Session that still contains Finds is refused with a typed error the UI
   can react to (R-EDIT-3); deleting an Item never deletes its Find.
8. **Seed script**, dev-only, reachable from Diagnostics: generates N Finds at realistic
   positions clustered around a few Sites, with Items, photos (real JPEG Blobs),
   Sessions and Track points. Defaults to the PRD §11 ceiling: 5,000 Finds, 12,000 Items,
   15,000 photos, 30 Sites, 500 Sessions, 500,000 Track points. Every photo gets an image,
   because `Photo.bytes` is a claim about what is in `photoBlobs` and an estimate built out of
   bytes nobody wrote is not a measurement: one checked-in 160×120 baseline JPEG
   (`src/db/jpegFixture.ts`) is padded with JPEG comment segments to the exact size the plan
   asks for, with per-photo payload, so two photos of the same size are not the same bytes and
   nothing below the app can deduplicate the sample away. The size is a dial on the Diagnostics
   card — 40 KB per photo is §11's typical (~600 MB across the ceiling), 150 KB is its worst
   case (~2.3 GB), and a phone run starts small because 600 MB of writes is a long time. A
   "clear all data" button beside it.
9. **Schema versioning discipline.** `db.version(1).stores(...)`. Any later step that changes
   the schema adds a version and a migration test that pushes v1 data through it. v2 is already
   registered — `updatedAt` plus `[deletedAt+updatedAt]` on `finds`, `items` and `sessions`, with
   a backfill for rows written before the field existed — so the upgrade path is a tested route
   rather than one step 11 has to build under pressure.

## Acceptance criteria

- [x] `vitest` passes under `fake-indexeddb`: repositories, cascade rules, blocked deletes,
      filter composition, unit conversion round-trips, tombstone expiry.
- [x] Seeding the full PRD §11 ceiling completes in under 60 s on a phone and reports its own
      timing in Diagnostics.
- [ ] With that data loaded, on the phone: filter by Site → under 100 ms; date range +
      Category + silver → under 100 ms; substring search over 12,000 Items → under 300 ms.
      Times are logged in Diagnostics, not eyeballed.
- [x] `navigator.storage.estimate()` after the full seed is reported, and the app still
      installs and opens afterwards.
- [x] Kill the app, restart in airplane mode: all seeded data present, filter timings still
      hold.
- [x] A Find binned more than thirty days ago is gone after a restart, with a `tombstones` row in
      its place. Nothing but startup runs the purge, so a phone that is opened rarely is the case
      that proves it.
- [x] A migration test proves a v1 database opens under a v2 schema. Add a trivial v2 to
      prove the path works, then leave it in place.

Measured on the phone on 2026-10-20 from the Diagnostics benchmark card, which keeps its report in
`meta`:

| Case | Ceiling | Phone | |
| --- | --- | --- | --- |
| filter by site | 100 ms | 11.3 ms | ok |
| date range + category + silver | 100 ms | 279.1 ms | **over, 2.8×** |
| substring search ("lead") | 300 ms | 335.5 ms | **over, 12%** |

The seed time, the live row counts the run measured against and the storage estimate were not
written down at the time, so these three are the timings as read off the card and nothing more.
Criterion 3 is therefore open, and the tick that was on it has come off.

**The 279 ms has a diagnosis, and it is a defect.** `itemSide` in `src/db/filter.ts` answers every
Item-side predicate the same way — `db.items.where('deletedAt').equals(LIVE).toArray()`, which
materializes all 12,000 live Items — while `isSilver`, `isGold` and `dateOnYear` are indexed in v1
and the metal predicate is a plain equality against `'yes'`. Seeding the ceiling under
`fake-indexeddb` on a desktop reads the live-Item table in 79.6 ms and
`where('isSilver').equals('yes')` in 7.0 ms for 973 rows, and the phone ran each of the three cases
3.5–4.7× slower than the desktop ran the same query, which is what makes the local ratio worth
anything. Driving the metal and Date On predicates off their indexes is the fix. The Site case at
11.3 ms is the control: the Find-side compound indexes are already doing their job.

**The 335 ms is a scan by nature.** A substring search has to read every Item's fields; no index
helps `includes`. The levers are fewer rows — a denormalized search blob on Find, which is a schema
version, write-path maintenance and an ADR — or less string building, per-word id Sets instead of
the per-Find joined-text Map. And the 300 ms is this document's own ceiling, not the PRD's: §11
gives row counts, and PRD line 43 promises "no perceptible save lag" at ~1,000 Finds. Re-basing it
is a legitimate decision, but it has to be written down as one rather than a number moved until the
box goes green.

The first and the last were closed from the laptop on 2026-10-20. `npm test` is 27 files and 408
tests, every `src/db` test opening `fake-indexeddb` because `vite.config.ts` sets
`environment: 'node'` — there is no browser IndexedDB for them to accidentally pass against. The
migration tests are in `src/db/schema.test.ts`: a `V1Database` that re-declares the v1 store
strings writes rows with no `updatedAt` at all, the real schema then opens the same name and
reports `verno === 2`, and the migrated rows are read back both through the new
`[deletedAt+updatedAt]` index and through the v1 compound indexes. Replacing the v2 `.upgrade()`
body with a no-op makes exactly two of them fail — the backfill assertion and the index
reachability one — which is the check that the test is not decorative. v2 is not the "trivial"
version the criterion asked for; it is the real one step 11 needs, so the path is proven for the
upgrade that will actually happen.

## Deviations

Decisions taken while building, not drift found afterwards. The tables above already describe how
the code works; this records what was given up and why.

- **Find and Session store UTC only.** PRD R-UNIT-4 asks for UTC epoch milliseconds "alongside the
  local offset captured at the moment of the record". Find and Session store the instant and no
  offset: Date Found displays in the phone's current timezone, a Session's `date` is the day the
  hunt belonged to, and Track points carry their own timestamps. Nothing in the product asks what
  the clock read when a Find was logged. If a later step needs the captured offset — a Find
  logged near midnight whose day matters — it adds `utcOffsetMinutes` as a schema version with a
  backfill, which is the path item 9 describes. **This is the one deviation here that changes a
  requirement rather than a name, and it needs a PRD amendment.**
- **`deletedAt: 0` means live.** IndexedDB will not index `null` or `undefined`, so a null
  sentinel hides live rows from the indexes the Bin and the not-deleted queries are built on.
  Every range over `deletedAt` treats 0 as a sentinel rather than a time, which is why the Bin's
  expiry range starts at 1.
- **`photos` and `trackPoints` carry no `updatedAt`.** Nothing queries either by it: photos are
  read by owner, Track points by Session and time. Putting the field on every store was a
  generality paid for with a write on every insert.
- **Seeded photographs are one small image, padded.** The fixture is 160×120 because a real
  1600×1200 encode cannot be squeezed under ~55 KB, and the ceiling has to seed in under 60 s.
  `widthPx` and `heightPx` report the fixture's real dimensions rather than a plausible-looking
  1600×1200, so a photo viewer sizing itself from the row is not handed a lie.
- **Names follow the code, not the draft table.** `foundAt` rather than `dateFound`, `presets`
  rather than `settingsPresets`, a tombstone's `store` rather than `kind`, a Track point's `at`
  rather than `seq` and `recordedAt`, `mToInches` and `mmToInches` rather than `mToIn` and
  `mmToIn`. Item 2's repository list is what `createRepositories` returns; the presets the plan
  listed as their own repository are methods on the detectors repository.
- **`meta` holds `startScreen`.** Step 09 says the start screen choice is "stored in `meta`,
  applied on every cold start", so step 01 reserves the key (`META_KEYS.startScreen`) without
  writing it. There is no settings table to hold it, and inventing one a step early is how two
  places end up owning the same preference.

## Verify on a phone

1. Open Diagnostics → seed the full ceiling. Watch the timing. Start with the photo dial low and
   raise it once the row counts are proven: the counts are what the query timings measure, the
   images are what the storage figure measures, and 600 MB of writes is the slow part.
2. Over remote debugging, Application → IndexedDB. Read one `finds` row and confirm `accuracyM` is
   metres. Read one `photos` row and confirm `bytes` is the size of the `photoBlobs` row beside it.
3. Run the filter benchmark from Diagnostics. Write the numbers down.
4. Airplane mode, kill, reopen, re-run the benchmark. The numbers should not move.
5. Confirm persistence is still granted after the seed, and note the storage figure.
6. Bin a Find, push its `deletedAt` back thirty-one days over remote debugging, reload, and
   confirm the row is gone and one `tombstones` row replaced it. That is the startup purge, and
   nothing else runs it.

## Commit

`git commit -m "step 01: dexie schema v1, repositories, filter api, units module, seed + benchmarks"`
