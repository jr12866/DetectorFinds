import { describe, expect, it } from 'vitest'

import { compatibilityBanner } from './compatBanner'
import type { PlatformReport } from './platform'

const android: PlatformReport = {
  android: true,
  ios: false,
  desktop: false,
  installable: true,
}
const iphone: PlatformReport = {
  android: false,
  ios: true,
  desktop: false,
  installable: true,
}
const desktop: PlatformReport = {
  android: false,
  ios: false,
  desktop: true,
  installable: true,
}
const noServiceWorker: PlatformReport = {
  android: false,
  ios: false,
  desktop: false,
  installable: false,
}

describe('compatibilityBanner', () => {
  it('says plainly when the browser cannot work offline', () => {
    const banner = compatibilityBanner(noServiceWorker, false)
    expect(banner?.tone).toBe('bad')
    expect(banner?.text).toMatch('offline')
  })

  it('warns iOS users that nothing is promised', () => {
    const banner = compatibilityBanner(iphone, true)
    expect(banner?.tone).toBe('warn')
    expect(banner?.text).toMatch('Android')
  })

  it('tells a desktop user the field screens are made for a phone', () => {
    const banner = compatibilityBanner(desktop, true)
    expect(banner?.tone).toBe('info')
    expect(banner?.text).toMatch('phone')
  })

  it('tells an Android browser tab how to install', () => {
    const banner = compatibilityBanner(android, false)
    expect(banner?.tone).toBe('info')
    expect(banner?.text).toMatch('home screen')
  })

  it('says nothing once the supported case is installed', () => {
    expect(compatibilityBanner(android, true)).toBeNull()
  })

  it('puts the hardest problem first', () => {
    // An iOS browser with no service worker gets the offline message, not the iOS one.
    const banner = compatibilityBanner({ ...iphone, installable: false }, true)
    expect(banner?.tone).toBe('bad')
  })
})
