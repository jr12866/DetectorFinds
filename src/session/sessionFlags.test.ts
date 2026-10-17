import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  blocksUpdate,
  getSessionFlags,
  resetSessionFlags,
  setSessionOpen,
  setTrackActive,
  subscribeSessionFlags,
} from './sessionFlags'

describe('sessionFlags', () => {
  beforeEach(() => {
    resetSessionFlags()
  })

  it('starts with nothing open, so an update may be applied', () => {
    expect(getSessionFlags()).toEqual({ sessionOpen: false, trackActive: false })
    expect(blocksUpdate()).toBe(false)
  })

  it('blocks an update while a Session is open', () => {
    setSessionOpen(true)
    expect(blocksUpdate()).toBe(true)
  })

  it('blocks an update while a Track is active', () => {
    setSessionOpen(true)
    setTrackActive(true)
    expect(blocksUpdate()).toBe(true)
  })

  it('ignores a Track started with no Session open', () => {
    setTrackActive(true)
    expect(getSessionFlags().trackActive).toBe(false)
    expect(blocksUpdate()).toBe(false)
  })

  it('a Track cannot outlive its Session', () => {
    setSessionOpen(true)
    setTrackActive(true)
    setSessionOpen(false)
    expect(getSessionFlags()).toEqual({ sessionOpen: false, trackActive: false })
    expect(blocksUpdate()).toBe(false)
  })

  it('closing the Session alone clears both flags', () => {
    setSessionOpen(true)
    setTrackActive(true)
    setSessionOpen(false)
    expect(blocksUpdate()).toBe(false)
  })

  it('tells subscribers when the flags change and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSessionFlags(listener)

    setSessionOpen(true)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setSessionOpen(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous snapshot when a flag is set to the value it already had', () => {
    setSessionOpen(true)
    const before = getSessionFlags()
    setSessionOpen(true)
    expect(getSessionFlags()).toEqual(before)
  })
})
