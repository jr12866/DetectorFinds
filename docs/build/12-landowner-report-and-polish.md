# Step 12 — Landowner report and polish

**Depends on:** [11](11-export-import-backups-and-first-run.md).
**Ships:** the page you hand a landowner, plus the cleanup pass that makes the whole thing
feel finished.
**Requirements:** R-REPORT-1, R-REPORT-2.
**Done means:** you finish a day on someone's land, print a page on the kitchen printer, and
hand it over. That page is what gets you invited back.

## Build

1. **Report screen** per Site (R-REPORT-1): a printable page containing
   - Site name, code, Landowner, PLSS Reference, Access Notes, and the Permission in force
     (grant date, conditions);
   - find counts for the chosen Session or date range — Finds, Misses, Items, silver, gold;
   - Items with thumbnail, Category, Sub-type, Date On, depth, weight, and condition;
   - a map image showing the Site Boundary and the Pins for the reported Finds;
   - a general free-text notes section the user fills in, plus per-Site notes pulled through.
2. **Map image without a screenshot hack** (R-REPORT-2): render the boundary and Pins into an
   image from the tile layer plus vector overlays, at a fixed size, and place that image in
   the print layout. It must work offline for a cached Site.
3. **Print stylesheet**: `@media print` only. A4 and US Letter both, margins, page breaks that
   never split an Item row, and a print header carrying the Site name and date. No PDF
   library — the browser's print-to-PDF is the output path.
4. **Report scope picker**: whole Site, one Session, or a date range.
5. **Photo sizing for print**: thumbnails only, sized so a page holds a sensible number of
   Items. A Site with 400 Items must paginate cleanly rather than produce a 90-page document
   with one photo per page.
6. **Polish pass**, in this order:
   - every empty state, error state and loading state in the app, walked in one sitting;
   - every destructive action has an Undo or a confirm, checked against the step 04 rules;
   - every form field's keyboard, autocomplete and input mode set correctly, tested on a real
     phone keyboard;
   - every number goes through the units module — grep for stray `* 0.`, `/ 25.4` and similar;
   - every date renders in the same format everywhere;
   - the Diagnostics screen is updated to reflect everything that now exists;
   - the first-run tour's six stops are re-checked against what the app actually looks like;
   - a final pass on the step 09 tap-target audit, now that every screen exists.
7. **Final benchmark run**: re-run the step 01 and step 08 timings against the ceiling and
   record them in Diagnostics. Nothing may have regressed.
8. **Release**: version the build, write the `README.md` install instructions, tag, and deploy.

## Acceptance criteria

- [ ] A report for a Site with 30 Items prints to PDF as a readable document with the boundary
      map, Pins, and thumbnails, on both A4 and US Letter.
- [ ] A report for a Site with 400 Items paginates without splitting an Item row and without
      runaway page count.
- [ ] The report's map image renders correctly for a cached Site in airplane mode.
- [ ] The report's counts match the Stats screen for the same scope, exactly.
- [ ] The free-text notes section appears on the page with the user's text, line breaks
      preserved.
- [ ] No PDF library appears in `package.json`.
- [ ] Every empty, error and loading state in the app has been visited and reads sensibly.
- [ ] A grep for unit conversion constants outside the units module returns nothing.
- [ ] The step 01 and step 08 benchmarks still pass at the ceiling.
- [ ] All twelve steps' "verify on a phone" lists are re-run green before tagging.

## Verify on a phone

1. Generate a report for a real Site with real Finds and print it on a home printer. Read the
   paper. That is the acceptance test — not the on-screen preview.
2. Generate the same report as a PDF and check the pagination and the map image.
3. Generate a report for a deliberately large seeded Site and count the pages.
4. Repeat in airplane mode for a cached Site.
5. Walk the whole app once, in Field mode then Home mode, writing down every rough edge, and
   fix the list before tagging.

## Commit

`git commit -m "step 12: printable landowner report with boundary map, print stylesheet, polish pass and release"`
