# 3. IndexedDB via Dexie as the database

Date: 2026-10-17
Status: Accepted

## Context

Everything the app records lives on the phone (ADR-0002) at the scale in PRD §11: 5,000
Finds, 12,000 Items, 15,000 photos, 500 Sessions, 500,000 Track points. The app filters
hard — by Site, Session, date range, Category, silver, gold, Date On, hide-Misses, plus
substring search — and needs the UI to react the moment a record changes.

Two credible engines:

- **sqlite-wasm over OPFS.** Real SQL, one file, easy single-file backup. But the OPFS
  VFSes that work require a dedicated worker with a single writer, so every read from the
  main thread is a round-trip through a message protocol; the same database is not
  reachable from the service worker; the file is invisible to DevTools; and the upstream
  project describes the WASM build as not intended for production use.
- **IndexedDB via Dexie.** No worker, no message protocol, reachable from both the page and
  the service worker, stores Blobs natively (which is where 15,000 photos live), versioned
  schema with migrations, compound indexes for the filter set, `liveQuery` to drive React,
  and inspectable in DevTools under Application → IndexedDB.

The deciding factor is not performance — both are fast enough at this scale. It is that a
GPS-and-map app gets tested on a phone over remote debugging, and a database you cannot
open and read by eye is a large tax on every debugging session.

## Decision

IndexedDB, accessed through Dexie, is the only database. Photos are stored as Blobs in
their own object store, not as data URLs and not as OPFS files. `dexie-react-hooks`
`liveQuery` drives the UI; there is no separate in-memory cache of records.

## Consequences

- No worker and no message protocol, and the same store is readable from the service
  worker when it needs to answer "is this tile cached?".
- Queries are index traversals and set intersections, not SQL. Anything that would need a
  join or a `GROUP BY` is computed in TypeScript over an index range. At PRD §11 scale
  that is fine; if it ever stops being fine, the fix is a precomputed count table, not a
  different database.
- IndexedDB is *best-effort* storage until `navigator.storage.persist()` is granted, and
  the browser may then still evict under disk pressure. So: request persistence at first
  run, re-check it in Diagnostics, and treat export (R-EXPORT-*) as part of the data model
  rather than a nicety.
- Backups are archives we build (JSON + photos in a ZIP), not a database file we copy.
  That is more code but it is also a format a human can read.
- Migrations are Dexie `version(n).stores(...)` steps, written additively. A step that
  changes the schema must ship a migration and a test that runs the previous version's
  data through it.
- `fake-indexeddb` makes the whole data layer testable under Vitest without a browser.
- Revisit only if a real query pattern appears that IndexedDB indexes cannot serve. The
  escape hatch is a sqlite-wasm build behind the same repository interface, which is why
  all reads and writes go through repositories and never through Dexie directly.
