/**
 * The popup card a Pin opens (step 02 build items 11 and 13; R-MAP-2).
 *
 * R-MAP-2 asks for thumbnail, Category, Date On, Site name, distance from the
 * current position and an Open button. Deciding those strings here, rather than
 * in JSX, is what makes criterion 7 testable: "the distance figure is correct
 * against a manually computed value" is a claim about arithmetic, and the phone
 * check is only the last place it gets checked.
 *
 * Until step 03 there is no Find detail screen, so Open goes to the route that
 * currently shows the Find's raw fields - which is what the build list asks for.
 */
import type { Find } from '../db/types'
import { distanceM, type LatLng } from '../geo/distance'
import { accuracyKnown, accuracyText, coordText, dayText, distanceText } from './readouts'

/** What the card says about a Find with no Items (GLOSSARY: Miss). */
export const MISS_LABEL = 'Miss'
/** A Find the user has not put on a Site yet, which step 02 allows on purpose. */
export const NO_SITE_LABEL = 'No Site'

export interface PopupCard {
  findId: string
  /** The user's own note if there is one, otherwise a plain word for the record. */
  title: string
  categoryLabel: string
  /** Date On (GLOSSARY), as a calendar day. */
  dayOn: string
  siteName: string
  /** R-MAP-2: distance from where the user is standing now. */
  distanceLabel: string
  /** Blank for a Placed Pin, which carries no accuracy claim (R-GPS-4). */
  accuracyLabel: string
  positionSourceLabel: string
  coordLabel: string
  /** Route to Open this Find. */
  openPath: string
  /** Photo to show, or null for no thumbnail. Step 03 is what puts photos here. */
  photoId: string | null
}

export interface PopupContext {
  /** Resolved Site name; '' when the Find has no Site. */
  siteName: string
  /** Where the user is standing, or null when there is no fix to measure from. */
  from: LatLng | null
  photoId?: string | null
}

/** Distance from the user to this Find, or null when there is nothing to measure from. */
export function distanceToFind(find: Pick<Find, 'lat' | 'lon'>, from: LatLng | null): number | null {
  if (from === null) return null
  if (!isPlotted(find)) return null
  return distanceM(from, { lat: find.lat, lon: find.lon })
}

/** A Find at 0/0 has no position; it must not be drawn in the sea or measured to. */
export function isPlotted(find: Pick<Find, 'lat' | 'lon'>): boolean {
  return !(find.lat === 0 && find.lon === 0)
}

export function popupCardFor(find: Find, context: PopupContext): PopupCard {
  const distance = distanceToFind(find, context.from)
  return {
    findId: find.id,
    title: find.note.trim() || (find.itemCount === 0 ? MISS_LABEL : 'Find'),
    categoryLabel: find.categoryId === '' ? MISS_LABEL : find.categoryId,
    dayOn: dayText(find.foundAt),
    siteName: context.siteName.trim() || NO_SITE_LABEL,
    distanceLabel: distanceText(distance),
    accuracyLabel: accuracyKnown(find.accuracyM) ? accuracyText(find.accuracyM) : '',
    positionSourceLabel: find.positionSource === 'hand' ? 'Placed by hand' : 'GPS',
    coordLabel: coordText(find.lat, find.lon),
    openPath: `/finds/${find.id}`,
    photoId: context.photoId ?? null,
  }
}
