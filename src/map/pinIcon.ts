/**
 * Pin appearance (step 02 build item 10, R-MAP-1, R-MAP-10).
 *
 * Pins are canvas `CircleMarker`s, not DOM markers. PRD section 11 puts the
 * ceiling at 5,000 Pins on screen, and 5,000 SVG elements in the marker pane is
 * the single easiest way to make a phone map stop responding. A canvas
 * renderer draws them all in one pass.
 *
 * The consequence is that a Pin is a disc, not a teardrop: filled for a
 * recovery, hollow for a Miss (R-MAP-1), ringed when it was a Placed Pin. The
 * shapes that genuinely need DOM - the Cluster count, the user's dot, the Move
 * Pin ghost - are divIcons, and there are never many of those.
 *
 * Step 07 owns the real Category list and its colours; until then there is one
 * colour plus the hollow Miss variant, which is all the map can honestly tell.
 */
import { divIcon, type CircleMarkerOptions, type DivIcon } from 'leaflet'

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

/** Radius in pixels. Small enough that 5,000 of them still read as a field. */
export const PIN_RADIUS_PX = 7

export interface PinStyleOptions {
  categoryId: string
  /** `positionSource: 'hand'` - a Placed Pin (GLOSSARY). */
  placed: boolean
  selected: boolean
}

/**
 * The canvas style for a Pin. Hollow means `fill: false` with a coloured ring,
 * which is what a Miss looks like; a filled disc is a recovery.
 */
export function pinStyle(options: PinStyleOptions): CircleMarkerOptions {
  const isMiss = options.categoryId === ''
  const colour = options.placed ? PLACED_COLOUR : pinColourForCategory(options.categoryId)
  if (options.selected) {
    return {
      radius: PIN_RADIUS_PX + 2,
      color: SELECTED_COLOUR,
      weight: 3,
      fillColor: isMiss ? '#ffffff' : colour,
      fillOpacity: 1,
      opacity: 1,
    }
  }
  if (isMiss) {
    return {
      radius: PIN_RADIUS_PX,
      color: colour,
      weight: 2,
      fillColor: '#ffffff',
      fillOpacity: 0.25,
      opacity: 0.95,
    }
  }
  if (options.placed) {
    // A Placed Pin carries no accuracy claim (R-GPS: "A Placed Pin carries no
    // accuracy claim"), so it gets a white ring to separate it from a GPS Pin.
    return {
      radius: PIN_RADIUS_PX,
      color: '#ffffff',
      weight: 2,
      fillColor: colour,
      fillOpacity: 1,
      opacity: 1,
    }
  }
  return {
    radius: PIN_RADIUS_PX,
    color: '#ffffff',
    weight: 1.5,
    fillColor: colour,
    fillOpacity: 1,
    opacity: 1,
  }
}

/** The marker shown while Move Pin waits for a single tap (R-EDIT-1). */
export function movePinIcon(): DivIcon {
  return divIcon({
    className: 'df-pin',
    html: `<svg viewBox="0 0 26 34" width="26" height="34" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 1C6.5 1 1.3 6.2 1.3 12.7c0 8.9 11.7 19.6 11.7 19.6s11.7-10.7 11.7-19.6C24.7 6.2 19.5 1 13 1z" fill="#ffffff" stroke="${SELECTED_COLOUR}" stroke-width="3" stroke-dasharray="4 3"/>
      <circle cx="13" cy="12.6" r="3.4" fill="${SELECTED_COLOUR}"/>
    </svg>`,
    iconSize: [26, 34],
    iconAnchor: [13, 33],
  })
}

/**
 * Cluster (GLOSSARY: Cluster). A cluster of Misses must look different from a
 * cluster of recoveries, which is why the caller says whether every Pin inside
 * it is a Miss.
 */
export function clusterIcon(count: number, allMiss: boolean): DivIcon {
  const size = count > 999 ? 46 : count > 99 ? 42 : 38
  const colour = allMiss ? MISS_COLOUR : PIN_COLOUR
  const label = count > 999 ? '999+' : String(count)
  return divIcon({
    className: 'df-cluster',
    html: `<span class="df-cluster__disc" style="width:${size}px;height:${size}px;border-color:${colour};background:${allMiss ? '#ffffff' : colour}">
        <span class="df-cluster__count" style="color:${allMiss ? colour : '#ffffff'}">${label}</span>
      </span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * The user's position (R-MAP-6): blue dot plus a heading wedge. The accuracy
 * circle is a separate Leaflet circle, because it has to scale with the map
 * while the dot must not.
 */
export function userLocationIcon(headingDeg: number, showHeading: boolean, stale: boolean): DivIcon {
  const size = 34
  const wedge = showHeading
    ? '<path d="M17 17 L9.4 1.6 A16.6 16.6 0 0 1 24.6 1.6 Z" fill="rgba(37,99,235,0.40)"/>'
    : ''
  const fill = stale ? '#8aa0b8' : '#2563eb'
  return divIcon({
    className: 'df-userdot',
    html: `<svg viewBox="0 0 34 34" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(${headingDeg}deg)">${wedge}<circle cx="17" cy="17" r="7.5" fill="${fill}" stroke="#ffffff" stroke-width="2.5"/></svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}
