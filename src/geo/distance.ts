/**
 * Ground distance between two positions (step 02 build items 7, 13; R-MAP-2,
 * R-GPS-3, R-TRACK-1).
 *
 * This used to live in `db/repos/sessions.ts`, which is where step 01 needed it
 * for the Track. Step 02 needs the same arithmetic for a popup's distance
 * readout and for the scatter of an averaged fix, and a map module reaching into
 * a repository for a formula is the sort of dependency that later becomes a
 * circular one. So the formula lives here, and the repository re-exports it.
 *
 * It is an equirectangular approximation, not a geodesic solve: about 0.1% over
 * a field, which is far below the error a phone GPS reports. PRD §11's scale
 * ceiling is 5,000 Pins, and this runs once per Pin per popup.
 */

export interface LatLng {
  lat: number
  lon: number
}

/** Mean-earth metres per degree of latitude, and of longitude at the equator. */
export const METRES_PER_DEGREE = 111_195

/** Metres between two positions. WGS84-ish, good enough for a walk and cheap enough to run per point. */
export function distanceM(a: LatLng, b: LatLng): number {
  // Mean-earth metres per degree, not the equatorial pair. Step 01 used
  // 110,540 / 111,320, which are the WGS84 figures at the equator; at the
  // latitudes this app is used at they understate a degree of latitude by about
  // 0.6%, and step 02's phone check compares a distance readout against a map
  // app, which quotes geodesic metres. Mean-earth matches a spherical solve to
  // well inside a metre over a field.
  const dLat = (a.lat - b.lat) * METRES_PER_DEGREE
  const dLon = (a.lon - b.lon) * METRES_PER_DEGREE * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

/**
 * R-GPS-3: the scatter of the readings that went into a mean, in metres. The
 * mean is what gets offered as the pin position; the scatter is what tells the
 * user whether standing still for another few seconds is worth waiting for.
 *
 * Measured from the mean, which is what a detectorist reads as "how much my dot
 * wandered". Null with fewer than two readings, because one fix has no spread to
 * report and inventing a zero would claim a precision the device did not give.
 */
export function scatterM(points: readonly LatLng[], centre: LatLng | null): number | null {
  if (points.length < 2 || centre === null) return null
  let total = 0
  for (const point of points) total += distanceM(point, centre) ** 2
  return Math.sqrt(total / points.length)
}

/**
 * The rectangle that covers a set of positions, padded by `padM` metres on every
 * side. Used to fit the map to the Pins the user can see, and to answer "how
 * many tiles is that" before downloading them (R-CACHE-2).
 */
export function boundsOf(points: readonly LatLng[], padM = 0): { south: number; west: number; north: number; east: number } | null {
  if (points.length === 0) return null
  let south = Infinity
  let north = -Infinity
  let west = Infinity
  let east = -Infinity
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue
    south = Math.min(south, point.lat)
    north = Math.max(north, point.lat)
    west = Math.min(west, point.lon)
    east = Math.max(east, point.lon)
  }
  if (!Number.isFinite(south)) return null
  // Padding in metres, converted to degrees at the middle latitude, which is
  // good enough for a field and keeps the caller from doing its own sums.
  const midLat = (south + north) / 2
  const padLat = padM / METRES_PER_DEGREE
  const padLon = padM / (METRES_PER_DEGREE * Math.max(0.01, Math.cos((midLat * Math.PI) / 180)))
  return {
    south: Math.max(-90, south - padLat),
    north: Math.min(90, north + padLat),
    west: Math.max(-180, west - padLon),
    east: Math.min(180, east + padLon),
  }
}
