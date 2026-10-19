/**
 * Basemaps (GLOSSARY: Basemap) - the three USGS layers named in ADR-0004.
 *
 * USGS The National Map serves these as a plain `z/x/y` ArcGIS MapServer tile
 * grid, which is the only reason they can be cached by hand in step 10: the URL
 * is the whole contract, there is no token, and the tiles are public domain.
 *
 * Native zoom tops out at 16 for all three. Zooming past that re-renders the
 * level-16 tiles rather than asking for tiles that do not exist (R-MAP-10 in
 * step 02's build list: `maxZoom` 19 on the map, `maxNativeZoom` here).
 */

export type BasemapId = 'imagery' | 'hybrid' | 'topo'

export interface Basemap {
  id: BasemapId
  /** The label the switcher shows. These are the GLOSSARY names. */
  label: string
  /** Leaflet tile URL template. */
  url: string
  attribution: string
  /** Highest zoom the server actually has tiles for. */
  maxNativeZoom: number
  /** Highest zoom the map will let the user go, re-rendering native tiles above this. */
  maxZoom: number
  /**
   * True when tiles may be written to Cache Storage. R-CACHE-4: only
   * public-domain USGS layers. Anything false here is online-only.
   */
  cacheable: boolean
}

/** USGS tiles stop being useful past this; asking for z17 returns an error image. */
export const USGS_MAX_NATIVE_ZOOM = 16

/** The map itself may zoom further; the tiles just get scaled up. */
export const MAP_MAX_ZOOM = 19

/**
 * Zoomed out too far, one screen covers a whole state and the tile requests
 * alone would be the heaviest thing the app does. R-MAP-10's ceiling is a
 * responsive map, so the map refuses to go here at all.
 */
export const MAP_MIN_ZOOM = 6

const USGS_ATTRIBUTION =
  'Basemap from USGS The National Map &mdash; <a href="https://www.usgs.gov/priorities/coordination-and-science/national-map">usgs.gov</a>'

export const BASEMAPS: readonly Basemap[] = [
  {
    id: 'imagery',
    label: 'Imagery',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    attribution: USGS_ATTRIBUTION,
    maxNativeZoom: USGS_MAX_NATIVE_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    cacheable: true,
  },
  {
    id: 'hybrid',
    label: 'Hybrid',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: USGS_ATTRIBUTION,
    maxNativeZoom: USGS_MAX_NATIVE_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    cacheable: true,
  },
  {
    id: 'topo',
    label: 'Topo',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: USGS_ATTRIBUTION,
    maxNativeZoom: USGS_MAX_NATIVE_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    cacheable: true,
  },
]

export const DEFAULT_BASEMAP: BasemapId = 'imagery'

/** Look a Basemap up by id. Unknown ids fall back to the default, because the
 * value comes out of `meta` and a hand-edited or stale value must not blank the map. */
export function basemapById(id: string | undefined | null): Basemap {
  const found = BASEMAPS.find((b) => b.id === id)
  return found ?? BASEMAPS.find((b) => b.id === DEFAULT_BASEMAP) ?? BASEMAPS[0]
}

/** The tile coordinates a Leaflet template refers to, for cache keys and tests. */
export interface TileRef {
  z: number
  x: number
  y: number
}

/**
 * Fill a `{z}/{y}/{x}` template. ArcGIS MapServer orders the path z/y/x, which
 * is the reverse of the usual z/x/y - getting this backwards produces tiles of
 * the wrong field with a 200, so it is written once, here.
 */
export function tileUrl(basemap: Basemap, tile: TileRef): string {
  return basemap.url
    .replace('{z}', String(tile.z))
    .replace('{y}', String(tile.y))
    .replace('{x}', String(tile.x))
}

/** Stable cache key for one tile: the Basemap is part of it, or switching layers
 * would read the previous layer's tiles (step 10). */
export function tileCacheKey(basemap: Basemap, tile: TileRef): string {
  return `${basemap.id}/${tile.z}/${tile.x}/${tile.y}`
}

/**
 * How many tiles a zoom range covers over a bounds. R-CACHE-2 has to answer
 * this before downloading anything, so the maths lives with the Basemap rather
 * than in the UI.
 */
export function tileCountForBounds(bounds: { south: number; west: number; north: number; east: number }, minZoom: number, maxZoom: number): number {
  let total = 0
  for (let z = minZoom; z <= maxZoom; z += 1) {
    const n = 2 ** z
    const x0 = Math.floor(((bounds.west + 180) / 360) * n)
    const x1 = Math.floor(((bounds.east + 180) / 360) * n)
    const y0 = Math.floor(latToTileY(bounds.north, n))
    const y1 = Math.floor(latToTileY(bounds.south, n))
    total += (x1 - x0 + 1) * (y1 - y0 + 1)
  }
  return total
}

function latToTileY(lat: number, n: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const sin = Math.sin((clamped * Math.PI) / 180)
  return ((0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n)
}
