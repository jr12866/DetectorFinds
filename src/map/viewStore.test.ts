import { describe, expect, it } from 'vitest'
import type { MetaRepository } from '../db/repos/meta'
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM } from './basemaps'
import {
  bootViewFor,
  clampZoom,
  createViewStore,
  decodeView,
  encodeView,
  FALLBACK_VIEW,
  isMapView,
  POSITION_ZOOM,
  startViewFor,
  viewKeyFor,
} from './viewStore'

/** The meta table, replaced by a Map: this module only ever uses get and set. */
function fakeMeta() {
  const rows = new Map<string, string>()
  const meta = {
    get: async (key: string) => rows.get(key),
    set: async (key: string, value: string) => {
      rows.set(key, value)
    },
    remove: async (key: string) => {
      rows.delete(key)
    },
  }
  return { meta: meta as unknown as MetaRepository, rows }
}

describe('encodeView / decodeView', () => {
  it('round-trips a view, to the five decimal places it is stored at', () => {
    const view = { lat: 51.234567, lon: -1.456789, zoom: 17 }
    expect(decodeView(encodeView(view))).toEqual({ lat: 51.23457, lon: -1.45679, zoom: 17 })
  })

  it('does not store more precision than a phone fix can produce', () => {
    expect(encodeView({ lat: 51.12345678901234, lon: -1.0000000001, zoom: 16 })).toBe('51.12346,-1.00000,16')
  })

  it('refuses to store a zoom the map will not accept', () => {
    expect(decodeView(encodeView({ lat: 51, lon: -1, zoom: 3 }))?.zoom).toBe(MAP_MIN_ZOOM)
    expect(decodeView(encodeView({ lat: 51, lon: -1, zoom: 40 }))?.zoom).toBe(MAP_MAX_ZOOM)
  })

  it('says null for anything that is not three usable numbers', () => {
    for (const junk of ['', undefined, null, 'nonsense', '51.1', '51.1,-1.2', '51.1,-1.2,16,extra', 'a,b,c', ',,']) {
      expect(decodeView(junk)).toBeNull()
    }
  })

  it('says null for a coordinate that is off the earth', () => {
    expect(decodeView('91,-1,16')).toBeNull()
    expect(decodeView('51,181,16')).toBeNull()
    expect(decodeView('NaN,NaN,16')).toBeNull()
    expect(decodeView('Infinity,-1,16')).toBeNull()
  })

  it('isMapView rejects the shapes a stale meta row could hold', () => {
    expect(isMapView(null)).toBe(false)
    expect(isMapView(undefined)).toBe(false)
    expect(isMapView('51,-1,16')).toBe(false)
    expect(isMapView({ lat: 51, lon: -1 })).toBe(false)
    expect(isMapView({ lat: '51', lon: '-1', zoom: 16 })).toBe(false)
    expect(isMapView({ lat: 51, lon: -1, zoom: Number.NaN })).toBe(false)
    expect(isMapView({ lat: 51, lon: -1, zoom: 16 })).toBe(true)
  })

  it('clampZoom keeps a whole zoom inside the map bounds', () => {
    expect(clampZoom(0)).toBe(MAP_MIN_ZOOM)
    expect(clampZoom(99)).toBe(MAP_MAX_ZOOM)
    expect(clampZoom(16.6)).toBe(17)
    expect(clampZoom(Number.NaN)).toBe(MAP_MIN_ZOOM)
  })
})

describe('view keys', () => {
  it('each Site gets its own view', () => {
    expect(viewKeyFor('site-a')).not.toBe(viewKeyFor('site-b'))
  })

  it('the unassigned bucket has a key of its own rather than no key', () => {
    // Finds logged before a Site is chosen are normal in step 02, and their map
    // position is worth remembering too.
    expect(viewKeyFor('')).toBe('mapView:')
  })
})

describe('createViewStore', () => {
  it('a Site with no saved view reads as null, not as a zeroed view', async () => {
    const { meta } = fakeMeta()
    const store = createViewStore(meta)
    expect(await store.viewFor('never-opened')).toBeNull()
    expect(await store.lastView()).toBeNull()
  })

  it('saving writes the Site view and the app-wide last view', async () => {
    const { meta, rows } = fakeMeta()
    const store = createViewStore(meta)
    await store.save('site-a', { lat: 51.1, lon: -1.2, zoom: 17 })
    expect(await store.viewFor('site-a')).toEqual({ lat: 51.1, lon: -1.2, zoom: 17 })
    expect(await store.lastView()).toEqual({ lat: 51.1, lon: -1.2, zoom: 17 })
    expect(rows.size).toBe(2)
  })

  it('one Site view does not leak into another Site', async () => {
    const { meta } = fakeMeta()
    const store = createViewStore(meta)
    await store.save('pasture', { lat: 51.2, lon: -1.3, zoom: 18 })
    await store.save('beach', { lat: 50.7, lon: -1.9, zoom: 15 })
    expect((await store.viewFor('pasture'))?.zoom).toBe(18)
    expect((await store.viewFor('beach'))?.zoom).toBe(15)
  })

  it('refuses to save a nonsense view, so a bad frame cannot poison what the next open reads', async () => {
    const { meta, rows } = fakeMeta()
    const store = createViewStore(meta)
    await store.save('site-a', { lat: Number.NaN, lon: -1.2, zoom: 17 })
    expect(rows.size).toBe(0)
    expect(await store.viewFor('site-a')).toBeNull()
  })

  it('the last position round-trips, which is what a cold map opens on', async () => {
    const { meta } = fakeMeta()
    const store = createViewStore(meta)
    expect(await store.lastPosition()).toBeNull()
    await store.saveLastPosition(51.123456789, -1.987654321)
    expect(await store.lastPosition()).toEqual({ lat: 51.12346, lon: -1.98765 })
  })

  it('ignores a position the device never reported', async () => {
    const { meta, rows } = fakeMeta()
    const store = createViewStore(meta)
    await store.saveLastPosition(0 / 0, -1)
    expect(rows.size).toBe(0)
  })

  it('a corrupt last position reads as null rather than as a point in the sea', async () => {
    const { meta, rows } = fakeMeta()
    rows.set('mapLastPosition', 'not,a,position')
    expect(await createViewStore(meta).lastPosition()).toBeNull()
  })
})

describe('startViewFor', () => {
  const site = { lat: 51.2, lon: -1.3, zoom: 18 }
  const last = { lat: 50.7, lon: -1.9, zoom: 15 }

  it('prefers the Site view', () => {
    expect(startViewFor(site, last)).toEqual(site)
  })

  it('falls back to the last view when this Site has none', () => {
    expect(startViewFor(null, last)).toEqual(last)
  })

  it('falls back to nothing, which the caller reads as follow the dot', () => {
    expect(startViewFor(null, null)).toBeNull()
  })
})

describe('bootViewFor (build item 14)', () => {
  const site = { lat: 51.2, lon: -1.3, zoom: 18 }
  const last = { lat: 50.7, lon: -1.9, zoom: 15 }

  it('prefers the Site view, then the last view anywhere', () => {
    expect(bootViewFor(site, last, { lat: 1, lon: 1 })).toEqual(site)
    expect(bootViewFor(null, last, { lat: 1, lon: 1 })).toEqual(last)
  })

  it('opens on the last known position when no view was ever saved', () => {
    expect(bootViewFor(null, null, { lat: 52.6, lon: 1.3 })).toEqual({ lat: 52.6, lon: 1.3, zoom: POSITION_ZOOM })
  })

  it('never hands the caller a map with no centre, because that is a grey rectangle', () => {
    const view = bootViewFor(null, null, null)
    expect(view).toEqual(FALLBACK_VIEW)
    expect(isMapView(view)).toBe(true)
  })

  it('refuses a remembered position that is not a number', () => {
    expect(bootViewFor(null, null, { lat: Number.NaN, lon: 1 })).toEqual(FALLBACK_VIEW)
  })

  it('the fallback is somewhere this app is used, at a zoom the map can actually show', () => {
    expect(FALLBACK_VIEW.lat).toBeGreaterThan(49)
    expect(FALLBACK_VIEW.lat).toBeLessThan(61)
    expect(clampZoom(FALLBACK_VIEW.zoom)).toBe(FALLBACK_VIEW.zoom)
    expect(clampZoom(POSITION_ZOOM)).toBe(POSITION_ZOOM)
  })
})
