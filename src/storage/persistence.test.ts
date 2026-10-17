import { describe, expect, it } from 'vitest'

import {
  ASKED_KEY,
  createPersistenceFlags,
  DISMISSED_KEY,
  shouldOfferPersistence,
  type PersistenceFacts,
} from './persistence'
import type { StringStore } from './stringStore'

/** A stand-in for localStorage, so the ask-once rule is testable without a browser. */
function memoryStore(): StringStore & { dump(): Record<string, string> } {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    dump: () => Object.fromEntries(data),
  }
}

/** A phone that has never been asked and has no guarantee yet. */
function freshPhone(): PersistenceFacts {
  return { persisted: false, requestSupported: true, askedBefore: false, dismissed: false }
}

describe('shouldOfferPersistence', () => {
  it('offers on a phone that can grant it and has not been asked', () => {
    expect(shouldOfferPersistence(freshPhone())).toBe(true)
  })

  it('offers when the browser cannot say whether storage is already permanent', () => {
    expect(shouldOfferPersistence({ ...freshPhone(), persisted: null })).toBe(true)
  })

  it('stays quiet when storage is already permanent', () => {
    expect(shouldOfferPersistence({ ...freshPhone(), persisted: true })).toBe(false)
  })

  it('stays quiet when the browser has no persist() to call', () => {
    expect(shouldOfferPersistence({ ...freshPhone(), requestSupported: false })).toBe(false)
  })

  it('asks exactly once, so a second launch does not nag', () => {
    expect(shouldOfferPersistence({ ...freshPhone(), askedBefore: true })).toBe(false)
  })

  it('respects a not now, which sends the question to Diagnostics instead', () => {
    expect(shouldOfferPersistence({ ...freshPhone(), dismissed: true })).toBe(false)
  })
})

describe('createPersistenceFlags', () => {
  it('starts with nothing remembered', () => {
    const flags = createPersistenceFlags(memoryStore())
    expect(flags.hasAsked()).toBe(false)
    expect(flags.isDismissed()).toBe(false)
  })

  it('remembers both answers under the documented keys', () => {
    const store = memoryStore()
    const flags = createPersistenceFlags(store)
    flags.markAsked()
    flags.markDismissed()
    expect(Object.keys(store.dump()).sort()).toEqual([ASKED_KEY, DISMISSED_KEY].sort())
    expect(createPersistenceFlags(store).hasAsked()).toBe(true)
    expect(createPersistenceFlags(store).isDismissed()).toBe(true)
  })

  it('survives a simulated refresh, which is what stops the nagging', () => {
    const store = memoryStore()
    createPersistenceFlags(store).markAsked()
    expect(createPersistenceFlags(store).hasAsked()).toBe(true)
  })

  it('stores a readable timestamp, so Diagnostics can say when it last asked', () => {
    const store = memoryStore()
    createPersistenceFlags(store).markAsked()
    const stamp = store.dump()[ASKED_KEY]
    expect(Number.isNaN(Date.parse(stamp))).toBe(false)
  })

  it('reset hands the question back to a fresh phone', () => {
    const store = memoryStore()
    const flags = createPersistenceFlags(store)
    flags.markAsked()
    flags.markDismissed()
    flags.reset()
    expect(store.dump()).toEqual({})
    expect(flags.hasAsked()).toBe(false)
    expect(flags.isDismissed()).toBe(false)
  })

  it('uses the keys the app documents', () => {
    expect(ASKED_KEY).toBe('detectorfinds.storage.persistenceAsked')
    expect(DISMISSED_KEY).toBe('detectorfinds.storage.persistenceDismissed')
  })
})
