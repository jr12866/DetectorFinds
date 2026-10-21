# Step 02 — Map, live position, and the first pin

**Depends on:** [01](01-data-layer.md).
**Ships:** the Field map. You can see where you are, drop a pin at that position or by hand,
and tap the pin to see the Find that made it.
**Requirements:** R-MAP-1, R-MAP-2, R-MAP-4, R-MAP-5, R-MAP-6, R-MAP-10, R-MAP-11, R-GPS-1,
R-GPS-2, R-GPS-3, R-GPS-4, R-GPS-5, R-GPS-6, R-GPS-7, R-GPS-8, R-FIND-1, R-EDIT-1. The other four
map requirements belong to other steps: R-MAP-3 clustering is step 10, R-MAP-7 Site boundaries is
step 06, R-MAP-8 Tracks is step 05, R-MAP-9 the filter sheet is step 08.
**Decisions honoured:** [ADR-0004](../adr/0004-leaflet-usgs-raster-basemaps.md).
**Done means:** you walk a field, the blue dot follows you, you tap "Log find", and a pin is
on the map with a real accuracy figure attached. Tapping that pin shows the Find.

## Why this step exists

This is the moment the app either works in a field or does not. GPS behaviour, tile loading
over a phone network, and Leaflet's performance with real markers are all things that cannot
be tested honestly on a desktop. Everything after this step decorates what this step proves.

## Build

1. **Map component.** Leaflet, one instance per screen, created once and reused. Canvas
   renderer for Pins from the start. Disable `worldCopyJump`, set `maxZoom` to 19, and set
   `minZoom` so the app cannot zoom out to a whole-state view and start pulling thousands of
   tiles.
2. **Basemaps** (R-MAP-4): the three USGS layers named in ADR-0004 — `USGSImageryOnly`
   (default), `USGSImageryTopo`, `USGSTopo`. A single basemap control with the three names
   from `GLOSSARY.md`. The choice is persisted in `meta`.
3. **Tile failure handling** (R-MAP-11): a 404 or a network failure must leave a grey tile
   with a small "no tile" mark, never a white hole and never a retry storm. Cap retries at
   one, and stop requesting tiles entirely when `navigator.onLine` is false.
4. **Live position** (R-GPS-1, R-MAP-6): `watchPosition` with `enableHighAccuracy: true`. A blue dot
   with an accuracy circle. The watch starts when the Field map opens and stops when it
   closes. Show the fix age; a fix older than a few seconds is stale and must look stale.
5. **Heading** (R-MAP-5, R-MAP-6): subscribe to `DeviceOrientationEvent` and rotate the view only
   when the user turns on the heading toggle. Default is north-up. Ask for iOS permission
   only if the API requires it — this is an Android app, but the code must not throw
   elsewhere.
6. **Follow mode**: the map keeps the dot centred while the user is moving and releases as
   soon as the user drags the map. A "Recenter" button re-arms it.
7. **Averaged position** (R-GPS-3, R-GPS-5): collect samples for a few seconds while the user stands
   still, compute the mean position and the scatter, and show both. The mean is what gets
   offered as the pin position.
8. **Accuracy warning** (R-GPS-2): show the accuracy figure in metres at all times. Past the
   threshold, show a warning and offer to wait. Never block the user from logging.
9. **Drop a pin** (R-FIND-1, R-GPS-4, R-GPS-7, R-GPS-8): "Log find" creates a Find at the current averaged
   position with `positionSource: "gps"`, records accuracy and altitude, and drops the pin.
   "Add pin by hand" lets the user place one anywhere; that Find gets
   `positionSource: "hand"` and no accuracy claim.
10. **Pin appearance** (R-MAP-1): colour by Category, hollow marker for a Miss. Until step
    07 there is only one Category, so use a single colour plus the hollow variant.
11. **Pin → popup → Open** (R-MAP-2): tapping a pin opens a popup card with thumbnail,
    Category, Date On, Site name, distance from the current position, and an Open button.
    Until step 03, Open shows the Find's raw fields.
12. **Pin move** (R-EDIT-1): from the pin's popup card, "Move pin" enters a move mode — the
    map then takes a single tap for the new position, and the Pin follows the map while the
    user pans. No long-press and no press-and-hold drag: R-MODE-3 forbids long-press in
    Field mode, and a glove does not do fine drags reliably. On commit, update the Find's
    Position and set `positionSource: "hand"`.
13. **Distance display** (R-MAP-2): a distance readout on the popup and on any selected pin,
    formatted in miles/feet by the units module.
14. **Zoom and centre persistence**: remember the last map centre and zoom per Site, and the
    last overall position, in `meta`.

## Acceptance criteria

- [ ] Cold open of the Field map in airplane mode shows the cached shell, the blue dot, and
      grey tiles, with no console errors and no infinite tile requests.
- [ ] With the phone's mock-location app feeding a known point, the dot lands within the
      stated accuracy of that point.
- [ ] Walking with the screen on keeps the dot moving; the fix age never exceeds a few
      seconds.
- [ ] "Log find" at a known mock position writes a Find whose `accuracyM` matches the mock
      accuracy, and the pin appears at that position after a restart.
- [ ] A hand-placed pin records `positionSource: "hand"` and shows no accuracy figure.
- [ ] "Move pin" on a pin, tapping a new position, and reopening the Find shows the new
      position and `positionSource: "hand"`.
- [ ] Tapping a pin opens the popup card; the distance figure is correct against a manually
      computed value.
- [ ] Switching basemaps changes the tiles and the choice survives a restart.
- [ ] Turning the phone while heading-up is on rotates the map; with it off, the map stays
      north-up.
- [ ] With the network throttled to a slow 3G profile, the map still responds to taps and the
      dot still moves.

None of these are ticked, and none of them can be ticked from a laptop: every one is an observation
about a phone in a field. What the laptop has settled is the arithmetic underneath them, recorded
under **Laptop-verified** below, so the phone run is checking wiring, latency and feel rather than
sums. Write the number or the observation beside the tick when the run is done — a tick with nothing
beside it is how step 01's criterion 3 came back open.

The run needs an HTTPS origin the phone can reach, because a browser refuses geolocation on an
insecure one. Either push to `main` and use the Pages deploy, or serve the `npm run build` output
over HTTPS on the LAN. `npm run dev` on a LAN address will not do: Chrome treats it as a non-secure
context, and the map opens with the location-permission message where the fix should be.

## Verify on a phone

1. Set a mock location with a known accuracy figure. Open the Field map. The accuracy readout
   should match the mock value.
2. Walk about 30 m. The dot should move smoothly and the accuracy circle should shrink and
   grow realistically.
3. Stand still, tap "Log find", and let it average. Note the position it reports; compare it
   against the mock coordinates.
4. Walk to a second point, log again, then hand-place a third pin somewhere you are not.
5. Tap each pin. Check the distance figures against a map app.
6. Kill the app, reopen, confirm all three pins are still there and the map reopens near the
   last position.
7. Turn on airplane mode and reopen the map. Confirm tiles go grey rather than white and the
   app stays responsive.
8. Kill the app with the map somewhere other than its start position, reopen, and confirm it
   reopens near where it was left, at the zoom it was left at, on the Basemap chosen last.
9. Turn on the heading toggle and turn the phone in your hands. The wedge on the dot should turn.
   The map itself stays north-up — see the first Deviations note, because criterion 9 as written
   asks for something Leaflet 1.9 cannot do.
10. Throttle the network to a slow profile, or use a real weak signal, and confirm taps still
    register and the dot still moves while tiles are arriving.

## Laptop-verified

`npm test` → **39 files, 623 tests, all passing**, about 1 s. Step 01 closed at 27 files and 408
tests; the twelve files and 215 tests added here are the arithmetic this step asks for ([rule
3](README.md)). None of them imports Leaflet — see the `pinStyle.ts` / `tilePolicy.ts` note under
Deviations for why that mattered.

| Module | Tests | What it pins down |
| --- | --- | --- |
| `src/gps/position.ts` | 34 | one watch for the whole app, `PositionAverager` mean and scatter, stale-after-8 s, heading smoothing |
| `src/gps/compass.ts` | 9 | a heading out of whichever orientation event the platform emits, and no throw where the API is missing |
| `src/geo/distance.ts` | 16 | ground distance against hand-computed values, the mean-earth constant, `scatterM` |
| `src/map/basemaps.ts` | 16 | the three layers, tile counts against the real tile grid, zoom bounds 6–19 over a native 16 |
| `src/map/tilePolicy.ts` | 11 | one retry and only one, no request at all while offline, grey rather than white |
| `src/map/pinStyle.ts` | 10 | filled recovery, hollow Miss, ringed Placed Pin, the selected ring |
| `src/map/pinModel.ts` | 11 | Find → Pin, the 0/0 no-position sentinel never drawn, and the count of Finds the map cannot draw |
| `src/map/pinWrites.ts` | 22 | what a logged Find contains, the stale refusal, a hand Pin that claims nothing |
| `src/map/popupCard.ts` | 20 | the card's six fields, and the distance against a manually computed value |
| `src/map/readouts.ts` | 26 | accuracy levels including unknown, fix age, scatter, the stand-still advice |
| `src/map/viewStore.ts` | 24 | the remembered view and its encoding, and what the map opens on when nothing was saved |
| `src/map/followMode.ts` | 16 | when the map moves, when it must not, and what Recenter re-arms |

One laptop observation that is not a test: the built app, opened in headless Chrome, draws a real
Leaflet map, loads USGS Imagery tiles over the British Isles at zoom 6, and reports no console
errors. That says the wiring mounts and the tile URL is right. It says nothing about GPS — headless
Chrome has no location and the screen correctly shows the permission-denied state — and it is not a
substitute for any criterion above.

The production bundle is 581 kB, 184 kB gzipped, with Leaflet in it. Nothing in the PRD sets a
budget; the number is written down because the shell is precached over a phone network and a later
step will want to know what it started from.

## Deviations

Each of these is a place where the code does something other than what the build list says. They are
here rather than in a commit message because the next step has to be able to find them.

- **The heading toggle rotates the dot, not the map.** Build item 5 says "rotate the view" and
  criterion 9 says "rotates the map". Leaflet 1.9 has no map rotation — there is no bearing on
  `Map`, and the plugins that add one are not in this app. The toggle turns the user dot and its
  heading wedge while the map stays north-up, which is what R-MAP-5's "north-up by default,
  heading-up opt-in" is for. Criterion 9 as written cannot pass; what it can check is that the wedge
  turns with the phone and that the map does not. A genuinely rotated map is a decision about a
  plugin or a canvas transform over the tile pane, and step 10 is where the map work continues.
- **The popup card is a panel over the map, not a Leaflet popup.** R-MAP-2 calls it a popup. A
  Leaflet popup is built by interpolating a string into HTML, and a Find's note is text the user
  typed; a popup also cannot hold the 56 px tap targets R-MODE-3 asks for. The card is a React panel
  (`PinCard`) whose strings come from `src/map/popupCard.ts`. Criterion 7's "popup card" is the panel.
- **`distanceM` now uses 111,195 m per degree instead of the WGS84-equator pair.** The constants
  step 01 used — 110,540 for longitude, 111,320 for latitude — understate a degree of latitude by
  about 0.6 % at UK latitudes, and criterion 5 compares the readout against a map app. The step 01
  Track test moved with it: 221.1 m → 222.4 m and 110.5 m → 111.2 m. Any step 01 number that quoted
  a distance should be re-read against the new constant.
- **Averaging is the feed's rolling window, not a separate sampling session.** Build item 7 says
  "collect samples for a few seconds while the user stands still". `PositionAverager` keeps a
  four-second window over the same `watchPosition` readings the dot is driven by and publishes the
  mean and the scatter continuously; "Log find" offers that mean rather than starting its own
  sample run. `averagingAdvice` in `src/map/readouts.ts` says what it sees — fewer than three fixes,
  a scatter over 25 m, a speed above 1 m/s ("you appear to be moving") — as advice, never as a
  block, which is R-GPS-5's "stand still at the hole" prompt.
- **A stale fix does block "Log find", and the reason is on the screen.** R-GPS-2 blocks saving a
  stale position, so `pendingGpsPin` refuses a fix older than `STALE_AFTER_MS` (8 s) and the hint
  next to the disabled button says how old the last fix was. Poor accuracy does not block, because
  R-GPS-4 says it must not; it warns.
- **A Placed Pin is two taps, not a long-press.** R-GPS-8 allows a long-press and *also* requires a
  two-tap alternative; only the two-tap path is built ("Add pin by hand", then tap the map). Move
  pin is the same shape, which is what build item 12 asks for.
- **The map is built before the remembered view has been read.** Build item 14's stored view lands a
  moment later through `setView`, and only if the user has not already moved the map; otherwise the
  screen is a grey rectangle while IndexedDB opens. `bootViewFor` in `src/map/viewStore.ts` is the
  tested order: this Site's view, then the last view anywhere, then the last known position, then
  `FALLBACK_VIEW` — the British Isles at the minimum zoom.
- **The per-Site view key exists but only ever holds the unassigned Site.** Steps 05 and 06 own the
  Site and Session choosers; until then the map runs with `siteId = ''` and `sessionId = ''`, so
  every Pin is logged against the unassigned buckets and there is exactly one view key to remember.
- **Two Leaflet-free modules where the build list implies one.** `pinStyle.ts` and `tilePolicy.ts`
  hold the decisions that `pinIcon.ts` and `tiles.ts` hand to Leaflet, because vitest runs in a node
  environment where importing Leaflet throws (`window is not defined` at
  `node_modules/leaflet/src/core/Util.js:217`) and rule 3 asks for that arithmetic to be tested.
  Both Leaflet files re-export them, so nothing else has to know the split exists.
- **`meta` gained four keys**: `map.basemap`, `mapView:<siteId>`, `mapLastView`, `mapLastPosition`.
  Build items 2 and 14 ask for the persistence; the key names are decided here, in
  `src/db/repos/meta.ts`.
- **`useSites()` was added to `src/db/liveQueries.ts`**, because the card shows the Site name
  (R-MAP-2) and there was no hook for it.
- **The build list's R-MAP ids did not match PRD §5.** Item 2 cited R-MAP-1 for the basemaps (that
  is R-MAP-4), item 3 cited R-MAP-10 for tile failure (R-MAP-11), item 10 cited R-MAP-7 for pin
  appearance (R-MAP-1), and items 11 and 13 cited R-MAP-8 and R-MAP-9 for the card and its distance
  (both R-MAP-2). The list above now cites the PRD's numbers and the code comments were corrected
  with it. This matters because R-MAP-7, R-MAP-8 and R-MAP-9 mean Site boundaries, Tracks and the
  filter sheet, and steps 05, 06 and 08 have to read those ids without tripping over this step.
- **`FindDetailScreen` prints raw fields instead of a placeholder.** Build item 11 asks that Open
  shows the Find's raw fields until step 03 replaces the screen, so it does: the stored fields and
  the Item list, read through live queries, with a line saying what step replaces it.

## Commit

`git commit -m "step 02: leaflet field map, usgs basemaps, live gps, drop and move pins"`
