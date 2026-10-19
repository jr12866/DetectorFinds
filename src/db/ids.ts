import { v7 as uuidv7 } from 'uuid'

/**
 * Every record id is a UUIDv7 (ADR-0002): time-ordered, so a list of ids sorted
 * as strings is roughly the order they were created, and safe to merge by hand if
 * a user ever has two phones.
 */
export function newId(): string {
  return uuidv7()
}

/** Ids sort by creation time, which is what makes `id` a usable tie-break. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
