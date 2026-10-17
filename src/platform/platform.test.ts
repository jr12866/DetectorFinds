import { describe, expect, it } from 'vitest'

import {
  describePlatform,
  isAndroid,
  isDesktop,
  isIos,
  isStandaloneDisplay,
  readServiceWorkerSupport,
} from './platform'

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
// iPadOS 13+ "desktop site" mode reports a Macintosh UA.
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
const WINDOWS_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'

describe('isAndroid', () => {
  it('recognises Android Chrome', () => {
    expect(isAndroid(ANDROID_CHROME)).toBe(true)
  })

  it('is false for iPhone and desktop', () => {
    expect(isAndroid(IPHONE_SAFARI)).toBe(false)
    expect(isAndroid(WINDOWS_EDGE)).toBe(false)
  })
})

describe('isIos', () => {
  it('recognises iPhone and iPad', () => {
    expect(isIos(IPHONE_SAFARI)).toBe(true)
    expect(isIos(IPAD_SAFARI)).toBe(true)
  })

  it('catches an iPad pretending to be a Mac by its touch points', () => {
    expect(isIos(IPAD_AS_MAC, 0)).toBe(false)
    expect(isIos(IPAD_AS_MAC, 5)).toBe(true)
  })

  it('is false for Android and a real desktop Mac', () => {
    expect(isIos(ANDROID_CHROME, 5)).toBe(false)
    expect(isIos(MAC_SAFARI, 0)).toBe(false)
  })
})

describe('isDesktop', () => {
  it('recognises Windows and macOS browsers', () => {
    expect(isDesktop(WINDOWS_EDGE)).toBe(true)
    expect(isDesktop(MAC_SAFARI)).toBe(true)
  })

  it('is false for phones and for a touch iPad', () => {
    expect(isDesktop(ANDROID_CHROME, 5)).toBe(false)
    expect(isDesktop(IPHONE_SAFARI)).toBe(false)
    expect(isDesktop(IPAD_AS_MAC, 5)).toBe(false)
  })
})

describe('isStandaloneDisplay', () => {
  it('follows the display-mode media query', () => {
    expect(isStandaloneDisplay(true)).toBe(true)
    expect(isStandaloneDisplay(false)).toBe(false)
  })
})

describe('describePlatform', () => {
  it('calls an installed Android PWA the supported case', () => {
    expect(describePlatform(ANDROID_CHROME, 5, true)).toEqual({
      android: true,
      ios: false,
      desktop: false,
      installable: true,
    })
  })

  it('flags iOS even though it can run a service worker', () => {
    expect(describePlatform(IPHONE_SAFARI, 5, true)).toEqual({
      android: false,
      ios: true,
      desktop: false,
      installable: true,
    })
  })

  it('reports a browser that cannot install', () => {
    const report = describePlatform(WINDOWS_EDGE, 0, false)
    expect(report.desktop).toBe(true)
    expect(report.installable).toBe(false)
  })
})

describe('readServiceWorkerSupport', () => {
  it('is false for a window object, because serviceWorker lives on navigator', () => {
    // The footgun this guards: `'serviceWorker' in window` is false in every
    // browser, which used to make the app claim it could not work offline.
    expect(readServiceWorkerSupport({ location: 'https://example.test' })).toBe(false)
  })

  it('is true for a navigator object that carries a service worker container', () => {
    expect(readServiceWorkerSupport({ serviceWorker: {} })).toBe(true)
  })

  it('is false when there is no navigator at all', () => {
    expect(readServiceWorkerSupport(undefined)).toBe(false)
  })
})
