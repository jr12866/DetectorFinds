import type { StoreName } from './types'

/**
 * R-EDIT-3: deleting a Site or Session that still contains Finds is refused, and
 * the refusal has to be something the UI can react to — the same dialog offers to
 * move the children elsewhere. A typed error, rather than a null or a boolean, so
 * the caller cannot forget to check.
 */
export type BlockedReason =
  | 'site-has-finds'
  | 'site-has-sessions'
  | 'session-has-finds'
  | 'landowner-has-sites'
  | 'find-has-items'

export class DeleteBlockedError extends Error {
  readonly reason: BlockedReason
  /** The record the caller tried to delete. */
  readonly store: StoreName
  readonly id: string
  /** The store that is in the way. */
  readonly blockingStore: StoreName
  readonly count: number
  /** Children, so the UI can offer to re-parent them in the same dialog. */
  readonly blockingIds: string[]

  constructor(
    reason: BlockedReason,
    store: StoreName,
    id: string,
    blockingStore: StoreName,
    blockingIds: string[],
  ) {
    super(`${store} ${id} cannot be deleted: ${reason} (${blockingIds.length} in ${blockingStore})`)
    this.name = 'DeleteBlockedError'
    this.reason = reason
    this.store = store
    this.id = id
    this.blockingStore = blockingStore
    this.count = blockingIds.length
    this.blockingIds = blockingIds
  }
}

export function isDeleteBlocked(error: unknown): error is DeleteBlockedError {
  return error instanceof DeleteBlockedError
}

/** Thrown when a write is refused because the record it points at does not exist. */
export class NotFoundError extends Error {
  readonly store: StoreName
  readonly id: string

  constructor(store: StoreName, id: string) {
    super(`${store} ${id} does not exist`)
    this.name = 'NotFoundError'
    this.store = store
    this.id = id
  }
}
