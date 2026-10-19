import {
  LIVE,
  UNASSIGNED,
  type Find,
  type Item,
  type Millis,
  type StoreName,
  type Tombstone,
} from '../types'

/**
 * Shared pieces of the repositories.
 *
 * Every repository is a factory over an AppDatabase so that a test can hand it a
 * fake-indexeddb database, and over a clock so that a test can pin "now". The
 * clock matters more than it looks: the Bin's 30-day rule and the Needs Detail
 * queue are both about time, and a test that cannot control time cannot assert
 * them.
 */
export type Clock = () => Millis

export const systemClock: Clock = () => Date.now()

export interface RepoOptions {
  clock?: Clock
}

export function clockFrom(options: RepoOptions = {}): Clock {
  return options.clock ?? systemClock
}

/**
 * A tombstone row (ADR-0002).
 *
 * Written when a record is purged from the database, not when it is moved to the
 * Bin: while something sits in the Bin it is still in the database and can come
 * back, so it is not yet true that the id is gone. `deletedAt` carries the
 * original soft-delete time when the caller knows it, and the purge time
 * otherwise.
 *
 * The `store` parameter is typed so a typo in a store name is a compile error
 * rather than a row that no import can read.
 */
export function tombstone(
  store: StoreName,
  id: string,
  purgedAt: Millis,
  deletedAt: Millis = purgedAt,
): Tombstone {
  return { id, store, deletedAt, purgedAt }
}

/** A Find as the caller supplies it: only the fields a human decides. */
export type NewFind = Partial<Omit<Find, 'createdAt' | 'updatedAt' | 'deletedAt'>>

/** An Item as the caller supplies it. */
export type NewItem = Partial<Omit<Item, 'createdAt' | 'updatedAt' | 'deletedAt'>>

/**
 * The Needs Detail rule, in one place (GLOSSARY: Needs Detail).
 *
 * A Find needs detail when nothing was written about it and nothing was recovered
 * from it — that is, a field log that is only a position, a time and a photo. A
 * Miss with a note is a finished record, and a Find with Items is a finished
 * record, so neither lands in the queue.
 *
 * This is why there is no Miss flag anywhere in the schema: `itemCount === 0`
 * already says it, and GLOSSARY is explicit that a Miss is not a nullable field.
 */
export function needsDetailFor(note: string | undefined, itemCount: number): 0 | 1 {
  return (note ?? '').trim() === '' && itemCount === 0 ? 1 : 0
}

export function computeNeedsDetail(find: Pick<Find, 'note' | 'itemCount'>): 0 | 1 {
  return needsDetailFor(find.note, find.itemCount)
}

/**
 * The Items that still describe a Find: the live ones, plus the ones the Bin took
 * down because their Find went with it.
 *
 * The two kinds of deletion have to be told apart here (R-EDIT-2). An Item the
 * user binned by hand has stopped describing its Find, which is what makes
 * deleting the last Item leave a Miss. An Item carried down with its Find has
 * not: the Find still has it, the Bin has to say so rather than label a Find with
 * three Items "Miss", and a Find that comes back from the Bin claiming no Items
 * would be a record nobody wrote.
 */
export function itemsBelongingTo(find: Pick<Find, 'id'>, items: readonly Item[]): Item[] {
  return items.filter((item) => item.deletedAt === LIVE || item.cascadeDeletedFrom === find.id)
}

/**
 * Which of an Find's Items describes it, for the pin colour and the category
 * filter (GLOSSARY: Find Category).
 *
 * The rule has to be deterministic because it is stored: precious metal first,
 * then anything that is not filed as unknown, then the oldest record. Changing
 * this function changes what `Find.categoryId` means for existing rows, so it is
 * unit-tested rather than inlined.
 *
 * It chooses among the Items it is handed and does not decide which of them count:
 * `itemsBelongingTo` does that, so there is one rule about the Bin in the codebase.
 */
const SIGNIFICANT_CATEGORIES = ['unknown', '']

export function mostSignificantItem(items: Item[]): Item | null {
  if (items.length === 0) return null
  const scored = items
    .map((item) => ({
      item,
      precious: item.isSilver === 'yes' || item.isGold === 'yes' ? 0 : 1,
      unknown: SIGNIFICANT_CATEGORIES.includes(item.categoryId) ? 1 : 0,
    }))
  scored.sort((a, b) => {
    if (a.precious !== b.precious) return a.precious - b.precious
    if (a.unknown !== b.unknown) return a.unknown - b.unknown
    if (a.item.createdAt !== b.item.createdAt) return a.item.createdAt - b.item.createdAt
    return a.item.id < b.item.id ? -1 : 1
  })
  return scored[0].item
}

/** The Find Category value for a set of Items: '' when there are none, i.e. a Miss. */
export function findCategoryId(items: Item[]): string {
  return mostSignificantItem(items)?.categoryId ?? ''
}

/**
 * Applies the derived fields (`itemCount`, `categoryId`, `needsDetail`) that the
 * finds repository keeps up to date whenever Items move in or out.
 *
 * Hand the Items under the Find in whatever state they are in: this is the place
 * that decides which of them still count, so a Find binned together with its
 * Items keeps describing them and a Find whose last Item the user binned by hand
 * becomes a Miss.
 */
export function deriveFromItems(find: Find, items: readonly Item[]): Find {
  const mine = itemsBelongingTo(find, items)
  return {
    ...find,
    itemCount: mine.length,
    categoryId: findCategoryId(mine),
    needsDetail: computeNeedsDetail({ note: find.note, itemCount: mine.length }),
  }
}

/** Fills the fields every row has, so no repository writes a half-shaped record. */
export function stampNew<T extends { id: string; createdAt: Millis; updatedAt: Millis; deletedAt: Millis }>(
  id: string,
  at: Millis,
): Pick<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return { id, createdAt: at, updatedAt: at, deletedAt: LIVE } as Pick<
    T,
    'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
  >
}

/** Normalises the sentinel fields so a caller can pass undefined and get '' back. */
export function normaliseFind(find: Find): Find {
  return {
    ...find,
    siteId: find.siteId ?? UNASSIGNED,
    sessionId: find.sessionId ?? UNASSIGNED,
    categoryId: find.categoryId ?? UNASSIGNED,
  }
}
