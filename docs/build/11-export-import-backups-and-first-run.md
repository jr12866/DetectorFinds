# Step 11 — Export, import, backups, and first run

**Depends on:** [07](07-items-and-classification.md), [10](10-offline-maps-basemaps-clustering.md).
**Ships:** the app's survival kit, and the first-run experience a new user actually sees.
**Requirements:** R-EXPORT-1, R-EXPORT-3, R-EXPORT-4, R-IMPORT-1, R-IMPORT-2, R-IMPORT-3,
R-FIRST-1, R-FIRST-2.
**Decisions honoured:** [ADR-0002](../adr/0002-local-first-no-server.md),
the contract in [docs/CSV-IMPORT.md](../CSV-IMPORT.md).
**Done means:** a dead phone costs you nothing, and a new user with an old spreadsheet gets
their finds in on day one.

## Build

1. **Full backup**: every store, every photo Blob, schema version, and the tombstones. A ZIP
   built with `fflate`, JSON records plus photo files.
2. **Photo-free backup**: the same, minus photo Blobs, for a quick safety copy.
3. **CSV export of Items** written to exactly the schema in
   [`docs/CSV-IMPORT.md`](../CSV-IMPORT.md) — the same module that reads it, run in the other
   direction.
4. **GPX export of Tracks**, one Track per Session, gaps represented as separate `<trkseg>`
   elements so a gap is a gap in the file too.
5. **Rolling dated backups** (R-EXPORT-4): where `showDirectoryPicker` is available, the user
   picks a folder once and the app writes `detectorfinds-YYYY-MM-DD-HHMM.json.zip` there on a
   schedule and on demand. Where it is not, export is a download and the UI says which mode it
   is in.
6. **Export reminder** (R-EXPORT-3): if nothing has been exported in 30 days, say so once per
   app open, in a way that can be dismissed but not silently ignored forever.
7. **CSV / ZIP import** (R-IMPORT-1): parse, validate, then show an **Import Preview** —
   counts of Sites, Sessions, Finds, Items, Misses, photos, plus every warning and every
   rejected row with its row number and the reason. Only then replace-everything.
8. **Import safety** (R-IMPORT-3): validate fully before writing anything. A failed import
   leaves the existing data untouched. Because import is destructive, take an automatic
   pre-import backup to the chosen folder where File System Access exists, and refuse to
   import if that backup cannot be written.
9. **Row rejection threshold**: more than 5 % failed rows refuses the whole import, per the
   published contract.
10. **Photo import**: photos referenced from `photos/` inside the ZIP are matched by filename
    and re-ingested through the step 03 pipeline.
11. **Round-trip test as a real test**: export the seeded ceiling, import it into an empty
    database, export again, and assert the two CSVs are byte-identical. This is the test that
    keeps the published contract honest.
12. **First-run tour** (R-FIRST-1): six stops — the map, the blue dot, Log a find, Start
    session, Sites, Export. Skippable at any point, replayable from Settings.
13. **Import offer** (R-FIRST-2): immediately after the tour, the explicit offer to import old
    finds, with a pointer to the published schema and a link to open the file picker.
14. **Reset**: "delete everything" behind a confirm that names the counts it is about to
    destroy.

## Acceptance criteria

- [ ] Exporting the seeded ceiling produces a ZIP that imports into an empty database with
      identical counts of every entity, and every photo opens.
- [ ] Export → import → export produces byte-identical CSV output.
- [ ] `docs/examples/finds-sample.csv` imports with zero rejected rows and produces exactly
      2 Sites, 2 Sessions, 4 Finds, 1 Miss, 5 Items, 3 photo references.
- [ ] A CSV with a deliberately broken row per category of error (bad date, bad number,
      unknown column, orphan `item` row, duplicate `find_ref` collision) produces the exact
      warnings the contract promises.
- [ ] A file exceeding the 5 % failure threshold is refused in the preview and changes
      nothing in the database.
- [ ] Importing replaces everything, and the pre-import backup exists in the chosen folder
      before the write begins.
- [ ] Where File System Access is unavailable, the UI states plainly that export is a download
      and rolling backups are not possible.
- [ ] The 30-day reminder appears once per app open and its dismissal is remembered.
- [ ] GPX output for a Session with a pause contains two `<trkseg>` elements and no invented
      points.
- [ ] A full backup restores on a second phone and the app opens with the tour not re-shown.

## Verify on a phone

1. Seed the ceiling, export a full backup, and note the file size and duration.
2. Copy the ZIP to a second phone, restore there, and compare the Stats screen between the two
   devices.
3. Export CSV, open it in a spreadsheet, confirm the columns match the published contract.
4. Import `docs/examples/finds-sample.csv` and read the preview counts.
5. Import a deliberately corrupted copy and confirm the preview refuses and nothing changes.
6. Point the app at a folder via `showDirectoryPicker`, let it write a rolling backup, and
   confirm the file appears with the right name.
7. Wipe the app's storage and reopen it. Walk the tour and the import offer end to end.

## Commit

`git commit -m "step 11: full and photo-free backups, csv and gpx export, rolling backups, import preview, first-run tour"`
