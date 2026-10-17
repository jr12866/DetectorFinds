# Build steps

Thirteen steps, risk-first. Each one ends with an app that **runs on the phone**, so the
scary parts — GPS, offline tiles, camera, storage — are exercised on real hardware in week
one rather than discovered in week ten.

| Step | Ships | The question it answers |
| --- | --- | --- |
| [00](00-scaffold-and-installable-shell.md) | Installable shell | Can we install this and open it in a field with no signal? |
| [01](01-data-layer.md) | Database | Can it hold five thousand Finds and answer the filters we plan? |
| [02](02-map-gps-and-the-first-pin.md) | Map + GPS + first Pin | Does the position actually work on a phone in a field? |
| [03](03-find-editor-photos-and-15-seconds.md) | Find editor + photos | Can a muddy-handed person log a find in 15 seconds? |
| [04](04-bin-and-deletes.md) | Bin | Can we delete things without destroying the wrong thing? |
| [05](05-sessions-track-and-detector.md) | Sessions + Track | Is a foreground-only Track good enough to live with? |
| [06](06-sites-boundaries-permissions-plss.md) | Sites + Boundary | Is drawing a boundary usable, and is it worth it? |
| [07](07-items-and-classification.md) | Items | Do the classification fields fit on a phone? |
| [08](08-lists-filters-search-stats.md) | Lists + filters | Can we find an old find again? |
| [09](09-field-home-modes-and-start-screen.md) | Field/Home modes | Does the app actually feel different in the field? |
| [10](10-offline-maps-basemaps-clustering.md) | Offline maps | Does the map work with no signal, and how much disk? |
| [11](11-export-import-backups-and-first-run.md) | Export + import | Can this survive a dead phone and a new phone? |
| [12](12-landowner-report-and-polish.md) | Report + polish | Can we hand a landowner a page and get invited back? |

## Rules that apply to every step

1. **The phone gate.** A step is not finished until it has been used on a real Android
   phone over Wi-Fi, with Chrome remote debugging attached, and then once in airplane mode.
   Emulator geolocation proves nothing about a real field.
2. **Commit at the end of every step**, and the commit must be deployable to GitHub Pages.
   If a step cannot be deployed, it is not finished.
3. **Tests are written for logic, not for pixels.** Anything in a step that is arithmetic,
   parsing, validation or a query gets a Vitest test in the same step. Screens are verified
   by hand.
4. **No step may break an earlier step's acceptance criteria.** Re-run the previous step's
   "verify on a phone" list before committing.
5. **Nothing in a step is allowed to grow.** If a step's build list feels too long, the
   step is mis-scoped — split it and renumber rather than quietly dropping an acceptance
   criterion.

## What is deliberately not in any step

Dark mode, landscape, iOS, accounts, sync, coin values, detector audio or Bluetooth,
image-based identification, GeoJSON, vector tiles, dashboards, battery optimisation beyond
the wake lock, permission-expiry warnings. See PRD §17.
