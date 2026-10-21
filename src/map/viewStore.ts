/**
 * What the map remembered (step 02 build item 14).
 *
 * The Field map has to reopen where the user left it: per-Site centre and zoom,
 * plus the last position the phone reported. This lives in `meta` because it is
 * bookkeeping about this installation rather than a record - the same argument
 * that puts the durability probe there - and because a Site's zoom is exactly the
 * kind of thing that must survive an app update.
 *
 * The encoding is a plain string, not JSON: it is three numbers, it is written by
 * a phone at arm's length in a field, and a hand-edited or stale value has to be
 * recognisable as broken rather than half-parsed.
 */
import { META_KEYS, type MetaRepository } from '../db/repos/meta'
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM } from './basemaps'

export interface MapView {
  lat: number
  lon: number
  zoom: number
}

/** Five decimal places is about 0.1 m: finer than a phone fix, coarser than a coordinate. */
const COORD_DP = 5

export function viewKeyFor(siteId: string): string {
  return `${META_KEYS.mapViewPrefix}:${siteId}`
}

export function isMapView(value: unknown): value is MapView {
  if (typeof value !== 'object' || value === null) return false
  const view = value as Record<string, unknown>
  const { lat, lon, zoom } = view
  if (typeof lat !== 'number' || typeof lon !== 'number' || typeof zoom !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(zoom)) return false
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MAP_MIN_ZOOM
  return Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, Math.round(zoom)))
}

export function encodeView(view: MapView): string {
  return `${view.lat.toFixed(COORD_DP)},${view.lon.toFixed(COORD_DP)},${clampZoom(view.zoom)}`
}

/** Null for anything that is not three usable numbers, including an empty value. */
export function decodeView(value: string | null | undefined): MapView | null {
  if (!value) return null
  const parts = value.split(',')
  if (parts.length !== 3) return null
  // Number('') is 0, so an empty field would otherwise read as the equator.
  if (parts.some((part) => part.trim() === '')) return null
  const [lat, lon, zoom] = parts.map((part) => Number(part))
  if (!isMapView({ lat, lon, zoom })) return null
  return { lat, lon, zoom: clampZoom(zoom) }
}

/**
 * Where the map should open for a Site: the Site's own view, then the last view
 * anywhere, then nowhere at all - which the caller reads as "follow the dot".
 * A Site with no saved view must not inherit another Site's zoom, because the
 * whole point of remembering per-Site is that a pasture and a beach are viewed
 * at different scales.
 */
export function startViewFor(siteView: MapView | null, lastView: MapView | null): MapView | null {
  if (siteView) return siteView
  return lastView
}

/**
 * Zoom to open at when the only thing remembered is a position: close enough to
 * see the field the user is standing in, far enough to still find it again.
 */
export const POSITION_ZOOM = 16

/**
 * Where the map goes when nothing at all has been saved and there is no fix yet.
 * The British Isles, at a zoom that shows every Site this app will ever have:
 * the app is written for a British detectorist (PRD §1), and a map that opens on
 * the mid-Atlantic makes the user find their own country before they can do
 * anything with it.
 */
export const FALLBACK_VIEW: MapView = { lat: 54, lon: -2, zoom: MAP_MIN_ZOOM }

/**
 * The view to build the map with, in the order the app is allowed to guess:
 * this Site's view, then the last view anywhere, then the last position the
 * phone reported, then the fallback. It never returns null, because a map with
 * no centre is a grey rectangle, and a grey rectangle looks like a broken app
 * even when it is only waiting for a fix.
 */
export function bootViewFor(
  siteView: MapView | null,
  lastView: MapView | null,
  lastPosition: { lat: number; lon: number } | null,
): MapView {
  const saved = startViewFor(siteView, lastView)
  if (saved) return saved
  if (lastPosition && Number.isFinite(lastPosition.lat) && Number.isFinite(lastPosition.lon)) {
    return { lat: lastPosition.lat, lon: lastPosition.lon, zoom: POSITION_ZOOM }
  }
  return FALLBACK_VIEW
}

/** Reads and writes the three map keys through the meta repository. */
export function createViewStore(meta: MetaRepository) {
  async function read(key: string): Promise<MapView | null> {
    return decodeView(await meta.get(key))
  }
  return {
    /** The view for one Site, or null if it has never been opened. */
    viewFor(siteId: string): Promise<MapView | null> {
      return read(viewKeyFor(siteId))
    },

    lastView(): Promise<MapView | null> {
      return read(META_KEYS.mapLastView)
    },

    /**
     * Saves the view for the Site the user is looking at and as the app-wide
     * last view. Both, because criterion 6 of the phone check reopens the map
     * "near the last position" rather than near some other Site's centre.
     */
    async save(siteId: string, view: MapView): Promise<void> {
      if (!isMapView(view)) return
      const text = encodeView(view)
      await meta.set(viewKeyFor(siteId), text)
      await meta.set(META_KEYS.mapLastView, text)
    },

    /** The last position the phone reported, for a cold start with no saved view. */
    async saveLastPosition(lat: number, lon: number): Promise<void> {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
      await meta.set(META_KEYS.mapLastPosition, `${lat.toFixed(COORD_DP)},${lon.toFixed(COORD_DP)}`)
    },

    async lastPosition(): Promise<{ lat: number; lon: number } | null> {
      const text = await meta.get(META_KEYS.mapLastPosition)
      if (!text) return null
      const parts = text.split(',')
      if (parts.length !== 2 || parts.some((part) => part.trim() === '')) return null
      const [lat, lon] = parts.map((part) => Number(part))
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      return { lat, lon }
    },
  }
}

export type ViewStore = ReturnType<typeof createViewStore>
