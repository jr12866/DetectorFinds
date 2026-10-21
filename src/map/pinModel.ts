/**
 * Find to Pin (step 02 build items 10 and 11; R-MAP-1).
 *
 * The map does not draw a `Find`, it draws this: the handful of fields a canvas
 * circle needs. Keeping the mapping in one place means the Leaflet layer never
 * decides anything about a record, and the one rule that does get decided here -
 * a Find with no position is not drawn at all - is testable.
 *
 * That rule is not cosmetic. `lat`/`lon` of 0/0 is the schema's "no position",
 * and a map that plots it puts a Find in the sea off Ghana, where it then looks
 * like a real record in a real place.
 */
import type { Find } from '../db/types'
import { isPlotted } from './popupCard'

export interface PinDescriptor {
  id: string
  lat: number
  lon: number
  /** '' means a Miss (GLOSSARY), which the style draws hollow. */
  categoryId: string
  /** `positionSource: 'hand'` - a Placed Pin. */
  placed: boolean
  selected: boolean
}

/** A Find the map is allowed to put a mark on. */
export function isPlottableFind(find: Pick<Find, 'lat' | 'lon'>): boolean {
  return isPlotted(find) && Number.isFinite(find.lat) && Number.isFinite(find.lon)
}

export function pinFor(find: Find, selected: boolean): PinDescriptor {
  return {
    id: find.id,
    lat: find.lat,
    lon: find.lon,
    categoryId: find.categoryId,
    placed: find.positionSource === 'hand',
    selected,
  }
}

/**
 * The Pins for a set of Finds, in the order they were given. Newest-first is the
 * caller's business (`queryFinds` already sorts that way for lists); the map does
 * not sort, because the canvas draws every Pin it is given either way.
 */
export function pinDescriptors(finds: readonly Find[], selectedId: string | null = null): PinDescriptor[] {
  const pins: PinDescriptor[] = []
  for (const find of finds) {
    if (!isPlottableFind(find)) continue
    pins.push(pinFor(find, find.id === selectedId))
  }
  return pins
}

/** How many live Finds the map is refusing to draw, for the Diagnostics count. */
export function unplottableCount(finds: readonly Find[]): number {
  let count = 0
  for (const find of finds) if (!isPlottableFind(find)) count += 1
  return count
}
