import { useCallback, useEffect, useState } from 'react'

import { createPersistenceFlags, shouldOfferPersistence } from './persistence'
import { browserStringStore } from './stringStore'

const flags = createPersistenceFlags(browserStringStore())

export interface PersistenceStatus {
  /** null until the browser answers, or when it cannot tell */
  persisted: boolean | null
  /** the first-run offer should be on screen */
  offer: boolean
  /** the phone refused during this visit, so the card can say so honestly */
  refused: boolean
  /** asks the browser; resolves with what it granted */
  request(): Promise<boolean>
  dismiss(): void
}

/**
 * R-FIRST-3: the first-run persistent-storage request. Whether to ask at all is
 * decided by shouldOfferPersistence, so this only reads the browser, remembers
 * the question was put, and keeps the answer in state.
 */
export function usePersistence(): PersistenceStatus {
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [offer, setOffer] = useState(false)
  const [refused, setRefused] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const current = await readPersisted()
      if (cancelled) return
      setPersisted(current)
      if (
        shouldOfferPersistence({
          persisted: current,
          requestSupported: persistSupported(),
          askedBefore: flags.hasAsked(),
          dismissed: flags.isDismissed(),
        })
      ) {
        flags.markAsked()
        setOffer(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const request = useCallback(async () => {
    const granted = await requestPersistence()
    setPersisted(granted)
    if (granted) {
      setOffer(false)
      setRefused(false)
    } else {
      // a refusal leaves the card on screen saying what happened, but the card
      // never comes back on its own: Settings, then Diagnostics, can ask again
      flags.markDismissed()
      setRefused(true)
    }
    return granted
  }, [])

  const dismiss = useCallback(() => {
    flags.markDismissed()
    setOffer(false)
  }, [])

  return { persisted, offer, refused, request, dismiss }
}

function persistSupported(): boolean {
  return Boolean(navigator?.storage?.persist)
}

async function readPersisted(): Promise<boolean | null> {
  try {
    if (!navigator?.storage?.persisted) return null
    return await navigator.storage.persisted()
  } catch {
    return null
  }
}

async function requestPersistence(): Promise<boolean> {
  if (!persistSupported()) return false
  try {
    return (await navigator.storage.persist()) === true
  } catch {
    return false
  }
}
