/**
 * Row shapes for every store in the database (step 01).
 *
 * Two rules run through this whole file, and both come from IndexedDB rather
 * than from taste:
 *
 * 1. A value that is not a valid index key (null, undefined, boolean) cannot
 *    appear in an indexed field. So "not in the Bin" is `deletedAt: 0`, "has no
 *    Site" is `siteId: ''`, "not recorded" is `0` for numbers and `''` for
 *    strings. GLOSSARY talks about `deletedAt` being null; the sentinel is the
 *    IndexedDB-compatible spelling of the same thing and is documented in
 *    docs/build/01-data-layer.md.
 * 2. Every optional text field is `''` rather than absent, so a record read back
 *    after a schema upgrade always has the same shape.
 *
 * Units follow ADR-0006: everything stored is SI (metres, grams, millimetres,
 * square metres). Imperial is a display concern and lives in src/units.
 */

/** A timestamp in ms since the epoch. */
export type Millis = number

/** A record that is not in the Bin. */
export const LIVE = 0

/** A foreign key that points at nothing. IndexedDB cannot index `null`. */
export const UNASSIGNED = ''

/** A store name, as it appears in the schema and in a tombstone. */
export const STORE_NAMES = [
  'finds',
  'items',
  'photos',
  'photoBlobs',
  'landowners',
  'sites',
  'permissions',
  'detectors',
  'presets',
  'sessions',
  'trackPoints',
  'tombstones',
  'meta',
] as const

export type StoreName = (typeof STORE_NAMES)[number]

/** A store that participates in the Bin. */
export const BIN_STORE_NAMES = [
  'finds',
  'items',
  'photos',
  'landowners',
  'sites',
  'permissions',
  'detectors',
  'presets',
  'sessions',
] as const satisfies readonly StoreName[]

export type BinStoreName = (typeof BIN_STORE_NAMES)[number]

/**
 * A lat/lon pair. The map's convention (Leaflet order) so a stored ring can be
 * handed to Leaflet without re-mapping each vertex.
 */
export type LatLng = [lat: number, lon: number]

/**
 * A Site Boundary (GLOSSARY): an ordered, closed ring of lat/lon pairs. The
 * closing vertex may repeat the first; `ringIsClosed` allows either.
 */
export type Boundary = LatLng[]

/**
 * A rectangle on the map, the same shape Leaflet's `getBounds()` describes
 * (`sw`/`ne` corners). Used for "which Finds are on this screen" and for the
 * area a Site caches offline (step 10).
 */
export interface LatLngBounds {
  sw: LatLng
  ne: LatLng
}

/**
 * How a position was arrived at. GLOSSARY: Position Source. `gps` is a device
 * fix, `photo` is a photo's EXIF location, `hand` is a tap on the map.
 */
export type PositionSource = 'gps' | 'photo' | 'hand'

/**
 * GLOSSARY: Ground Kind. Fixed list, because it drives the "what should I expect
 * here" question a detectorist actually asks.
 */
export type GroundKind =
  | 'unknown'
  | 'pasture'
  | 'arable'
  | 'woodland'
  | 'moorland'
  | 'beach'
  | 'river'
  | 'garden'
  | 'field-system'
  | 'other'

/**
 * A metal flag is deliberately three-valued. "Not recorded" is different from
 * "tested and not silver", and a list that filters for silver must be able to
 * tell them apart. Stored as a string because IndexedDB cannot index a boolean.
 */
export type MetalFlag = 'yes' | 'no' | 'unknown'

/** A Find (GLOSSARY): one hole, one recovery event, one position. */
export interface Find {
  id: string
  /** Date Found. GLOSSARY: the day the hole was dug. */
  foundAt: Millis

  /** '' when the Find has no Site yet (steps 02-05 create these on purpose). */
  siteId: string
  /** '' when the Find was logged outside a Session. */
  sessionId: string

  lat: number
  lon: number
  /** 0 = not reported by the device. */
  altitudeM: number
  /** 0 = unknown. */
  accuracyM: number
  positionSource: PositionSource

  /** Free text. The only field a field log needs. */
  note: string

  /**
   * Find Category (GLOSSARY): the category of this Find's most significant Item,
   * '' when the Find has no Items - which is what makes it a Miss. Maintained by
   * the finds and items repositories so it can never drift; it exists because
   * pins are coloured by category and a map draw cannot join per pin.
   */
  categoryId: string

  /** Live Item count, maintained by the items repository. */
  itemCount: number

  /**
   * Live photo count, maintained by the photos repository. R-PHOTO-6 warns past
   * ~10 on a Find and the detail screen hides the strip at zero, so both need the
   * number without reading a single JPEG byte.
   */
  photoCount: number

  /**
   * Needs Detail (GLOSSARY), stored as 0/1 so the queue is an index lookup
   * rather than a scan. The rule lives in repos/common.ts: no note and no
   * Items. A Find with Items but no note is not in the queue, because the
   * detectorist has already described it.
   */
  needsDetail: 0 | 1

  createdAt: Millis
  updatedAt: Millis
  /** 0 = live, otherwise the moment it entered the Bin. */
  deletedAt: Millis

  /**
   * Set when this record entered the Bin because its parent did, so restoring
   * the parent does not resurrect an Item that was binned on its own.
   */
  cascadeDeletedFrom: string
}

/** An Item (GLOSSARY): one object recovered in one Find. */
export interface Item {
  id: string
  findId: string

  /** Category (GLOSSARY): id into the fixed extensible list. '' = uncategorised. */
  categoryId: string
  /** Sub-type (GLOSSARY): free text. */
  subType: string
  /** Tags (GLOSSARY): free text, indexed multiEntry. */
  tags: string[]

  isSilver: MetalFlag
  isGold: MetalFlag

  /** Date On (GLOSSARY): exact year, 0 = not recorded or not exact. */
  dateOnYear: number
  /** Date On as the detectorist wrote it, e.g. "1860s" or "Roman, 3rd century". */
  dateOnText: string

  // Coin fields, and nothing else uses them.
  country: string
  ruler: string
  mintMark: string
  denomination: string
  composition: string

  material: string

  /** SI. 0 = not recorded. */
  weightG: number
  lengthMm: number
  widthMm: number
  thicknessMm: number
  /** Depth (GLOSSARY): how deep the Item came out of the ground, in metres. */
  depthM: number

  condition: string
  /** Cleaning and conservation notes (R-ITEM-7). */
  cleaningNotes: string

  /** Identified (GLOSSARY): the detectorist has worked out what it is. */
  isIdentified: boolean
  identificationNotes: string

  /** The one required field on an Item. */
  note: string

  /** Live photo count, maintained by the photos repository. The 6 cap reads it. */
  photoCount: number

  createdAt: Millis
  updatedAt: Millis
  deletedAt: Millis
  cascadeDeletedFrom: string
}

/** What a Photo can belong to. A Find's photos and an Item's photos are the same store. */
export type PhotoOwnerKind = 'find' | 'item'

/**
 * Photo metadata, with no bytes in it.
 *
 * The bytes live in `photoBlobs` (ADR-0003: blobs in their own store). Dexie has
 * no projection, so a single store holding both would drag every JPEG through
 * IndexedDB just to draw a thumbnail strip. The split also makes step 11's
 * photo-free backup "copy everything except photoBlobs".
 */
export interface Photo {
  id: string
  ownerKind: PhotoOwnerKind
  ownerId: string

  /** When the photo was taken, from EXIF when present. */
  captureAt: Millis
  /** 0/0 = the photo carries no location. */
  captureLat: number
  captureLon: number

  widthPx: number
  heightPx: number
  /** Encoded size of the full image, so the Bin can report wasted space. */
  bytes: number
  hasThumb: boolean

  createdAt: Millis
  deletedAt: Millis
}

/** The bytes for one photo. Keyed by the Photo's id. */
export interface PhotoBlobRow {
  photoId: string
  full: Blob
  thumb: Blob | null
}

/** Landowner (GLOSSARY): who to ask, with contact details. */
export interface Landowner {
  id: string
  name: string
  contact: string
  notes: string
  createdAt: Millis
  updatedAt: Millis
  deletedAt: Millis
}

/** Site (GLOSSARY): a named place you have permission to detect on. */
export interface Site {
  id: string
  name: string
  landownerId: string
  groundKind: GroundKind
  /** Access Notes (GLOSSARY): where to park, gates, stiles, what was agreed. */
  accessNotes: string

  // PLSS (GLOSSARY): the quarter-section, because that is how deeds read.
  plssTownship: string
  plssRange: string
  plssSection: string
  plssMeridian: string

  /** Site Boundary (GLOSSARY): null until it is drawn in step 06. */
  boundary: Boundary | null
  /** Recomputed on every boundary write, so acreage is never a live calculation. */
  boundaryAreaSqM: number

  createdAt: Millis
  updatedAt: Millis
  deletedAt: Millis
}

/**
 * Permission (GLOSSARY): one grant, with a history.
 *
 * A grant can cover several Sites, which is how permissions are actually given
 * ("you can work the whole farm"), so the grant owns the list rather than one
 * Site owning one grant.
 */
export interface Permission {
  id: string
  /** The Landowner who gave it. '' when the grant names no landowner. */
  landownerId: string
  /** The Sites this grant covers. */
  siteIds: string[]
  /** ISO date, e.g. 2026-03-01. */
  grantedOn: string
  /** ISO date, '' = no expiry recorded. */
  expiresOn: string
  /** Free text: what was agreed, e.g. "cover every hole, tell me about gold". */
  conditions: string

  createdAt: Millis
  updatedAt: Millis
  deletedAt: Millis
}

/** Session (GLOSSARY): one day out detecting. */
export interface Session {
  id: string
  /** ISO date the Session belongs to, e.g. 2026-03-14. */
  date: string
  /** '' until step 06 attaches one. */
  siteId: string

  detectorId: string
  /** The Preset in use, by id and by name. */
  detectorPresetId: string
  detectorPresetName: string

  startedAt: Millis
  /** 0 while the Session is open. */
  endedAt: Millis
  notes: string

  /** Running Track totals, so the Sessions list never counts points. */
  trackPointCount: number
  trackDistanceM: number

  createdAt: Millis
  updatedAt: Millis
  deletedAt: Millis
}

/** One Track point (GLOSSARY: Track). Kept forever, R-TRACK-2. */
export interface TrackPoint {
  id: string
  sessionId: string
  at: Millis
  lat: number
  lon: number
  /** 0 = not reported by the device. */
  accuracyM: number
  /** 0 = not reported by the device. */
  altitudeM: number
  /** Distance from the previous point in this Session, 0 for the first. */
  distanceM: number
}

/** Detector (GLOSSARY): the machine. */
export interface Detector {
  id: string
  make: string
  model: string
  nickname: string
  /** Coil description, free text. */
  coil: string
  notes: string
  createdAt: Millis
  updatedAt: Millis
  deletedAt: Millis
}

/**
 * Settings Preset (GLOSSARY): a named set of detector settings, free text.
 * A Session records the preset's name, not a snapshot of the settings.
 */
export interface DetectorPreset {
  id: string
  detectorId: string
  name: string
  settingsText: string
  createdAt: Millis
  updatedAt: Millis
  deletedAt: Millis
}

/**
 * Tombstone (GLOSSARY): "this id is gone".
 *
 * Written when a record is purged from the Bin, not when it enters it, because a
 * binned record is still in the database and can still come back. Step 11's
 * import uses these to decide whether an incoming id is new or a re-introduction.
 */
export interface Tombstone {
  id: string
  store: StoreName
  deletedAt: Millis
  purgedAt: Millis
}

/**
 * One bookkeeping value. Not a general settings store: the keys here are the
 * ones the app needs to answer "when did I last export?" and "does my data
 * actually survive?"
 */
export interface MetaRow {
  key: string
  value: string
  updatedAt: Millis
}

/**
 * PRD §11: the scale the app is designed for. Not a hard limit, and the app
 * must not break when it is passed, but exceeding it is a signal to stop adding
 * features and start measuring.
 */
export const SCALE_CEILING = {
  finds: 5_000,
  items: 12_000,
  photos: 15_000,
  sites: 30,
  sessions: 500,
  trackPoints: 500_000,
} as const
