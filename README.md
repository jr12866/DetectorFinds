# DetectorFinds

*Working title. The repo name sets the PWA scope, so settle the name before the first deploy.*

An offline-first Android web app for metal detecting finds: log a hole where you are standing,
drop a pin, photograph it, and deal with the detail later at home. Everything lives on the phone.
No account, no server, no upload.

**Status: documentation only. No code yet.** The spec is finished and the build order is set;
implementation starts at [step 00](./docs/build/00-scaffold-and-installable-shell.md).

## What it does

- GPS-tag a find and drop a pin on a map that works with no signal.
- Tap a pin to open the find: photos, notes, depth, classification.
- Log a find in under fifteen seconds, three taps, no typing.
- Track where you walked during a session, and draw the boundary of the ground you have
  permission to detect on.
- Sessions, detectors, sites, landowners, a bin, search, filters, statistics.
- Export everything, import it back, print a report for the landowner.

## Where the documentation is

| File | What it is |
|---|---|
| [PRD.md](./PRD.md) | The product contract. Every requirement has an ID (`R-FIND-1`) that the build steps cite. Read this first. |
| [GLOSSARY.md](./GLOSSARY.md) | The domain vocabulary. Find, Item, Miss, Site, Session, Track, Pin, Placed Pin, Cached Area. Code, docs and UI copy all use these words. |
| [docs/build/](./docs/build/) | Thirteen build steps, each ending with something that runs on a phone. [Start here](./docs/build/README.md). |
| [docs/adr/](./docs/adr/) | Six decisions held deliberately: PWA target, local-first, IndexedDB, Leaflet + USGS tiles, foreground-only tracking, imperial display. |
| [docs/CSV-IMPORT.md](./docs/CSV-IMPORT.md) | The published CSV contract, for anyone formatting old finds to import. [Worked example](./docs/examples/finds-sample.csv). |

## How to build and run

Not yet buildable. Once step 00 exists:

```bash
npm install
npm run dev      # development server
npm run build    # production build into dist/
```

Deployment is GitHub Pages, because the app needs HTTPS for service workers, geolocation and
installability, and Pages is free. The app is served from a subpath, so `base` in the Vite
config and the scope in the manifest must both match the repo name.

## Licence

MIT. See `LICENSE` (to be added once the copyright holder name is settled).
