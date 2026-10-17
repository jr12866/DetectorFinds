import { useSyncExternalStore } from 'react'
import { getSessionFlags, subscribeSessionFlags } from './sessionFlags'
import type { SessionFlags } from './sessionFlags'

export function useSessionFlags(): SessionFlags {
  return useSyncExternalStore(subscribeSessionFlags, getSessionFlags, getSessionFlags)
}
