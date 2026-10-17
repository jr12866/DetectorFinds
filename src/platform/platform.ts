/**
 * Platform checks. Everything here takes plain values so it can be unit tested
 * without a browser.
 */

export function isAndroid(userAgent: string): boolean {
  return /android/i.test(userAgent)
}

/** iPadOS 13+ reports a macOS user agent, so touch points do the telling. */
export function isIos(userAgent: string, maxTouchPoints = 0): boolean {
  const ua = userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return true
  return /macintosh|mac os x/.test(ua) && maxTouchPoints > 1
}

export function isDesktop(userAgent: string, maxTouchPoints = 0): boolean {
  if (isAndroid(userAgent) || isIos(userAgent, maxTouchPoints)) return false
  return /windows|macintosh|mac os x|linux|cros/i.test(userAgent)
}

/** True when the browser cannot register a service worker, so it cannot work offline. */
export function supportsServiceWorker(serviceWorkerInWindow: boolean): boolean {
  return serviceWorkerInWindow
}

/**
 * Service worker support lives on `navigator`, never on `window`. Both call
 * sites read it through this helper so that mistake cannot come back.
 */
export function readServiceWorkerSupport(nav: unknown): boolean {
  return Boolean(nav && typeof nav === 'object' && 'serviceWorker' in nav)
}

/** True when the app is running from its installed shortcut rather than a tab. */
export function isStandaloneDisplay(matchesStandalone: boolean): boolean {
  return matchesStandalone
}

export interface PlatformReport {
  android: boolean
  ios: boolean
  desktop: boolean
  /** A PWA can be installed and run offline here. */
  installable: boolean
}

export function describePlatform(
  userAgent: string,
  maxTouchPoints: number,
  serviceWorkerSupported: boolean,
): PlatformReport {
  return {
    android: isAndroid(userAgent),
    ios: isIos(userAgent, maxTouchPoints),
    desktop: isDesktop(userAgent, maxTouchPoints),
    installable: supportsServiceWorker(serviceWorkerSupported),
  }
}
