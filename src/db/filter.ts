import type { Collection } from 'dexie'
import type { AppDatabase } from './schema'
import { betweenClosed } from './ranges'
import { LIVE, UNASSIGNED, type Find, type Item, type Landowner, type Site } from './types'

/**
 * Filtering Finds (R-LIST-1, R-LIST-2).
 *
 * The shape of the problem: some predicates belong to the Find, some belong to
 * its Items, and one of them (search) belongs to the Site and Landowner as well.
 * So the query runs in two halves:
 *
 *   1. the Item-side and name-side predicates produce a set of find ids;
 *   2. the Find-side predicates pick rows off an index, and the id set is applied
 *      as a filter.
 *
 * Index choice is deliberately modest. There are at most 5,000 live Finds
 * (PRD §11), so a plain scan costs single-digit milliseconds; the indexes are
 * used where they are an obvious win (one Site, one Session, one Category, a date
 * range) and the rest is filtered in TypeScript rather than contorted into a
 * compound key. That keeps the rules in one readable place, which matters more
 * here than the last 5 ms.
 */

export interface FindFilter {
  /** Finds attached to any of these Sites. `[]` means "no Site at all". */
  siteIds?: string[]
  /** Finds attached to any of these Sessions. */
  sessionIds?: string[]
  /** Date Found range, inclusive, in ms since the epoch. */
  fromMs?: number
  toMs?: number
  /** Find Category ids. `''` selects Misses. */
  categories?: string[]
  /** Precious-metal flags on the Find's Items. */
  preciousMetals?: 'any' | 'silver' | 'gold' | 'silver-or-gold'
  /** Date On year range, inclusive. Items with no Date On year never match. */
  dateOnFromYear?: number
  dateOnToYear?: number
  /** Drop Misses (a Find with no Items). */
  hideMisses?: boolean
  /** Only Finds that still need enriching. */
  needsDetailOnly?: boolean
  /** Case-insensitive substring across notes, names, classification and tags. */
  search?: string
  /** Cap the result. Newest first. */
  limit?: number
}

/**
 * Fields the free-text search reads. Kept here so the test can name them. The
 * Find side also reaches the Site and Landowner names, so searching for a place
 * name finds the Finds in it.
 */
export const FIND_SEARCH_FIELDS = ['note', 'categoryId'] as const
export const ITEM_SEARCH_FIELDS = ['note', 'subType', 'categoryId', 'material', 'dateOnText', 'dateOnYear', 'tags'] as const

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

/** One search term may be several words; every word has to appear. */
function searchTerms(search: string): string[] {
  return search
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word !== '')
}

/**
 * The words are already lower case, so the haystack is lower-cased once rather
 * than once per word: at the PRD ceiling it holds a note, two names and every
 * Item on the Find.
 */
function matchesAll(text: string, terms: string[]): boolean {
  const haystack = text.toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

function itemSearchText(item: Item): string {
  return [
    item.note,
    item.subType,
    item.categoryId,
    item.material,
    item.dateOnText,
    // A year of 0 means "not recorded", and putting "0" in the haystack would make
    // a search for "0" match every Item.
    item.dateOnYear === 0 ? '' : String(item.dateOnYear),
    item.tags.join(' '),
  ].join(' ')
}

function findSearchText(find: Find, site?: Site, landowner?: Landowner): string {
  return [
    find.note,
    find.categoryId,
    site?.name ?? '',
    landowner?.name ?? '',
  ].join(' ')
}

function itemMatchesMetal(item: Item, want: NonNullable<FindFilter['preciousMetals']>): boolean {
  switch (want) {
    case 'any':
      return true
    case 'silver':
      return item.isSilver === 'yes'
    case 'gold':
      return item.isGold === 'yes'
    case 'silver-or-gold':
      return item.isSilver === 'yes' || item.isGold === 'yes'
  }
}

function itemMatchesDateOn(item: Item, filter: FindFilter): boolean {
  if (filter.dateOnFromYear === undefined && filter.dateOnToYear === undefined) return true
  if (item.dateOnYear === 0) return false
  if (filter.dateOnFromYear !== undefined && item.dateOnYear < filter.dateOnFromYear) return false
  if (filter.dateOnToYear !== undefined && item.dateOnYear > filter.dateOnToYear) return false
  return true
}

/**
 * What the Items have to say about which Finds to show, in one pass over the
 * live Items.
 *
 * Two answers, because they do different jobs:
 *
 * - `predicates` is the set of find ids whose Items satisfy the metal and Date On
 *   predicates. Null when neither is set, which means "do not restrict". This is
 *   the half that gates the list, because a metal or a date belongs to an Item and
 *   a Find with no such Item must not appear.
 * - `itemTextByFind` is everything each Find's Items say, joined per Find, so the
 *   search box can read it alongside the Find, its Site and its Landowner. Search
 *   is deliberately not a gate of its own: a search for a Site name matches every
 *   Find in that Site, and there is no Item anywhere in the match. Treating the
 *   Item half as the gate is what made a search for a place name return nothing.
 */
interface ItemSide {
  predicates: Set<string> | null
  itemTextByFind: Map<string, string>
}

async function itemSide(db: AppDatabase, filter: FindFilter, searching: boolean): Promise<ItemSide> {
  const wantMetal = filter.preciousMetals && filter.preciousMetals !== 'any' ? filter.preciousMetals : undefined
  const needsDateOn = filter.dateOnFromYear !== undefined || filter.dateOnToYear !== undefined
  const hasPredicates = wantMetal !== undefined || needsDateOn
  if (!hasPredicates && !searching) return { predicates: null, itemTextByFind: new Map() }

  const items = await db.items.where('deletedAt').equals(LIVE).toArray()
  const predicates = hasPredicates ? new Set<string>() : null
  const itemTextByFind = new Map<string, string>()
  for (const item of items) {
    if (item.findId === UNASSIGNED) continue
    if (predicates && (!wantMetal || itemMatchesMetal(item, wantMetal)) && (!needsDateOn || itemMatchesDateOn(item, filter))) {
      predicates.add(item.findId)
    }
    if (searching) {
      const sofar = itemTextByFind.get(item.findId)
      const text = itemSearchText(item)
      itemTextByFind.set(item.findId, sofar === undefined ? text : `${sofar} ${text}`)
    }
  }
  return { predicates, itemTextByFind }
}

/** Names live on the Site and the Landowner, so the search has to reach them. */
async function siteNamesById(db: AppDatabase): Promise<Map<string, { site?: Site; landowner?: Landowner }>> {
  const [sites, landowners] = await Promise.all([
    db.sites.where('deletedAt').equals(LIVE).toArray(),
    db.landowners.where('deletedAt').equals(LIVE).toArray(),
  ])
  const owners = new Map(landowners.map((landowner) => [landowner.id, landowner]))
  return new Map(
    sites.map((site) => [site.id, { site, landowner: owners.get(site.landownerId) ?? undefined }]),
  )
}

/**
 * Picks the index to read from. Only ever one, because a bounding box in two
 * dimensions at once is not expressible as a compound key — everything else is a
 * filter.
 */
function baseQuery(db: AppDatabase, filter: FindFilter): Collection<Find> {
  const { fromMs, toMs } = filter
  const sites = filter.siteIds
  const sessions = filter.sessionIds
  const categories = filter.categories

  if (sites && sites.length === 1) {
    return betweenClosed(db.finds.where('[siteId+foundAt]'), [sites[0], fromMs ?? -Infinity], [sites[0], toMs ?? Infinity])
  }
  if (sessions && sessions.length === 1) {
    // There is no [deletedAt+sessionId] index, so this one still has to drop
    // binned Finds in the filter below.
    return betweenClosed(
      db.finds.where('[sessionId+foundAt]'),
      [sessions[0], fromMs ?? -Infinity],
      [sessions[0], toMs ?? Infinity],
    )
  }
  if (categories && categories.length === 1) {
    return betweenClosed(
      db.finds.where('[categoryId+foundAt]'),
      [categories[0], fromMs ?? -Infinity],
      [categories[0], toMs ?? Infinity],
    )
  }
  if (fromMs !== undefined || toMs !== undefined) {
    // [deletedAt+foundAt] keeps the Bin out of a date-range read for free.
    return betweenClosed(db.finds.where('[deletedAt+foundAt]'), [LIVE, fromMs ?? -Infinity], [LIVE, toMs ?? Infinity])
  }
  return betweenClosed(db.finds.where('[deletedAt+foundAt]'), [LIVE, -Infinity], [LIVE, Infinity])
}

function passesFindSide(find: Find, filter: FindFilter, itemFindIds: Set<string> | null): boolean {
  if (find.deletedAt !== LIVE) return false
  if (filter.siteIds) {
    const key = find.siteId === UNASSIGNED ? '' : find.siteId
    if (!filter.siteIds.includes(key)) return false
  }
  if (filter.sessionIds) {
    const key = find.sessionId === UNASSIGNED ? '' : find.sessionId
    if (!filter.sessionIds.includes(key)) return false
  }
  if (filter.categories && !filter.categories.includes(find.categoryId)) return false
  if (filter.fromMs !== undefined && find.foundAt < filter.fromMs) return false
  if (filter.toMs !== undefined && find.foundAt > filter.toMs) return false
  if (filter.hideMisses && find.categoryId === '') return false
  if (filter.needsDetailOnly && find.needsDetail !== 1) return false
  if (itemFindIds && !itemFindIds.has(find.id)) return false
  return true
}

async function matchingFinds(db: AppDatabase, filter: FindFilter): Promise<Find[]> {
  const terms = filter.search ? searchTerms(filter.search) : []
  const items = await itemSide(db, filter, terms.length > 0)
  const names = terms.length > 0 ? await siteNamesById(db) : new Map<string, { site?: Site; landowner?: Landowner }>()

  const rows = await baseQuery(db, filter).toArray()
  const out = rows.filter((find) => {
    if (!passesFindSide(find, filter, items.predicates)) return false
    if (terms.length === 0) return true
    // Every word has to appear somewhere on the same Find: in its note, in its
    // Site or Landowner name, or in one of its Items. Not necessarily in the same
    // place — "button farm" is a Category in one field and a Site name in
    // another — but words that only exist on two different Finds match neither.
    const named = names.get(find.siteId)
    const text = [findSearchText(find, named?.site, named?.landowner), items.itemTextByFind.get(find.id) ?? '']
    return matchesAll(text.join(' '), terms)
  })

  out.sort((a, b) => b.foundAt - a.foundAt)
  if (filter.limit !== undefined && filter.limit >= 0) return out.slice(0, filter.limit)
  return out
}

/** Finds matching the filter, newest first. */
export async function queryFinds(db: AppDatabase, filter: FindFilter = {}): Promise<Find[]> {
  return matchingFinds(db, filter)
}

/** How many Finds match, without building the list. */
export async function countFinds(db: AppDatabase, filter: FindFilter = {}): Promise<number> {
  if (isEmptyFilter(filter)) return db.finds.where('deletedAt').equals(LIVE).count()
  return (await matchingFinds(db, { ...filter, limit: undefined })).length
}

/** Finds needing detail (R-LIST-3), newest deletion order not applied — oldest first, so the front of the queue is the oldest hole. */
export async function needsDetailQueue(db: AppDatabase, limit = 50): Promise<Find[]> {
  // The Bin is not a queue: a Find the user has thrown away is not waiting to be
  // finished, and a binned Miss would otherwise sit at the front of the list
  // because it is the oldest thing in the database.
  const rows = await betweenClosed(db.finds.where('[needsDetail+foundAt]'), [1, -Infinity], [1, Infinity])
    .filter((find) => find.deletedAt === LIVE)
    .toArray()
  rows.sort((a, b) => a.foundAt - b.foundAt)
  return limit > 0 ? rows.slice(0, limit) : rows
}

export function isEmptyFilter(filter: FindFilter): boolean {
  return (
    filter.siteIds === undefined &&
    filter.sessionIds === undefined &&
    filter.fromMs === undefined &&
    filter.toMs === undefined &&
    filter.categories === undefined &&
    (filter.preciousMetals === undefined || filter.preciousMetals === 'any') &&
    filter.dateOnFromYear === undefined &&
    filter.dateOnToYear === undefined &&
    !filter.hideMisses &&
    !filter.needsDetailOnly &&
    !hasText(filter.search)
  )
}

/** One line describing the filter, for the list header and for tests. */
export function describeFilter(filter: FindFilter): string {
  if (isEmptyFilter(filter)) return 'all finds'
  const parts: string[] = []
  if (filter.siteIds) parts.push(filter.siteIds.includes('') ? 'no site' : `${filter.siteIds.length} site(s)`)
  if (filter.sessionIds) parts.push(`${filter.sessionIds.length} session(s)`)
  if (filter.categories) parts.push(filter.categories.map((c) => (c === '' ? 'miss' : c)).join('/'))
  if (filter.preciousMetals && filter.preciousMetals !== 'any') parts.push(filter.preciousMetals)
  if (filter.dateOnFromYear !== undefined || filter.dateOnToYear !== undefined) {
    parts.push(`date on ${filter.dateOnFromYear ?? '?'}–${filter.dateOnToYear ?? '?'}`)
  }
  if (filter.fromMs !== undefined || filter.toMs !== undefined) {
    const from = filter.fromMs === undefined ? '?' : new Date(filter.fromMs).toISOString().slice(0, 10)
    const to = filter.toMs === undefined ? '?' : new Date(filter.toMs).toISOString().slice(0, 10)
    parts.push(`found ${from}–${to}`)
  }
  if (filter.hideMisses) parts.push('hides misses')
  if (filter.needsDetailOnly) parts.push('needs detail')
  const search = filter.search?.trim() ?? ''
  if (search) parts.push(`"${search}"`)
  return parts.join(' · ')
}

/** The Item projections a list row needs, in one read. */
export async function itemsForFinds(db: AppDatabase, findIds: string[]): Promise<Map<string, Item[]>> {
  const byFind = new Map<string, Item[]>()
  if (findIds.length === 0) return byFind
  const items = await db.items.where('deletedAt').equals(LIVE).toArray()
  const wanted = new Set(findIds)
  for (const item of items) {
    if (!wanted.has(item.findId)) continue
    const list = byFind.get(item.findId) ?? []
    list.push(item)
    byFind.set(item.findId, list)
  }
  for (const list of byFind.values()) list.sort((a, b) => a.createdAt - b.createdAt)
  return byFind
}
