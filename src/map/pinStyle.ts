/**
 * Pin appearance, the arithmetic half (step 02 build item 10, R-MAP-1).
 *
 * This file deliberately imports nothing from Leaflet. The style of a Pin is a
 * decision - filled or hollow, which colour, how big - and [rule
 * 3](../../../docs/build/README.md) says a decision like that gets a test, which
 * is not possible while it is welded to a Leaflet type that cannot even be
 * imported under `environment: 'node'`. `pinIcon.ts` is the thin half that hands
 * these numbers to a canvas renderer.
 *
 * Pins are canvas `CircleMarker`s, not DOM markers: PRD section 11 puts the
 * ceiling at 5,000 Pins on screen, and 5,000 SVG elements in the marker pane is
 * the single easiest way to make a phone map stop responding.
 *
 * Step 07 owns the real Category list and its colours; until then there is one
 * colour plus the hollow Miss variant, which is all the map can honestly tell.
 */

/** The recovery colour: a brown that stays readable on NAIP imagery and on the topo sheet. */
export const PIN_COLOUR = '#c2410c'
/** Misses are drawn hollow (R-MAP-1), so this is only an outline colour. */
export const MISS_COLOUR = '#4b5563'
/** A Placed Pin is a claim made by hand, so it looks different on purpose. */
export const PLACED_COLOUR = '#1d4ed8'
export const SELECTED_COLOUR = '#0f766e'

/**
 * Category colour. Step 07 replaces the body of this one function with the real
 * Category list's colours, so nothing else on the map has to change again.
 */
export function pinColourForCategory(categoryId: string): string {
  return categoryId === '' ? MISS_COLOUR : PIN_COLOUR
}

/**
 * A Find with no live Items is a Miss (GLOSSARY), and `categoryId` is derived
 * from its Items, so the empty string is the whole test. R-MAP-1 wants a Miss
 * readable as a different kind of mark, not merely a different colour.
 */
export function isMissCategory(categoryId: string): boolean {
  return categoryId === ''
}

/** Radius in pixels. Small enough that 5,000 of them still read as a field. */
export const PIN_RADIUS_PX = 7
/** A selected Pin is bigger rather than a different colour, so it still reads as itself. */
export const SELECTED_EXTRA_PX = 2

export interface PinStyleOptions {
  categoryId: string
  /** `positionSource: 'hand'` - a Placed Pin (GLOSSARY). */
  placed: boolean
  selected: boolean
}

/** Canvas paint values. Field names match Leaflet's `CircleMarkerOptions`. */
export interface PinStyleValues {
  radius: number
  /** Ring colour. */
  color: string
  /** Ring width in pixels. */
  weight: number
  fillColor: string
  fillOpacity: number
  /** Ring opacity. */
  opacity: number
}

/**
 * The canvas style for a Pin. Hollow means a low `fillOpacity` with a coloured
 * ring, which is what a Miss looks like; a filled disc is a recovery.
 */
export function pinStyleFor(options: PinStyleOptions): PinStyleValues {
  const miss = isMissCategory(options.categoryId)
  const radius = options.selected ? PIN_RADIUS_PX + SELECTED_EXTRA_PX : PIN_RADIUS_PX
  if (options.selected) {
    return {
      radius,
      color: SELECTED_COLOUR,
      weight: 3,
      // A selected Miss keeps a white centre instead of the recovery colour, so
      // selecting it can never make a Miss look like something was recovered.
      fillColor: miss ? '#ffffff' : pinColourForCategory(options.categoryId),
      fillOpacity: 1,
      opacity: 1,
    }
  }
  if (miss) {
    return {
      radius,
      color: missColour(options.placed),
      weight: 2,
      fillColor: '#ffffff',
      fillOpacity: 0.25,
      opacity: 0.95,
    }
  }
  if (options.placed) {
    // A Placed Pin carries no accuracy claim (R-GPS-4), so it gets a white ring
    // to separate it from a GPS Pin.
    return {
      radius,
      color: '#ffffff',
      weight: 2,
      fillColor: PLACED_COLOUR,
      fillOpacity: 1,
      opacity: 1,
    }
  }
  return {
    radius,
    color: '#ffffff',
    weight: 1.5,
    fillColor: PIN_COLOUR,
    fillOpacity: 1,
    opacity: 1,
  }
}

/**
 * A hand-placed Miss keeps the hollow shape but takes the Placed Pin's blue
 * ring, so the two things the user needs to tell apart - what came out of the
 * hole, and how the position was arrived at - are both visible at once.
 */
function missColour(placed: boolean): string {
  return placed ? PLACED_COLOUR : MISS_COLOUR
}
