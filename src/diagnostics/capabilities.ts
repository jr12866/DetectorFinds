import { formatBytes } from './format'
import type { DiagnosticRow } from './format'
import { describePlatform, readServiceWorkerSupport } from '../platform/platform'

/**
 * What the Diagnostics screen reports (R-FIRST-4). The browser calls live in
 * `readBrowserSources`; `collectDiagnostics` only looks at plain values, so the
 * pass/fail rules can be tested without a browser.
 */

export type ServiceWorkerState =
  | 'unsupported'
  | 'none'
  | 'installing'
  | 'active'
  | 'controlling'
  | 'waiting'
  | 'error'

export interface DiagnosticSources {
  userAgent: string
  platform: string
  maxTouchPoints: number
  devicePixelRatio: number
  viewport: { width: number; height: number }
  online: boolean
  standalone: boolean
  serviceWorkerSupported: boolean
  serviceWorkerState: ServiceWorkerState
  storagePersisted: boolean | null
  storagePersistRequestSupported: boolean
  storageEstimate: { usage: number; quota: number } | null
  geolocationSupported: boolean
  geolocationPermission: string | null
  wakeLockSupported: boolean
  fileSystemAccessSupported: boolean
  orientationLockSupported: boolean
  deviceOrientationSupported: boolean
  webShareSupported: boolean
  indexedDbSupported: boolean
  cacheStorageSupported: boolean
  clipboardSupported: boolean
  sessionOpen: boolean
  trackActive: boolean
  appVersion: string
  buildTime: string
}

const SW_LABEL: Record<ServiceWorkerState, string> = {
  unsupported: 'not supported',
  none: 'not installed',
  installing: 'installing',
  active: 'active',
  controlling: 'controlling this page',
  waiting: 'waiting to take over',
  error: 'failed to register',
}

const SW_STATUS: Record<ServiceWorkerState, DiagnosticRow['status']> = {
  unsupported: 'bad',
  none: 'warn',
  installing: 'info',
  active: 'ok',
  controlling: 'ok',
  waiting: 'info',
  error: 'bad',
}

/**
 * A first install registers its service worker *after* the first paint, so the
 * very first read can say "not installed" about an app that is actually fine.
 * One extra read, once the registration settles, is enough (R-FIRST-4).
 */
export function shouldRecheckServiceWorker(
  s: Pick<DiagnosticSources, 'serviceWorkerSupported' | 'serviceWorkerState'>,
): boolean {
  return s.serviceWorkerSupported && s.serviceWorkerState === 'none'
}

export function collectDiagnostics(s: DiagnosticSources): DiagnosticRow[] {
  const platform = describePlatform(s.userAgent, s.maxTouchPoints, s.serviceWorkerSupported)
  const rows: DiagnosticRow[] = []

  rows.push({ id: 'version', label: 'App version', value: s.appVersion, status: 'info' })
  rows.push({ id: 'build', label: 'Built', value: s.buildTime || 'unknown', status: 'info' })

  rows.push({
    id: 'platform',
    label: 'Platform',
    value: platform.android ? 'Android' : platform.ios ? 'iOS' : platform.desktop ? 'Desktop' : 'unknown',
    status: platform.ios ? 'warn' : 'info',
    note: platform.ios ? 'DetectorFinds targets Android; iOS is unsupported' : undefined,
  })
  rows.push({
    id: 'browser',
    label: 'User agent',
    value: s.userAgent,
    status: 'info',
  })

  rows.push({
    id: 'installable',
    label: 'Can install',
    value: platform.installable ? 'yes' : 'no',
    status: platform.installable ? 'ok' : 'bad',
    note: platform.installable ? undefined : 'needs a browser that supports service workers',
  })
  rows.push({
    id: 'standalone',
    label: 'Running as',
    value: s.standalone ? 'installed app' : 'browser tab',
    status: s.standalone ? 'ok' : 'info',
  })
  rows.push({
    id: 'service-worker',
    label: 'Service worker',
    value: SW_LABEL[s.serviceWorkerState],
    status: SW_STATUS[s.serviceWorkerState],
  })

  rows.push(persistenceRow(s.storagePersisted))
  rows.push(storageRow(s.storageEstimate))

  rows.push({
    id: 'indexeddb',
    label: 'IndexedDB',
    value: s.indexedDbSupported ? 'available' : 'missing',
    status: s.indexedDbSupported ? 'ok' : 'bad',
  })
  rows.push({
    id: 'cache-storage',
    label: 'Cache Storage',
    value: s.cacheStorageSupported ? 'available' : 'missing',
    status: s.cacheStorageSupported ? 'ok' : 'bad',
  })

  rows.push(geolocationRow(s.geolocationSupported, s.geolocationPermission))
  rows.push({
    id: 'wake-lock',
    label: 'Wake Lock',
    value: s.wakeLockSupported ? 'supported' : 'not supported',
    status: s.wakeLockSupported ? 'ok' : 'warn',
    note: s.wakeLockSupported ? undefined : 'the screen may sleep during a Session',
  })
  rows.push({
    id: 'file-system-access',
    label: 'File System Access',
    value: s.fileSystemAccessSupported ? 'supported' : 'not supported',
    status: s.fileSystemAccessSupported ? 'ok' : 'warn',
    note: s.fileSystemAccessSupported
      ? undefined
      : 'needs Chrome Android 132+; exports fall back to downloads',
  })
  rows.push({
    id: 'orientation-lock',
    label: 'Screen orientation lock',
    value: s.orientationLockSupported ? 'supported' : 'not supported',
    status: s.orientationLockSupported ? 'ok' : 'warn',
  })
  rows.push({
    id: 'device-orientation',
    label: 'Compass',
    value: s.deviceOrientationSupported ? 'supported' : 'not supported',
    status: s.deviceOrientationSupported ? 'ok' : 'info',
  })
  rows.push({
    id: 'web-share',
    label: 'Web Share',
    value: s.webShareSupported ? 'supported' : 'not supported',
    status: s.webShareSupported ? 'ok' : 'info',
  })
  rows.push({
    id: 'clipboard',
    label: 'Clipboard',
    value: s.clipboardSupported ? 'supported' : 'not supported',
    status: s.clipboardSupported ? 'ok' : 'info',
  })

  rows.push({
    id: 'network',
    label: 'Network',
    value: s.online ? 'online' : 'offline',
    status: 'info',
  })
  rows.push({
    id: 'session',
    label: 'Session',
    value: s.sessionOpen ? (s.trackActive ? 'open, tracking' : 'open') : 'closed',
    status: 'info',
    note: 'stub flag until step 05',
  })

  rows.push({
    id: 'viewport',
    label: 'Viewport',
    value: `${s.viewport.width} x ${s.viewport.height} at ${s.devicePixelRatio}x`,
    status: 'info',
  })

  return rows
}

export function persistenceRow(persisted: boolean | null): DiagnosticRow {
  if (persisted === null) {
    return {
      id: 'persistence',
      label: 'Persistent storage',
      value: 'cannot tell',
      status: 'bad',
      note: 'the browser will evict data under pressure',
    }
  }
  if (persisted) {
    return { id: 'persistence', label: 'Persistent storage', value: 'granted', status: 'ok' }
  }
  return {
    id: 'persistence',
    label: 'Persistent storage',
    value: 'not granted',
    status: 'warn',
    note: 'request it before logging anything',
  }
}

export function storageRow(estimate: { usage: number; quota: number } | null): DiagnosticRow {
  if (!estimate) {
    return { id: 'storage', label: 'Storage', value: 'unknown', status: 'info' }
  }
  const used = `${formatBytes(estimate.usage)} used of ${formatBytes(estimate.quota)}`
  return { id: 'storage', label: 'Storage', value: used, status: 'info' }
}

export function geolocationRow(supported: boolean, permission: string | null): DiagnosticRow {
  if (!supported) {
    return { id: 'geolocation', label: 'Geolocation', value: 'missing', status: 'bad' }
  }
  switch (permission) {
    case 'granted':
      return { id: 'geolocation', label: 'Geolocation', value: 'allowed', status: 'ok' }
    case 'denied':
      return {
        id: 'geolocation',
        label: 'Geolocation',
        value: 'blocked',
        status: 'bad',
        note: 'allow it in site settings',
      }
    case 'prompt':
      return {
        id: 'geolocation',
        label: 'Geolocation',
        value: 'not asked yet',
        status: 'warn',
      }
    default:
      return { id: 'geolocation', label: 'Geolocation', value: 'unknown', status: 'warn' }
  }
}

/**
 * Reads the real browser. Every probe is optional: a missing API is reported,
 * never thrown.
 */
export async function readBrowserSources(): Promise<DiagnosticSources> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator
  const win = typeof window === 'undefined' ? undefined : window

  const storagePersisted = await safeAsync(async () => {
    if (!nav?.storage?.persisted) return null
    return await nav.storage.persisted()
  })
  const storageEstimate = await safeAsync(async () => {
    if (!nav?.storage?.estimate) return null
    const estimate = await nav.storage.estimate()
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
  })
  const geolocationPermission = await safeAsync(async () => {
    if (!nav?.permissions?.query) return null
    const status = await nav.permissions.query({ name: 'geolocation' as PermissionName })
    return status.state
  })
  const serviceWorkerState = await readServiceWorkerState()

  return {
    userAgent: nav?.userAgent ?? 'unknown',
    platform: nav?.platform ?? 'unknown',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    devicePixelRatio: win?.devicePixelRatio ?? 1,
    viewport: {
      width: win?.innerWidth ?? 0,
      height: win?.innerHeight ?? 0,
    },
    online: nav ? nav.onLine : false,
    standalone: Boolean(win?.matchMedia?.('(display-mode: standalone)').matches),
    serviceWorkerSupported: readServiceWorkerSupport(nav),
    serviceWorkerState,
    storagePersisted: storagePersisted ?? null,
    storagePersistRequestSupported: Boolean(nav?.storage?.persist),
    storageEstimate: storageEstimate ?? null,
    geolocationSupported: Boolean(nav?.geolocation),
    geolocationPermission: geolocationPermission ?? null,
    wakeLockSupported: Boolean(nav && 'wakeLock' in nav),
    fileSystemAccessSupported: Boolean(win && 'showDirectoryPicker' in win),
    orientationLockSupported: Boolean(win?.screen?.orientation && 'lock' in win.screen.orientation),
    deviceOrientationSupported: typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
    webShareSupported: Boolean(nav && 'share' in nav),
    indexedDbSupported: typeof indexedDB !== 'undefined',
    cacheStorageSupported: Boolean(win && 'caches' in win),
    clipboardSupported: Boolean(nav?.clipboard?.writeText),
    sessionOpen: false,
    trackActive: false,
    appVersion: __APP_VERSION__,
    buildTime: __BUILD_TIME__,
  }
}

async function readServiceWorkerState(): Promise<ServiceWorkerState> {
  if (typeof window === 'undefined' || !readServiceWorkerSupport(navigator)) return 'unsupported'
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return 'none'
    if (registration.waiting) return 'waiting'
    if (registration.active) {
      return navigator.serviceWorker.controller ? 'controlling' : 'active'
    }
    if (registration.installing) return 'installing'
    return 'none'
  } catch {
    return 'error'
  }
}

async function safeAsync<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch {
    return null
  }
}
