import type { Collection, WhereClause } from 'dexie'

/**
 * A range that includes both of its ends.
 *
 * `WhereClause.between` does not default to that. The type declaration makes it
 * look as though two arguments describe the whole range, but the implementation
 * reads `includeLower = includeLower !== false` and `includeUpper = includeUpper
 * === true` (dexie 4.4.6, `IDBRange.secondaryRange`), so with two arguments the
 * upper end is left out. That is invisible until someone types a Date Found
 * range of 1-14 March into the two boxes and 14 March does not come back, or a
 * Date On range of 1700-1800 quietly refuses the coins dated 1800.
 *
 * Every range in this app is a range a person reads off a screen or types into
 * two boxes, so every one of them is closed. Ranges whose upper end is
 * `Infinity` are safe either way - no key can equal Infinity - but they go
 * through here too, so there is one rule to remember rather than a call site to
 * reason about.
 */
export function betweenClosed<T, TKey = unknown, TInsertType = T>(
  where: WhereClause<T, TKey, TInsertType>,
  lower: unknown,
  upper: unknown,
): Collection<T, TKey, TInsertType> {
  return where.between(lower, upper, true, true)
}
