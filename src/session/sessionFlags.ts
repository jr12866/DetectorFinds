/**
 * Stub flags for the things later steps will make real.
 *
 * R-UPDATE-2 says an update must never be applied in the middle of a Session or
 * a Track. Step 05 owns the real Session state; until then the Diagnostics
 * screen can flip these flags so the guard can be checked on a phone today.
 */

export interface SessionFlags {
  sessionOpen: boolean
  trackActive: boolean
}

let current: SessionFlags = { sessionOpen: false, trackActive: false }

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function getSessionFlags(): SessionFlags {
  return current
}

/** True while an update would interrupt work in the field. */
export function blocksUpdate(): boolean {
  return current.sessionOpen || current.trackActive
}

export function setSessionOpen(open: boolean): void {
  current = { ...current, sessionOpen: open }
  // A Track cannot outlive its Session.
  if (!open) current = { ...current, trackActive: false }
  emit()
}

export function setTrackActive(active: boolean): void {
  if (active && !current.sessionOpen) return
  current = { ...current, trackActive: active }
  emit()
}

export function subscribeSessionFlags(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test helper: put the store back to its starting state. */
export function resetSessionFlags(): void {
  current = { sessionOpen: false, trackActive: false }
  emit()
}
