# Step 02 — Map, live position, and the first pin

**Depends on:** [01](01-data-layer.md).
**Ships:** the Field map. You can see where you are, drop a pin at that position or by hand,
and tap the pin to see the Find that made it.
**Requirements:** R-MAP-1, R-MAP-2, R-MAP-3, R-MAP-4, R-MAP-5, R-MAP-6, R-MAP-7, R-MAP-8,
R-MAP-9, R-MAP-10, R-GPS-1, R-GPS-2, R-GPS-3, R-GPS-4, R-GPS-5, R-GPS-6, R-GPS-7, R-GPS-8.
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
2. **Basemaps** (R-MAP-1): the three USGS layers named in ADR-0004 — `USGSImageryOnly`
   (default), `USGSImageryTopo`, `USGSTopo`. A single basemap control with the three names
   from `GLOSSARY.md`. The choice is persisted in `meta`.
3. **Tile failure handling** (R-MAP-10): a 404 or a network failure must leave a grey tile
   with a small "no tile" mark, never a white hole and never a retry storm. Cap retries at
   one, and stop requesting tiles entirely when `navigator.onLine` is false.
4. **Live position** (R-GPS-1): `watchPosition` with `enableHighAccuracy: true`. A blue dot
   with an accuracy circle. The watch starts when the Field map opens and stops when it
   closes. Show the fix age; a fix older than a few seconds is stale and must look stale.
5. **Heading** (R-MAP-6): subscribe to `DeviceOrientationEvent` and rotate the view only
   when the user turns on the heading toggle. Default is north-up. Ask for iOS permission
   only if the API requires it — this is an Android app, but the code must not throw
   elsewhere.
6. **Follow mode**: the map keeps the dot centred while the user is moving and releases as
   soon as the user drags the map. A "Recenter" button re-arms it.
7. **Averaged position** (R-GPS-3): collect samples for a few seconds while the user stands
   still, compute the mean position and the scatter, and show both. The mean is what gets
   offered as the pin position.
8. **Accuracy warning** (R-GPS-2): show the accuracy figure in metres at all times. Past the
   threshold, show a warning and offer to wait. Never block the user from logging.
9. **Drop a pin** (R-FIND-1, R-GPS-4): "Log find" creates a Find at the current averaged
   position with `positionSource: "gps"`, records accuracy and altitude, and drops the pin.
   "Add pin by hand" lets the user place one anywhere; that Find gets
   `positionSource: "hand"` and no accuracy claim.
10. **Pin appearance** (R-MAP-7): colour by Category, hollow marker for a Miss. Until step
    07 there is only one Category, so use a single colour plus the hollow variant.
11. **Pin → popup → Open** (R-MAP-8): tapping a pin opens a popup card with thumbnail,
    Category, Date On, Site name, distance from the current position, and an Open button.
    Until step 03, Open shows the Find's raw fields.
12. **Pin move** (R-EDIT-1): from the pin's popup card, "Move pin" enters a move mode — the
    map then takes a single tap for the new position, and the Pin follows the map while the
    user pans. No long-press and no press-and-hold drag: R-MODE-3 forbids long-press in
    Field mode, and a glove does not do fine drags reliably. On commit, update the Find's
    Position and set `positionSource: "hand"`.
13. **Distance display** (R-MAP-9): a distance readout on the popup and on any selected pin,
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

## Commit

`git commit -m "step 02: leaflet field map, usgs basemaps, live gps, drop and move pins"`
