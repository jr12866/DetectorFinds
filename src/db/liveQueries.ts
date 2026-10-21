import { useLiveQuery } from 'dexie-react-hooks'
import { countFinds, needsDetailQueue, queryFinds, type FindFilter } from './filter'
import { getRepositories } from './repos'
import type { Find, Item, Photo, Site } from './types'

/**
 * The live queries the UI will read through (build item 5).
 *
 * `useLiveQuery` re-runs when a table it touched changes, so a screen never asks
 * for a refresh: binning a Find updates the list, the count in the header and the
 * Needs Detail badge at the same time. That is the whole reason this file exists
 * and the reason there is nothing in it but glue — every function it calls is
 * unit-tested (`filter.test.ts`, the repository tests), so the only thing here
 * that could be wrong is which query runs when, which is what the dependency keys
 * below are for.
 *
 * Two rules the hooks follow:
 *
 * - A filter is keyed by its JSON, not its identity. A screen rebuilds its filter
 *   object on every render, and re-running a query because an object was
 *   re-created would thrash the database.
 * - A hook with nothing to look up short-circuits inside the querier rather than
 *   passing a null dependency list, which is how this version of
 *   `dexie-react-hooks` says "do not run".
 * - `undefined` means "not read yet". Screens show a reading state rather than
 *   showing zero, because zero and unknown look the same in a list header.
 */

/** Finds matching the filter, newest first (R-LIST-1). */
export function useFinds(filter: FindFilter = {}): Find[] | undefined {
  const { db } = getRepositories()
  return useLiveQuery(() => queryFinds(db, filter), [JSON.stringify(filter)])
}

/** How many Finds match, for the list header, without building the list. */
export function useFindCount(filter: FindFilter = {}): number | undefined {
  const { db } = getRepositories()
  return useLiveQuery(() => countFinds(db, filter), [JSON.stringify(filter)])
}

/**
 * One Find. `undefined` is ambiguous here — it means not read yet or not there —
 * so callers that must tell the two apart read through the repository instead.
 */
export function useFind(id: string | undefined): Find | undefined {
  const { db } = getRepositories()
  return useLiveQuery(() => (id ? db.finds.get(id) : undefined), [id ?? ''])
}

/** The Find's live Items. Binned Items are already excluded by the repository. */
export function useItemsOfFind(findId: string | undefined): Item[] | undefined {
  const { items } = getRepositories()
  return useLiveQuery(() => (findId ? items.forFind(findId) : []), [findId ?? ''])
}

/** Live photos for one Find or Item, in the order they were added. */
export function usePhotosOfOwner(ownerId: string | undefined): Photo[] | undefined {
  const { photos } = getRepositories()
  return useLiveQuery(() => (ownerId ? photos.forOwner(ownerId) : []), [ownerId ?? ''])
}

/**
 * Every live Site (GLOSSARY), for the name a Pin's card has to show (R-MAP-2) and
 * for the per-Site map view. Step 06 owns the Site screens; the map only needs
 * the names, and reading them through a live query is what keeps a renamed Site
 * correct on the map without the screen doing anything.
 */
export function useSites(): Site[] | undefined {
  const { sites } = getRepositories()
  return useLiveQuery(() => sites.allLive(), [])
}

/** The Needs Detail queue, oldest hole first (R-LIST-3). */
export function useNeedsDetail(limit = 50): Find[] | undefined {
  const { db } = getRepositories()
  return useLiveQuery(() => needsDetailQueue(db, limit), [limit])
}

/**
 * Live Find counts per Site, including the unassigned bucket (R-STATS-1). The
 * first dashboard the app is allowed to have, and deliberately the only one in
 * v1: broader dashboards are v2 (PRD §12).
 */
export function useFindCountsBySite(): Record<string, number> | undefined {
  const { finds } = getRepositories()
  return useLiveQuery(() => finds.countBySite(), [])
}

/** How many live Finds still need detail, for a badge. */
export function useNeedsDetailCount(): number | undefined {
  const { finds } = getRepositories()
  return useLiveQuery(() => finds.countNeedsDetail(), [])
}

/** How many live Finds there are. */
export function useLiveFindCount(): number | undefined {
  const { finds } = getRepositories()
  return useLiveQuery(() => finds.countLive(), [])
}
