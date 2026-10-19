/**
 * Dev-only data generator (step 01).
 *
 * PRD §11 names the scale this app has to survive: 5,000 Finds, 12,000 Items,
 * 15,000 photos, 30 Sites, 500 Sessions, 500,000 Track points. Every filter and
 * every map draw in the PRD is specified against that volume, so timing them
 * against a handful of hand-typed records proves nothing. This file builds the
 * real thing, deterministically, so two runs measure the same dataset and a
 * regression in `filter.ts` shows up as a number rather than a feeling.
 *
 * Three things it deliberately does not do:
 *
 * - It does not go through the repositories. Repositories maintain derived
 *   fields by re-reading a parent on every write, which is right for a person
 *   tapping a screen in a field and far too slow for 500,000 rows. The seeder
 *   writes rows directly, so it has to compute the derived fields itself - by
 *   calling the same `deriveFromItems` the repositories call, not by
 *   reimplementing them. seed.test.ts asserts the derived fields rather than
 *   trusting them.
 * - It is not atomic. A 500,000-row transaction is a reliable way to run out of
 *   memory part-way through. Rows go in per-store chunks, so a failure leaves a
 *   partial dataset. That is acceptable for a dev tool with a Clear button next
 *   to it, and it is why `clearAllData` exists.
 * - It does not invent photographs. Every photo gets a real JPEG, but the JPEG is
 *   one checked-in image (`jpegFixture.ts`) padded with comment segments to the
 *   size the plan asks for, not 15,000 encodes. That keeps the bytes honest - the
 *   storage estimate, the photo decoders and the export code all look at real
 *   images - while leaving the size of a seeded photo a dial rather than a
 *   constant, which is how the PRD's ~2.3 GB worst case gets reproduced.
 */

import { jpegAtSize, JPEG_HEIGHT_PX, JPEG_MIN_BYTES, JPEG_WIDTH_PX } from './jpegFixture'

import type { Table } from 'dexie'
import { deriveFromItems } from './repos/common'
import type { AppDatabase } from './schema'
import {
  LIVE,
  SCALE_CEILING,
  UNASSIGNED,
  type Boundary,
  type Detector,
  type DetectorPreset,
  type Find,
  type GroundKind,
  type Item,
  type Landowner,
  type Millis,
  type Permission,
  type Photo,
  type PhotoBlobRow,
  type Session,
  type Site,
  type TrackPoint,
} from './types'

/** How many rows of each kind a seed run creates. */
export interface SeedPlan {
  sites: number
  landowners: number
  permissions: number
  detectors: number
  presets: number
  sessions: number
  finds: number
  items: number
  /** Photo metadata rows. Cheap: these are the rows a query actually reads. */
  photos: number
  trackPoints: number
  /**
   * How many of those photos also get real image bytes in `photoBlobs`.
   *
   * The full plan's answer is every photo, because that is the ceiling: a
   * `Photo.bytes` number is only worth reading if the bytes it describes are
   * really in the database. Set it lower to seed a fast database for the query
   * benchmarks, where the rows are what is being measured and the images are
   * not; `storageReport` then extrapolates what the rest of the ceiling costs.
   */
  photoBlobCount: number
  /**
   * Average encoded size of a generated full-size blob, in bytes. Each photo is
   * then sized within ±10% of this, so this is the number to multiply by the
   * photo count when comparing against PRD §11.
   */
  photoBlobBytes: number
  /** Average thumbnail size, generated alongside the full image. */
  photoThumbBytes: number
  /** Fraction of Finds sitting in the Bin, so the Bin is benchmarked too. */
  binnedFindRatio: number
  /** Fraction of Finds with no note and no Items, i.e. in the Needs Detail queue. */
  missRatio: number
  /** Fixed seed for the generator. Same plan plus same seed equals same data. */
  randomSeed: number
}

/**
 * The PRD §11 ceiling, row for row, images included.
 *
 * Every photo gets a real JPEG, because a `Photo.bytes` figure that describes
 * bytes nobody wrote is exactly what a storage estimate gets built out of. The
 * sizes are the PRD's own "typical" line: a 32 KB full image plus an 8 KB
 * thumbnail is 40 KB each, and 15,000 of them is the ~600 MB §11 expects in
 * practice. The ~150 KB average that gives the ~2.3 GB worst case is what the app
 * is designed against, so Diagnostics can dial the size up to it - and down,
 * because 600 MB of writes is a long time on a phone and the row counts, not the
 * images, are what the query timings measure.
 */
export const FULL_SEED: SeedPlan = {
  sites: SCALE_CEILING.sites,
  landowners: 12,
  permissions: 24,
  detectors: 3,
  presets: 12,
  sessions: SCALE_CEILING.sessions,
  finds: SCALE_CEILING.finds,
  items: SCALE_CEILING.items,
  photos: SCALE_CEILING.photos,
  trackPoints: SCALE_CEILING.trackPoints,
  photoBlobCount: SCALE_CEILING.photos,
  photoBlobBytes: 32_000,
  photoThumbBytes: 8_000,
  binnedFindRatio: 0.06,
  missRatio: 0.1,
  randomSeed: 20260101,
}

/**
 * PRD §11's photo budget: 15,000 images at a ~150 KB average is the ~2.3 GB worst
 * case the app is designed against. The §11 row also gives a ~600 MB typical,
 * which is what `FULL_SEED` writes; the worst case is the number a storage
 * estimate has to be checked against, because that is the one that runs the phone
 * out of room.
 */
export const PHOTO_BUDGET_BYTES = 2_300_000_000

/** The §11 row's ~150 KB average, spelled out so the budget is not a magic number. */
export const PRD_PHOTO_AVERAGE_BYTES = 150_000

/** Small enough to seed in a unit test, shaped like the real thing. */
export function smallSeed(overrides: Partial<SeedPlan> = {}): SeedPlan {
  return {
    ...FULL_SEED,
    sites: 3,
    landowners: 2,
    permissions: 3,
    detectors: 1,
    presets: 2,
    sessions: 6,
    finds: 40,
    items: 90,
    photos: 60,
    trackPoints: 300,
    photoBlobCount: 4,
    photoBlobBytes: 6_000,
    photoThumbBytes: 5_000,
    randomSeed: 7,
    ...overrides,
  }
}

/** Row counts, used both to report a seed and to check what survived. */
export type SeedCounts = Partial<Record<'sites' | 'landowners' | 'permissions' | 'detectors' | 'presets' | 'sessions' | 'finds' | 'items' | 'photos' | 'photoBlobs' | 'trackPoints', number>>

export interface SeedReport {
  counts: SeedCounts
  /** Wall-clock ms for the whole seed, which is the number step 01 benchmarks. */
  ms: number
  /** Per-store insert times, so a slow store is visible rather than averaged away. */
  stages: Array<{ store: string; rows: number; ms: number }>
  /** Bytes actually written into `photoBlobs`. */
  photoBytes: number
}

/**
 * mulberry32. A deterministic generator, because a benchmark whose dataset
 * changes between runs measures the dataset rather than the query.
 */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A whole number in [min, max]. */
function intIn(rnd: () => number, min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1))
}

function pick<T>(rnd: () => number, values: readonly T[]): T {
  return values[Math.floor(rnd() * values.length)]
}

/**
 * Splits `total` rows across `buckets` owners, unevenly.
 *
 * Even splitting would make every benchmark a best case: a real detectorist has
 * one Site with 900 Finds on it and six Sites with a handful. The weights come
 * from the same deterministic stream as everything else, and the remainder is
 * handed out one at a time so the totals land exactly on the plan.
 */
function allocate(total: number, buckets: number, rnd: () => number, min = 0): number[] {
  if (buckets <= 0) return []
  const weights: number[] = []
  for (let i = 0; i < buckets; i += 1) weights.push(min + rnd() * 2 + (rnd() < 0.15 ? 3 : 0))
  const sum = weights.reduce((a, b) => a + b, 0)
  const out = weights.map((w) => min + Math.floor(((w - min) / sum) * (total - min * buckets)))
  let left = total - out.reduce((a, b) => a + b, 0)
  let i = 0
  while (left > 0) {
    out[i % buckets] += 1
    left -= 1
    i += 1
  }
  // Rounding can overshoot when `min` is non-zero; take the extras back off the
  // buckets that have the most, so no bucket is emptied by the correction.
  while (left < 0) {
    let best = 0
    for (let b = 1; b < buckets; b += 1) if (out[b] > out[best]) best = b
    if (out[best] <= min) break
    out[best] -= 1
    left += 1
  }
  return out
}

/** The fixed Category list, as ids. Step 07 owns the real list and its labels. */
const CATEGORY_IDS = [
  'coin',
  'token',
  'buckle',
  'button',
  'jewellery',
  'weapon',
  'tool',
  'dress-accessory',
  'religious',
  'seal',
  'musket-ball',
  'horse-equipment',
  'building-material',
  'unknown',
] as const

const GROUND_KINDS: GroundKind[] = ['pasture', 'arable', 'woodland', 'moorland', 'beach', 'river', 'garden', 'field-system']

const MATERIALS = ['copper alloy', 'silver', 'gold', 'lead', 'iron', 'bronze', 'brass', 'tin', 'pot', 'flint']

const CONDITIONS = ['good', 'fine', 'crushed', 'corroded', 'fragmentary', 'fresh', 'clipped']

const DETECTORS: Array<[make: string, model: string]> = [
  ['Minelab', 'Equinox 900'],
  ['XP', 'Deus II'],
  ['Garrett', 'AT Pro'],
  ['Nokta', 'Makro Rerik'],
]

const PRESET_NAMES = ['Field', 'Beach', 'Hot rocks', 'Deep', 'Jewellery', 'Small targets', 'High trash', 'All metal']

/** Roughly the year the item was lost, weighted towards post-medieval and modern. */
function dateOnYear(rnd: () => number): number {
  const roll = rnd()
  if (roll < 0.34) return intIn(rnd, 1650, 1900)
  if (roll < 0.62) return intIn(rnd, 1900, 2020)
  if (roll < 0.74) return intIn(rnd, 1066, 1500)
  if (roll < 0.8) return intIn(rnd, 43, 410)
  return 0 // not recorded, or not exact
}

/**
 * A real JPEG of exactly `bytes` bytes: the checked-in photograph from
 * `jpegFixture`, padded with comment segments to the size the plan asked for.
 *
 * Exactly matters: `Photo.bytes` is a claim about what is in `photoBlobs`, and
 * Diagnostics adds that claim up, so a blob that is a few bytes longer than the
 * row says makes the storage estimate wrong. Real matters for the same reason -
 * the estimate, the photo decoders and the export code all treat these as images,
 * and a store full of filler bytes would let a seeded database pass a check it
 * should fail. `seed` makes each photo its own bytes, so nothing below the app
 * can deduplicate the sample away.
 */
function jpegBlob(bytes: number, seed: number): Blob {
  return new Blob([jpegAtSize(bytes, seed)], { type: 'image/jpeg' })
}

/**
 * The full image size for one photo: the plan's average, varied by up to 10% so
 * the sample has a spread rather than one repeated number. The variation is
 * symmetric, so `photoBlobBytes` stays the figure to multiply by the photo count.
 */
function photoSize(plan: SeedPlan, n: number): number {
  const spread = Math.min(4_000, Math.floor(plan.photoBlobBytes * 0.1))
  const step = spread === 0 ? 0 : Math.round((2 * spread) / 8)
  const size = plan.photoBlobBytes - spread + (n % 9) * step
  return Math.max(JPEG_MIN_BYTES, size)
}

/** `2026-03-14` from a timestamp. UTC, because every stored time is UTC. */
function isoDay(ms: Millis): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Area of a ring in square metres.
 *
 * A seed-only approximation: equirectangular projection plus the shoelace
 * formula, which is within a fraction of a percent for a field-sized ring.
 * Step 06 owns the real calculation and replaces these values the moment a
 * boundary is edited; this exists so the acreage fields have something to show
 * in development before then.
 */
function ringAreaSqM(ring: Boundary): number {
  if (ring.length < 3) return 0
  const toXY = (lat: number, lon: number): [number, number] => [
    lon * 111_320 * Math.cos((lat * Math.PI) / 180),
    lat * 110_574,
  ]
  let sum = 0
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = toXY(ring[i][0], ring[i][1])
    const [x2, y2] = toXY(ring[(i + 1) % ring.length][0], ring[(i + 1) % ring.length][1])
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

/** Great-circle distance in metres, the same maths the Track totals use. */
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Somewhere in England, weighted so Sites cluster rather than scatter evenly. */
function siteCentre(rnd: () => number): Boundary[0] {
  const clusters: Array<[number, number]> = [
    [52.95, -1.15], // East Midlands
    [51.45, -2.55], // South West
    [52.4, -1.5], // West Midlands
    [51.05, -1.3], // Hampshire
    [53.8, -1.55], // Yorkshire
  ]
  const [lat, lon] = pick(rnd, clusters)
  return [lat + (rnd() - 0.5) * 0.35, lon + (rnd() - 0.5) * 0.5]
}

const SITE_NAME_WORDS = ['Home', 'Upper', 'Lower', 'Long', 'Broad', 'West', 'East', 'Old', 'New', 'Great', 'Little']
const SITE_NAME_NOUNS = ['Field', 'Farm', 'Meadow', 'Wood', 'Hill', 'Bottom', 'Croft', 'Grounds', 'Pasture', 'Ridge']

const FIRST_NAMES = ['James', 'Sarah', 'Tom', 'Anne', 'Bill', 'Ruth', 'Harry', 'Fiona', 'George', 'Nell', 'Peter', 'Jo']
const LAST_NAMES = ['Webb', 'Holland', 'Ashcroft', 'Marlowe', 'Trewin', 'Okonkwo', 'Rhys', 'Barnard', 'Sutcliffe', 'Vance']

const NOTES = [
  'Ploughed, wet in places.',
  'Worked the headland.',
  'Found in the topsoil.',
  'With a mate, first sweep of the season.',
  'Hot ground, had to go over twice.',
  'Covered the whole field by lunchtime.',
  'Small find, kept it.',
  'Permission renewed for next year.',
  'Rubbish everywhere, still worth it.',
  'Late start, light going.',
]

const ITEM_NOTES = [
  'Hammered flat.',
  'Lovely condition.',
  'Needed a bit of picking out.',
  'Found with a lead bag.',
  'Bent over.',
  'Best of the day.',
  'Needs cleaning up.',
  'Identified from the portrait.',
  'Came up with the first signal.',
  'Cut down by the plough.',
]

interface SeedSites {
  landowners: Landowner[]
  sites: Site[]
  permissions: Permission[]
  /**
   * Where each Site is. There is no lat/lon column on Site - a Site's position
   * is its Boundary - so the seeder keeps its own record of where it put them,
   * rather than inventing a field the schema does not have.
   */
  centres: Map<string, Boundary[0]>
}

function buildSites(plan: SeedPlan, rnd: () => number, now: Millis): SeedSites {
  const landowners: Landowner[] = []
  for (let i = 0; i < plan.landowners; i += 1) {
    const created = now - intIn(rnd, 200, 1_800) * 86_400_000
    landowners.push({
      id: `landowner-${i}`,
      name: `${pick(rnd, FIRST_NAMES)} ${pick(rnd, LAST_NAMES)}`,
      contact: `07${intIn(rnd, 100, 999)} ${intIn(rnd, 100000, 999999)}`,
      notes: rnd() < 0.4 ? 'Prefers a phone call in the evening.' : '',
      createdAt: created,
      updatedAt: created,
      deletedAt: LIVE,
    })
  }

  const sites: Site[] = []
  const centres = new Map<string, Boundary[0]>()
  for (let i = 0; i < plan.sites; i += 1) {
    const created = now - intIn(rnd, 100, 1_700) * 86_400_000
    const centre = siteCentre(rnd)
    centres.set(`site-${i}`, centre)
    const [lat, lon] = centre
    const hasBoundary = rnd() < 0.6
    let boundary: Boundary | null = null
    let area = 0
    if (hasBoundary) {
      // A field-sized rectangle, 5 to 90 hectares.
      const halfLat = Math.sqrt(intIn(rnd, 5, 90) * 10_000) / 110_574 / 2
      const halfLon = halfLat / Math.cos((lat * Math.PI) / 180)
      boundary = [
        [lat - halfLat, lon - halfLon],
        [lat - halfLat, lon + halfLon],
        [lat + halfLat, lon + halfLon],
        [lat + halfLat, lon - halfLon],
      ]
      area = ringAreaSqM(boundary)
    }
    sites.push({
      id: `site-${i}`,
      name: `${pick(rnd, SITE_NAME_WORDS)} ${pick(rnd, SITE_NAME_NOUNS)}`,
      landownerId: landowners.length ? pick(rnd, landowners).id : UNASSIGNED,
      groundKind: pick(rnd, GROUND_KINDS),
      accessNotes: rnd() < 0.5 ? 'Park in the gate, do not block the track.' : '',
      plssTownship: '',
      plssRange: '',
      plssSection: '',
      plssMeridian: '',
      boundary,
      boundaryAreaSqM: area,
      createdAt: created,
      updatedAt: created,
      deletedAt: LIVE,
    })
  }

  const permissions: Permission[] = []
  for (let i = 0; i < plan.permissions; i += 1) {
    const created = now - intIn(rnd, 30, 1_500) * 86_400_000
    // One grant covering several Sites is how permission is actually given.
    const covers = Math.min(sites.length, intIn(rnd, 1, 4))
    const covered: string[] = []
    for (let c = 0; c < covers; c += 1) {
      const site = pick(rnd, sites)
      if (site && !covered.includes(site.id)) covered.push(site.id)
    }
    const grantedOn = created
    permissions.push({
      id: `permission-${i}`,
      landownerId: landowners.length ? pick(rnd, landowners).id : UNASSIGNED,
      siteIds: covered,
      grantedOn: isoDay(grantedOn),
      // A third of grants have no expiry recorded, a third have already run out.
      expiresOn: rnd() < 0.67 ? isoDay(grantedOn + intIn(rnd, -200, 700) * 86_400_000) : '',
      conditions: rnd() < 0.6 ? 'Cover every hole, tell me about anything gold.' : '',
      createdAt: created,
      updatedAt: created,
      deletedAt: LIVE,
    })
  }

  return { landowners, sites, permissions, centres }
}

function buildDetectors(plan: SeedPlan, rnd: () => number, now: Millis): { detectors: Detector[]; presets: DetectorPreset[] } {
  const detectors: Detector[] = []
  for (let i = 0; i < plan.detectors; i += 1) {
    const [make, model] = DETECTORS[i % DETECTORS.length]
    const created = now - intIn(rnd, 300, 2_500) * 86_400_000
    detectors.push({
      id: `detector-${i}`,
      make,
      model,
      nickname: rnd() < 0.3 ? 'the old one' : '',
      coil: pick(rnd, ['11" DD', '6" DD', '9" concentric', '15x12 mono']),
      notes: '',
      createdAt: created,
      updatedAt: created,
      deletedAt: LIVE,
    })
  }
  const presets: DetectorPreset[] = []
  for (let i = 0; i < plan.presets; i += 1) {
    const created = now - intIn(rnd, 100, 1_200) * 86_400_000
    presets.push({
      id: `preset-${i}`,
      detectorId: detectors.length ? detectors[i % detectors.length].id : UNASSIGNED,
      name: PRESET_NAMES[i % PRESET_NAMES.length],
      settingsText: `Disc ${intIn(rnd, 0, 99)}, Notch ${intIn(rnd, 0, 40)}, Volume ${intIn(rnd, 1, 25)}`,
      createdAt: created,
      updatedAt: created,
      deletedAt: LIVE,
    })
  }
  return { detectors, presets }
}

interface SeedSessions {
  rows: Session[]
  /** Finds assigned to each Session index, in creation order. */
  findsPerSession: number[]
  /** Track points assigned to each Session index. */
  pointsPerSession: number[]
}

/** Five seasons of days out, most recently first. */
const SESSION_SPAN_MS = 5 * 365 * 86_400_000

function buildSessions(plan: SeedPlan, sites: Site[], detectors: Detector[], presets: DetectorPreset[], rnd: () => number, now: Millis): SeedSessions {
  const rows: Session[] = []
  for (let i = 0; i < plan.sessions; i += 1) {
    // Older sessions first, so a `foundAt` index scan matches how the app is used.
    const startedAt = now - Math.round(((plan.sessions - i) / plan.sessions) * SESSION_SPAN_MS) + intIn(rnd, 6, 11) * 3_600_000
    const site = sites.length && rnd() > 0.05 ? pick(rnd, sites) : null
    const preset = presets.length ? pick(rnd, presets) : null
    rows.push({
      id: `session-${i}`,
      date: isoDay(startedAt),
      siteId: site ? site.id : UNASSIGNED,
      detectorId: detectors.length ? detectors[i % detectors.length].id : UNASSIGNED,
      detectorPresetId: preset ? preset.id : UNASSIGNED,
      detectorPresetName: preset ? preset.name : '',
      startedAt,
      endedAt: startedAt + intIn(rnd, 2, 7) * 3_600_000,
      notes: rnd() < 0.3 ? pick(rnd, NOTES) : '',
      // Filled in when the Track is generated, so the Sessions list never counts points.
      trackPointCount: 0,
      trackDistanceM: 0,
      createdAt: startedAt,
      updatedAt: startedAt,
      deletedAt: LIVE,
    })
  }
  return {
    rows,
    findsPerSession: allocate(plan.finds, rows.length, rnd),
    pointsPerSession: allocate(plan.trackPoints, rows.length, rnd),
  }
}

/** Which Finds have no Items, decided up front so the Item totals land exactly. */
function pickMisses(plan: SeedPlan, rnd: () => number): Set<number> {
  const wanted = Math.round(plan.finds * plan.missRatio)
  const misses = new Set<number>()
  let guard = 0
  while (misses.size < wanted && guard < wanted * 40) {
    misses.add(intIn(rnd, 0, plan.finds - 1))
    guard += 1
  }
  return misses
}

/**
 * Writes rows in chunks rather than one at a time or one giant transaction.
 *
 * One row at a time is far too slow for 500,000 points; one transaction holding
 * them all is how a phone runs out of memory halfway through and leaves the
 * database in a state nobody asked for. Chunks keep the memory flat and let a
 * progress callback report something real.
 */
async function writeChunks<T>(
  table: Table<T, string>,
  rows: readonly T[],
  onProgress?: (done: number) => void,
  chunkSize = 5_000,
): Promise<number> {
  let done = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize)
    await table.bulkPut(batch)
    done += batch.length
    if (onProgress) onProgress(done)
  }
  return done
}

export interface SeedOptions {
  /** Called once per store with the rows written so far, for a progress readout. */
  onProgress?: (stage: { store: string; done: number; total: number }) => void
  /** Pins "now", so a seed run is reproducible. Defaults to the system clock. */
  now?: Millis
  chunkSize?: number
}

/**
 * Replaces nothing: this only adds rows. Call `clearAllData` first if you want a
 * clean dataset, because a second seed on top of the first doubles every count
 * and the benchmark numbers stop meaning anything.
 */
export async function seedDatabase(db: AppDatabase, plan: SeedPlan = FULL_SEED, options: SeedOptions = {}): Promise<SeedReport> {
  const startedAt = Date.now()
  const now = options.now ?? Date.now()
  const rnd = makeRandom(plan.randomSeed)
  const stages: SeedReport['stages'] = []

  async function stage<T>(store: string, table: Table<T, string>, rows: readonly T[]): Promise<void> {
    const mark = Date.now()
    await writeChunks(table, rows, (done) => options.onProgress?.({ store, done, total: rows.length }), options.chunkSize)
    stages.push({ store, rows: rows.length, ms: Date.now() - mark })
  }

  const { landowners, sites, permissions, centres } = buildSites(plan, rnd, now)
  const { detectors, presets } = buildDetectors(plan, rnd, now)
  const sessions = buildSessions(plan, sites, detectors, presets, rnd, now)

  const misses = pickMisses(plan, rnd)
  const liveFindCount = plan.finds - misses.size
  const itemsPerLiveFind = allocate(plan.items, Math.max(1, liveFindCount), rnd, 1)
  // A Find carries the hole's photos, an Item carries the object's, and in
  // practice the object gets most of them.
  const findPhotoTotal = Math.round(plan.photos * 0.4)
  const itemPhotoTotal = plan.photos - findPhotoTotal
  const photosPerFind = allocate(findPhotoTotal, plan.finds, rnd)
  const photosPerItem = allocate(itemPhotoTotal, plan.items, rnd)

  const findRows: Find[] = []
  const itemRows: Item[] = []
  const photoRows: Photo[] = []
  const blobRows: PhotoBlobRow[] = []
  let photoBytes = 0

  let liveFindCursor = 0
  let itemCursor = 0
  let photoCursor = 0

  /**
   * Track points are written as they are generated rather than collected first.
   * 500,000 rows held in memory is roughly 100 MB of JavaScript objects before
   * IndexedDB has even seen them, which is the wrong end of a phone to be
   * measuring from.
   */
  const trackBuffer: TrackPoint[] = []
  let trackWritten = 0
  let trackMs = 0
  const flushTrack = async (): Promise<void> => {
    if (trackBuffer.length === 0) return
    const batch = trackBuffer.splice(0, trackBuffer.length)
    const mark = Date.now()
    await writeChunks(db.trackPoints, batch, (done) => options.onProgress?.({ store: 'trackPoints', done: trackWritten + done, total: plan.trackPoints }), options.chunkSize)
    trackMs += Date.now() - mark
    trackWritten += batch.length
  }

  /**
   * One photo, and its image when the plan gives this one bytes. `photoBlobCount` is the dial:
   * the full plan's answer is every photo, and a lower number writes images only for the first N,
   * which is how a laptop run measures row counts without waiting on 600 MB of Blobs. Either way
   * the bookkeeping stays in one place: `Photo.bytes` always describes bytes that are really in
   * `photoBlobs`, never a number the seeder made up.
   */
  const addPhoto = (ownerKind: 'find' | 'item', ownerId: string, ownerAt: Millis, ownerDeletedAt: Millis): Photo => {
    const id = `photo-${photoCursor}`
    photoCursor += 1
    const createdAt = ownerAt + intIn(rnd, 0, 90) * 60_000
    const withBytes = photoCursor <= plan.photoBlobCount
    const fullBytes = withBytes ? photoSize(plan, photoCursor) : 0
    const photo: Photo = {
      id,
      ownerKind,
      ownerId,
      captureAt: createdAt,
      // EXIF coordinates are step 09's problem; a photo with no location is the
      // common case anyway, and the app has to handle it.
      captureLat: 0,
      captureLon: 0,
      widthPx: withBytes ? JPEG_WIDTH_PX : 0,
      heightPx: withBytes ? JPEG_HEIGHT_PX : 0,
      bytes: fullBytes,
      hasThumb: withBytes,
      createdAt,
      deletedAt: ownerDeletedAt,
    }
    photoRows.push(photo)
    if (withBytes) {
      blobRows.push({
        photoId: id,
        full: jpegBlob(fullBytes, photoCursor),
        thumb: jpegBlob(plan.photoThumbBytes, photoCursor + 101),
      })
      photoBytes += fullBytes + plan.photoThumbBytes
    }
    return photo
  }

  for (let s = 0; s < sessions.rows.length; s += 1) {
    const session = sessions.rows[s]
    const centre = centres.get(session.siteId) ?? siteCentre(rnd)
    const baseLat = centre[0]
    const baseLon = centre[1]

    // ---- Track: generated first, because Finds sit on it.
    const pointCount = sessions.pointsPerSession[s]
    const points: TrackPoint[] = []
    let lat = baseLat + (rnd() - 0.5) * 0.004
    let lon = baseLon + (rnd() - 0.5) * 0.004
    let distance = 0
    const stepMs = pointCount > 1 ? (session.endedAt - session.startedAt) / (pointCount - 1) : 0
    for (let p = 0; p < pointCount; p += 1) {
      // A detectorist walks a line, not a scatter, so the walk drifts in one
      // direction with a wobble. A polyline of pure noise makes the Track
      // benchmark unrealistically cheap to draw.
      const heading = (p / 40) * Math.PI * 2 + rnd() * 0.6
      const stride = 0.00002 + rnd() * 0.00003
      const prevLat = lat
      const prevLon = lon
      lat += Math.sin(heading) * stride
      lon += (Math.cos(heading) * stride) / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
      const step = haversineM(prevLat, prevLon, lat, lon)
      // The first point has no previous point, so it has no step. Rounding the
      // step before adding it is what keeps `Session.trackDistanceM` exactly
      // equal to the sum of the points the app can actually read back: a total
      // that disagrees with its own rows is a bug the user can see.
      const walked = p === 0 ? 0 : Math.round(step * 100) / 100
      distance += walked
      points.push({
        id: `${session.id}-${p}`,
        sessionId: session.id,
        at: session.startedAt + Math.round(p * stepMs),
        lat,
        lon,
        accuracyM: rnd() < 0.1 ? 0 : Math.round(3 + rnd() * 12),
        altitudeM: rnd() < 0.3 ? 0 : Math.round(40 + rnd() * 180),
        distanceM: walked,
      })
    }
    session.trackPointCount = pointCount
    session.trackDistanceM = Math.round(distance * 100) / 100
    for (const point of points) trackBuffer.push(point)
    if (trackBuffer.length >= 25_000) await flushTrack()

    // ---- Finds on this Session, placed on the Track.
    for (let f = 0; f < sessions.findsPerSession[s]; f += 1) {
      const findIndex = findRows.length
      const isMiss = misses.has(findIndex)
      const anchor = points.length ? points[intIn(rnd, 0, points.length - 1)] : null
      const foundAt = anchor ? anchor.at : session.startedAt + intIn(rnd, 0, Math.max(1, session.endedAt - session.startedAt))
      const createdAt = foundAt + intIn(rnd, 0, 45) * 60_000
      const binned = rnd() < plan.binnedFindRatio
      const deletedAt = binned ? now - intIn(rnd, 1, 45) * 86_400_000 : LIVE

      const findId = `find-${findIndex}`
      const itemCount = isMiss ? 0 : itemsPerLiveFind[liveFindCursor++] ?? 1
      const note = isMiss && rnd() < 0.7 ? '' : rnd() < 0.75 ? pick(rnd, NOTES) : ''

      const findItems: Item[] = []
      for (let it = 0; it < itemCount; it += 1) {
        const itemId = `item-${itemCursor}`
        const itemCreatedAt = createdAt + it * 120_000
        const category = pick(rnd, CATEGORY_IDS)
        const isGold = rnd() < 0.02 ? 'yes' : rnd() < 0.25 ? 'no' : 'unknown'
        const isSilver = rnd() < 0.08 ? 'yes' : rnd() < 0.3 ? 'no' : 'unknown'
        const item: Item = {
          id: itemId,
          findId,
          categoryId: category,
          subType: rnd() < 0.35 ? pick(rnd, ['silver penny', 'brogue', 'buckle frame', 'thimble', 'crotal', 'ring', 'farthing', 'button top']) : '',
          tags: rnd() < 0.25 ? [pick(rnd, ['henry', 'robinson', 'field A', 'cleaned', 'with lead bag'])] : [],
          isSilver,
          isGold,
          dateOnYear: dateOnYear(rnd),
          dateOnText: '',
          country: category === 'coin' ? pick(rnd, ['England', 'Scotland', 'France', 'Rome', 'Rome (Republic)', 'Netherlands']) : '',
          ruler: category === 'coin' && rnd() < 0.6 ? pick(rnd, ['Elizabeth I', 'Victoria', 'Charles II', 'Hadrian', 'Henry VIII']) : '',
          mintMark: '',
          denomination: category === 'coin' ? pick(rnd, ['penny', 'groat', 'sixpence', 'shilling', 'sestertius', 'halfpenny']) : '',
          composition: '',
          material: pick(rnd, MATERIALS),
          weightG: Math.round((1 + rnd() * 40) * 10) / 10,
          lengthMm: Math.round((8 + rnd() * 40) * 10) / 10,
          widthMm: Math.round((8 + rnd() * 35) * 10) / 10,
          thicknessMm: Math.round((0.5 + rnd() * 8) * 10) / 10,
          depthM: Math.round(rnd() * 35) / 100,
          condition: pick(rnd, CONDITIONS),
          cleaningNotes: rnd() < 0.15 ? 'Firmed up with PVA.' : '',
          isIdentified: rnd() < 0.4,
          identificationNotes: '',
          note: rnd() < 0.7 ? pick(rnd, ITEM_NOTES) : '',
          photoCount: 0,
          createdAt: itemCreatedAt,
          updatedAt: itemCreatedAt,
          deletedAt: binned ? deletedAt : LIVE,
          cascadeDeletedFrom: binned ? findId : '',
        }
        if (item.dateOnYear && rnd() < 0.3) item.dateOnText = String(item.dateOnYear)
        findItems.push(item)
        for (let p = 0; p < photosPerItem[itemCursor]; p += 1) {
          const photo = addPhoto('item', itemId, itemCreatedAt, item.deletedAt)
          if (photo.deletedAt === LIVE) item.photoCount += 1
        }
        itemCursor += 1
      }
      itemRows.push(...findItems)

      let liveFindPhotos = 0
      for (let p = 0; p < photosPerFind[findIndex]; p += 1) {
        const photo = addPhoto('find', findId, foundAt, deletedAt)
        if (photo.deletedAt === LIVE) liveFindPhotos += 1
      }

      const find: Find = {
        id: findId,
        foundAt,
        siteId: session.siteId,
        sessionId: session.id,
        lat: anchor ? anchor.lat : baseLat,
        lon: anchor ? anchor.lon : baseLon,
        altitudeM: anchor ? anchor.altitudeM : 0,
        accuracyM: anchor ? anchor.accuracyM : 0,
        positionSource: anchor ? 'gps' : pick(rnd, ['gps', 'hand', 'photo']),
        note,
        categoryId: '',
        itemCount: 0,
        photoCount: liveFindPhotos,
        needsDetail: 0,
        createdAt,
        updatedAt: createdAt,
        deletedAt,
        cascadeDeletedFrom: '',
      }
      // The same three derived fields the repositories would have written, from
      // the same function. A Find binned together with its Items still has them,
      // so the Bin labels it by what was found rather than as a Miss, and
      // restoring it does not bring back a log that claims nothing was recovered.
      findRows.push(deriveFromItems(find, findItems))
    }
  }

  await flushTrack()

  // Parents last. Nothing in IndexedDB enforces a foreign key, but writing the
  // children first means a seed that dies part-way leaves orphan rows rather
  // than parents pointing at a half-populated table, and orphans are what the
  // repositories already have to cope with.
  await stage('sessions', db.sessions, sessions.rows)
  await stage('finds', db.finds, findRows)
  await stage('items', db.items, itemRows)
  await stage('photos', db.photos, photoRows)
  await stage('photoBlobs', db.photoBlobs, blobRows)
  await stage('sites', db.sites, sites)
  await stage('landowners', db.landowners, landowners)
  await stage('permissions', db.permissions, permissions)
  await stage('detectors', db.detectors, detectors)
  await stage('presets', db.presets, presets)
  stages.push({ store: 'trackPoints', rows: trackWritten, ms: trackMs })

  return {
    counts: {
      sessions: sessions.rows.length,
      finds: findRows.length,
      items: itemRows.length,
      photos: photoRows.length,
      photoBlobs: blobRows.length,
      sites: sites.length,
      landowners: landowners.length,
      permissions: permissions.length,
      detectors: detectors.length,
      presets: presets.length,
      trackPoints: trackWritten,
    },
    ms: Date.now() - startedAt,
    stages: stages.sort((a, b) => b.rows - a.rows),
    photoBytes,
  }
}

/**
 * Empties every store, leaving the schema alone.
 *
 * Deliberately not `deleteDatabase`: deleting the file is faster, but it also
 * throws away the schema version and the durability probe's marker, and step 11
 * needs a way to clear data without pretending the app was never installed.
 */
export async function clearAllData(db: AppDatabase): Promise<void> {
  await Promise.all(db.tables.map((table) => table.clear()))
}

/** What is actually in the database right now, for the Diagnostics readout. */
export async function countRows(db: AppDatabase): Promise<SeedCounts> {
  const names = ['sites', 'landowners', 'permissions', 'detectors', 'presets', 'sessions', 'finds', 'items', 'photos', 'photoBlobs', 'trackPoints'] as const
  const counts: SeedCounts = {}
  await Promise.all(
    names.map(async (name) => {
      counts[name] = await db.table(name).count()
    }),
  )
  return counts
}

/**
 * Turns a count into the storage the PRD's own numbers imply.
 *
 * `seeded` is measured from the blobs actually written, so it is the figure
 * `navigator.storage.estimate()` should agree with once the metadata is counted
 * as well. `atPrdAverage` is the same photo count at PRD §11's ~150 KB average,
 * which is the size the app is designed against. Reporting both is the point: the
 * default plan is §11's typical case, and the gap between the two is what a phone
 * run closes by dialing the photo size up.
 */
export function storageReport(plan: SeedPlan, photoBytes: number): { seeded: number; atPrdAverage: number; withinBudget: boolean } {
  return {
    seeded: photoBytes,
    atPrdAverage: plan.photos * PRD_PHOTO_AVERAGE_BYTES,
    withinBudget: photoBytes < PHOTO_BUDGET_BYTES,
  }
}

/**
 * The full ceiling with the photo size changed and nothing else.
 *
 * PRD §11 quotes one figure per photo, so Diagnostics asks for one figure per
 * photo; the split between the full image and its thumbnail lives here, at about
 * the ratio a re-encoded photo and its preview come out at. Both halves are
 * floored at the size of the fixture photograph, because a blob cannot be smaller
 * than the image it contains.
 */
export function fullSeedAtPhotoBytes(averageBytes: number): SeedPlan {
  const thumb = Math.max(JPEG_MIN_BYTES, Math.round(averageBytes * 0.2))
  const full = Math.max(JPEG_MIN_BYTES, averageBytes - thumb)
  return { ...FULL_SEED, photoBlobBytes: full, photoThumbBytes: thumb }
}


