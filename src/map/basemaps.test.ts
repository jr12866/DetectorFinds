import { describe, expect, it } from 'vitest'
import {
  BASEMAPS,
  DEFAULT_BASEMAP,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  USGS_MAX_NATIVE_ZOOM,
  basemapById,
  tileCacheKey,
  tileCountForBounds,
  tileUrl,
  type TileRef,
} from './basemaps'

/** A field near Andover, Hampshire: the kind of bounds step 10 caches. */
const FIELD = { south: 51.0, west: -1.0, north: 51.1, east: -0.9 }

describe('the three basemaps (R-MAP-4)', () => {
  it('there are exactly the three layers ADR-0004 names, with the GLOSSARY labels', () => {
    expect(BASEMAPS.map((b) => b.label)).toEqual(['Imagery', 'Hybrid', 'Topo'])
    expect(BASEMAPS.map((b) => b.id)).toEqual(['imagery', 'hybrid', 'topo'])
  })

  it('Imagery is the default', () => {
    expect(DEFAULT_BASEMAP).toBe('imagery')
    expect(basemapById(undefined).id).toBe('imagery')
  })

  it('each one is a public-domain USGS The National Map layer', () => {
    for (const basemap of BASEMAPS) {
      expect(basemap.url).toContain('basemap.nationalmap.gov/arcgis/rest/services/')
      expect(basemap.url).toContain('/MapServer/tile/{z}/{y}/{x}')
      expect(basemap.cacheable).toBe(true)
      expect(basemap.attribution).toContain('USGS')
    }
    expect(BASEMAPS.map((b) => b.url)).toEqual([
      expect.stringContaining('USGSImageryOnly'),
      expect.stringContaining('USGSImageryTopo'),
      expect.stringContaining('USGSTopo'),
    ])
  })

  it('an unknown id falls back rather than blanking the map', () => {
    // The value comes out of `meta`, so it can be stale or hand-edited.
    expect(basemapById('osm').id).toBe(DEFAULT_BASEMAP)
    expect(basemapById(null).id).toBe(DEFAULT_BASEMAP)
    expect(basemapById('').id).toBe(DEFAULT_BASEMAP)
  })

  it('the three layers are distinct, or the switcher would be a no-op', () => {
    expect(new Set(BASEMAPS.map((b) => b.url)).size).toBe(3)
  })
})

describe('zoom bounds (R-MAP-10)', () => {
  it('the map zooms past what USGS serves without asking for tiles that do not exist', () => {
    for (const basemap of BASEMAPS) {
      expect(basemap.maxNativeZoom).toBe(USGS_MAX_NATIVE_ZOOM)
      expect(basemap.maxZoom).toBe(MAP_MAX_ZOOM)
      expect(basemap.maxZoom).toBeGreaterThan(basemap.maxNativeZoom)
    }
    expect(USGS_MAX_NATIVE_ZOOM).toBe(16)
    expect(MAP_MAX_ZOOM).toBe(19)
  })

  it('the map refuses to zoom out to a whole-state view', () => {
    // One screen at z5 covers several counties, and the tile requests alone
    // would be the heaviest thing the app does.
    expect(MAP_MIN_ZOOM).toBe(6)
    expect(MAP_MIN_ZOOM).toBeGreaterThan(0)
    expect(MAP_MIN_ZOOM).toBeLessThan(USGS_MAX_NATIVE_ZOOM)
  })
})

describe('tile urls and cache keys', () => {
  const tile: TileRef = { z: 13, x: 4073, y: 2740 }

  it('fills the ArcGIS z/y/x template in the order the server wants it', () => {
    // Spelling this out because x/y the wrong way round returns a 200 with the
    // wrong field on it, which is the worst kind of bug to find in a field.
    const url = tileUrl(basemapById('imagery'), tile)
    expect(url).toMatch(/\/tile\/13\/2740\/4073$/)
  })

  it('a cache key names the basemap, or switching layers would read the old layer', () => {
    const imagery = tileCacheKey(basemapById('imagery'), tile)
    const topo = tileCacheKey(basemapById('topo'), tile)
    expect(imagery).not.toBe(topo)
    expect(imagery).toBe('imagery/13/4073/2740')
  })

  it('the cache key is the tile coordinates, not the whole url', () => {
    expect(tileCacheKey(basemapById('topo'), tile)).not.toContain('http')
  })
})

describe('tileCountForBounds (R-CACHE-2)', () => {
  it('counts the tiles one zoom level needs over a field', () => {
    // 0.1 deg of longitude at z13 spans 3 columns, 0.1 deg of latitude spans 5
    // rows. Worked out by hand against the Web Mercator formulas.
    expect(tileCountForBounds(FIELD, 13, 13)).toBe(15)
  })

  it('sums across a zoom range', () => {
    const one = tileCountForBounds(FIELD, 13, 13)
    const range = tileCountForBounds(FIELD, 12, 14)
    expect(range).toBe(tileCountForBounds(FIELD, 12, 12) + one + tileCountForBounds(FIELD, 14, 14))
    expect(range).toBeGreaterThan(one)
  })

  it('grows roughly fourfold per zoom level', () => {
    // A 1 degree box, so the tile counts are big enough that rounding at the
    // edges of the box cannot dominate the ratio.
    const oneDegree = { south: 51.0, west: -1.0, north: 52.0, east: 0.0 }
    const z13 = tileCountForBounds(oneDegree, 13, 13)
    const z14 = tileCountForBounds(oneDegree, 14, 14)
    expect(z14 / z13).toBeGreaterThan(3)
    expect(z14 / z13).toBeLessThan(5)
  })

  it('a bigger area costs more tiles', () => {
    const double = { south: 51.0, west: -1.0, north: 51.2, east: -0.8 }
    expect(tileCountForBounds(double, 13, 13)).toBeGreaterThan(tileCountForBounds(FIELD, 13, 13))
  })

  it('never counts a column or row that does not exist at the edge of the world', () => {
    // Before the clamp this asked for two columns at z0, where there is one.
    expect(tileCountForBounds({ south: -85, west: -180, north: 85, east: 180 }, 0, 0)).toBe(1)
    const wholeWorldZ2 = tileCountForBounds({ south: -85, west: -180, north: 85, east: 180 }, 2, 2)
    expect(wholeWorldZ2).toBe(16)
  })

  it('a degenerate bounds still costs one tile', () => {
    expect(tileCountForBounds({ south: 51.0, west: -1.0, north: 51.0, east: -1.0 }, 13, 13)).toBe(1)
  })
})
