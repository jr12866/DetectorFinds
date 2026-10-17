import type { StringStore } from './stringStore'

/**
 * R-FIRST-3: the first run asks the phone to keep this app's data permanently.
 * IndexedDB is best-effort until that grant exists, so nothing about a logged
 * find can be trusted before it. The rules live here rather than in a component
 * so "ask once, never nag" is a test.
 */

/** Remembers that the question has already been put to this phone. */
export const ASKED_KEY = 'detectorfinds.storage.persistenceAsked'
/** Remembers a "not now", so the shell does not bring the question back. */
export const DISMISSED_KEY = 'detectorfinds.storage.persistenceDismissed'

export interface PersistenceFacts {
  /** what navigator.storage.persisted() answered; null means it cannot tell */
  persisted: boolean | null
  /** whether navigator.storage.persist exists in this browser at all */
  requestSupported: boolean
  /** the question has been shown before on this device */
  askedBefore: boolean
  /** the person already said not now */
  dismissed: boolean
}

/**
 * Ask exactly once, and only when storage is not already safe. A refusal is
 * final for the shell: Settings -> Diagnostics keeps a button for later.
 */
export function shouldOfferPersistence(facts: PersistenceFacts): boolean {
  if (!facts.requestSupported) return false
  if (facts.persisted === true) return false
  if (facts.dismissed) return false
  return !facts.askedBefore
}

/** The two remembered answers, behind an injected store so they survive a refresh. */
export interface PersistenceFlags {
  hasAsked(): boolean
  markAsked(): void
  isDismissed(): boolean
  markDismissed(): void
  /** a wiped app, or a deliberate reset, gets the question again */
  reset(): void
}

export function createPersistenceFlags(store: StringStore): PersistenceFlags {
  return {
    hasAsked: () => store.getItem(ASKED_KEY) !== null,
    markAsked: () => store.setItem(ASKED_KEY, new Date().toISOString()),
    isDismissed: () => store.getItem(DISMISSED_KEY) !== null,
    markDismissed: () => store.setItem(DISMISSED_KEY, new Date().toISOString()),
    reset: () => {
      store.removeItem(ASKED_KEY)
      store.removeItem(DISMISSED_KEY)
    },
  }
}
