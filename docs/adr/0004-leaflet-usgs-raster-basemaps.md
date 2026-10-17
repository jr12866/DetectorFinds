# 4. Leaflet with USGS raster basemaps, cached in Cache Storage

Date: 2026-10-17
Status: Accepted

## Context

The map is the front door (PRD §5). It must work with no signal, show satellite imagery
by default with a topographic alternative, carry up to 5,000 Pins plus clustering, draw
Site Boundaries and Tracks, and let the user pre-cache the ground they are about to walk.
Detecting happens in the United States only.

Verified against live endpoints in October 2026:

| Source | Result |
| --- | --- |
| `basemap.nationalmap.gov/.../USGSTopo`, `USGSImageryOnly`, `USGSImageryTopo` | HTTP 200, 256 px JPEG, `Access-Control-Allow-Origin: *`, `Cache-Control: max-age=86400`, no key, no registration, public domain |
| `server.arcgisonline.com/.../World_Imagery` | HTTP 200, CORS `*`, but attribution-encumbered and its terms do not clearly permit offline tile caching |
| `tiles.openfreemap.org` (vector) | HTTP 200, free, unlimited, no key, OSM data under ODbL |
| `USGSHybrid` | 404 — that service name is gone; `USGSImageryTopo` is its replacement |

At the scale that matters, raster caching is cheap: a 100-acre Site cached for zooms
14–18 is roughly 86 tiles per basemap, about 2.6 MB. Thirty Sites across three basemaps is
well under 300 MB, far inside the quota ADR-0003 gives us.

## Decision

**Leaflet** with raster XYZ tiles from **USGS The National Map**. Three basemaps in the
switcher: Imagery (`USGSImageryOnly`, the default), Hybrid (`USGSImageryTopo`), Topo
(`USGSTopo`). Offline caching is a Cache Storage tile cache written by an explicit
"Cached Area" walk over the XYZ range.

Esri World Imagery may be offered as an explicitly-labelled online-only extra. It is
**never** included in a Cached Area. OpenFreeMap vector tiles are a v2 upgrade, not an
MVP dependency.

## Consequences

- Pins, boundaries and Tracks are Leaflet layers, drawn with the canvas renderer and
  clustered. This is the boring, well-trodden path; the alternative (MapLibre GL with
  GeoJSON sources) scales better and costs a lot of marker and popup ergonomics we need on
  day one.
- All three default basemaps are public domain, so caching tiles offline has no licensing
  question attached to it. Attribution is still shown in the map corner because it is the
  courtesy and the terms of the source, not because it is risky.
- NAIP imagery is not uniformly available at high zoom across the country, and the USGS
  services' usable maximum zoom varies by region. The app must treat a blank or failed tile
  as normal (R-MAP-11) and must not spin, block, or lose the Pins because of it.
- Raster means blurry past the native resolution of the imagery. Accepted: the map's job
  here is "which hole is this" and "what is that field", not crisp cartography.
- Tile caching is our code, not Workbox's route matching: a Cached Area is a deliberate,
  counted, deletable object in Settings (R-CACHE-3), not an invisible runtime cache that
  grows without bound.
- Leaflet's default coordinate handling is Web Mercator with lat/lon WGS84 input, which is
  what the GPS gives us. No projection work is needed.
