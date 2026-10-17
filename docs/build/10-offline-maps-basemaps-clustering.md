# Step 10 — Offline maps, Cached Areas, and pin clustering

**Depends on:** [06](06-sites-boundaries-permissions-plss.md),
[09](09-field-home-modes-and-start-screen.md).
**Ships:** a map that works with no signal at all, and a map that stays readable with
thousands of Pins on screen.
**Requirements:** R-CACHE-1, R-CACHE-2, R-CACHE-3, R-CACHE-4, R-MAP-1, R-MAP-10, R-MAP-11.
**Decisions honoured:** [ADR-0004](../adr/0004-leaflet-usgs-raster-basemaps.md).
**Done means:** you drive to a field with no bars, open the app, and the satellite imagery is
already there.

## Build

1. **Tile cache in Cache Storage**, keyed by basemap name and `z/x/y`. This is our own cache,
   not Workbox route matching — Workbox must not intercept tile requests, or it will start
   caching things we did not ask for.
2. **Cached Area** (R-CACHE-1): three ways to define one — under a Site Boundary with a
   generous buffer, around a Session's Track with a buffer, or an arbitrary rectangle drawn
   on the map. Each takes a zoom range.
3. **Pre-download estimate** (R-CACHE-2): compute the tile count and approximate byte size
   before downloading, using the tile sizes measured in ADR-0004. Show the number, require a
   confirmation, and refuse politely when the estimate would exceed a stated budget.
4. **Downloader**: bounded concurrency, resumable, cancellable, and it reports progress as a
   percentage and as tiles/second. It must not be the thing that freezes the map — run it so
   the UI stays responsive, and pause it automatically when the app is backgrounded.
5. **Cache management** (R-CACHE-3): Settings lists every Cached Area with its tile count,
   size and date, individually deletable, plus "delete all". Diagnostics shows total tile
   cache bytes from `navigator.storage.estimate()`.
6. **Cache-first tile loading**: a tile request checks the cache before the network. A tile
   that is not cached and cannot be fetched renders as the grey "no tile" placeholder from
   step 02, never a crash and never a retry loop.
7. **Cache only what is allowed** (R-CACHE-4): the three USGS layers only. If the Esri World
   Imagery extra is enabled, it is online-only and never written to the cache — enforce this
   in the tile layer factory so it cannot be configured wrong by accident.
8. **Basemap availability per area**: a Site can be cached for all three basemaps; the
   basemap switch must work offline for cached areas and say so for uncached ones.
9. **Clustering** (R-MAP-11): cluster Pins at low zoom, expand on tap, with cluster counts
   that match the current filter. Clusters must respect the filter sheet, not the raw table.
10. **Miss markers and Category colours survive clustering** — a cluster containing only
    Misses must look different from a cluster of Items.
11. **Zoom-range guidance**: the UI suggests a sensible range per area (a Site boundary
    typically z14–z18) and warns when the range is wider than the area needs.
12. **NAIP gaps**: at high zoom, imagery coverage is not uniform. A missing tile at z18 must
    fall back to the next lower zoom's tile rather than going grey, where that tile exists.

## Acceptance criteria

- [ ] Caching a ~100-acre Site boundary at z14–z18 for all three basemaps reports an estimate
      in the low tens of megabytes, completes, and the actual cache size matches the estimate
      within a reasonable margin.
- [ ] In airplane mode, with the app killed and restarted, the cached area renders imagery at
      every zoom level in the cached range, with no grey tiles inside the area.
- [ ] Outside the cached area in airplane mode, tiles render as the grey placeholder and the
      app remains fully usable for logging.
- [ ] Cancelling a download mid-way leaves a valid partial cache, and resuming completes it
      without re-downloading existing tiles.
- [ ] Deleting one Cached Area frees the expected bytes, visible in Diagnostics.
- [ ] An Esri layer, if enabled, writes nothing to Cache Storage — verified by inspecting the
      cache after browsing.
- [ ] 5,000 Pins at a state-level zoom render without jank, with clusters whose counts match
      the filter.
- [ ] Tapping a cluster expands it; tapping a Pin opens its popup card.
- [ ] Total storage after caching 30 Sites at all three basemaps is reported and stays within
      the PRD §11 budget.

## Verify on a phone

1. Cache one Site you have actually detected on. Write down the estimate and the final size.
2. Turn on airplane mode, kill the app, reopen, drive to the Site. The imagery must be there.
3. Zoom to the edge of the Cached Area and confirm the transition to grey is clean.
4. Start a large cache, background the app for a minute, return, and confirm it paused and
   resumed.
5. Cancel a download at 50 %, restart it, and confirm it resumes rather than restarting.
6. Cluster view: zoom out over 5,000 seeded Pins, tap clusters, confirm counts match the list.
7. Check Diagnostics storage figures before and after each of the above.

## Commit

`git commit -m "step 10: cache storage tile cache, cached areas with size estimates, basemap switch, pin clustering"`
