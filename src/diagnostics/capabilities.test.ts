import { describe, expect, it } from 'vitest'

import {
  collectDiagnostics,
  geolocationRow,
  persistenceRow,
  shouldRecheckServiceWorker,
  storageRow,
  type DiagnosticSources,
} from './capabilities'

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'

/** A phone in the state step 00 wants to reach: installed, persistent, allowed. */
function sources(overrides: Partial<DiagnosticSources> = {}): DiagnosticSources {
  return {
    userAgent: ANDROID_CHROME,
    platform: 'Android',
    maxTouchPoints: 5,
    devicePixelRatio: 2.6,
    viewport: { width: 412, height: 846 },
    online: true,
    standalone: true,
    serviceWorkerSupported: true,
    serviceWorkerState: 'controlling',
    storagePersisted: true,
    storagePersistRequestSupported: true,
    storageEstimate: { usage: 4_200_000, quota: 120_000_000_000 },
    geolocationSupported: true,
    geolocationPermission: 'granted',
    wakeLockSupported: true,
    fileSystemAccessSupported: true,
    orientationLockSupported: true,
    deviceOrientationSupported: true,
    webShareSupported: true,
    indexedDbSupported: true,
    cacheStorageSupported: true,
    clipboardSupported: true,
    sessionOpen: false,
    trackActive: false,
    appVersion: '0.1.0',
    buildTime: '2026-10-17T12:00:00.000Z',
    ...overrides,
  }
}

function row(rows: ReturnType<typeof collectDiagnostics>, id: string) {
  const found = rows.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`no diagnostic row with id "${id}"`)
  return found
}

describe('collectDiagnostics', () => {
  it('gives every row a unique id so the screen can key them', () => {
    const ids = collectDiagnostics(sources()).map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('reports no failures on a phone in the supported state', () => {
    const bad = collectDiagnostics(sources()).filter((r) => r.status === 'bad')
    expect(bad).toEqual([])
  })

  it('names the version and the build', () => {
    const rows = collectDiagnostics(sources())
    expect(row(rows, 'version').value).toBe('0.1.0')
    expect(row(rows, 'build').value).toBe('2026-10-17T12:00:00.000Z')
    expect(row(rows, 'platform').value).toBe('Android')
  })

  it('says the app is running as an installed app', () => {
    expect(row(collectDiagnostics(sources()), 'standalone').value).toBe('installed app')
    expect(row(collectDiagnostics(sources({ standalone: false })), 'standalone').value).toBe(
      'browser tab',
    )
  })

  it('warns rather than fails on iOS, which can load the app but is not supported', () => {
    const rows = collectDiagnostics(sources({ userAgent: IPHONE_SAFARI }))
    const platform = row(rows, 'platform')
    expect(platform.value).toBe('iOS')
    expect(platform.status).toBe('warn')
    expect(rows.filter((r) => r.status === 'bad')).toEqual([])
  })

  it('fails hard when the browser cannot install or store anything', () => {
    const rows = collectDiagnostics(
      sources({
        serviceWorkerSupported: false,
        serviceWorkerState: 'unsupported',
        indexedDbSupported: false,
        cacheStorageSupported: false,
      }),
    )
    expect(row(rows, 'installable').status).toBe('bad')
    expect(row(rows, 'service-worker').status).toBe('bad')
    expect(row(rows, 'indexeddb').status).toBe('bad')
    expect(row(rows, 'cache-storage').status).toBe('bad')
  })

  it('describes each service worker state in words a person can act on', () => {
    const labels = {
      unsupported: 'not supported',
      none: 'not installed',
      installing: 'installing',
      active: 'active',
      controlling: 'controlling this page',
      waiting: 'waiting to take over',
      error: 'failed to register',
    } as const
    for (const [state, label] of Object.entries(labels)) {
      const rows = collectDiagnostics(sources({ serviceWorkerState: state as never }))
      expect(row(rows, 'service-worker').value).toBe(label)
    }
  })

  it('shows the Session stub flag so the update guard can be checked on a phone', () => {
    expect(row(collectDiagnostics(sources()), 'session').value).toBe('closed')
    expect(row(collectDiagnostics(sources({ sessionOpen: true })), 'session').value).toBe('open')
    expect(row(collectDiagnostics(sources({ sessionOpen: true, trackActive: true })), 'session').value).toBe(
      'open, tracking',
    )
  })

  it('reports the network state without judging it', () => {
    expect(row(collectDiagnostics(sources({ online: false })), 'network').value).toBe('offline')
    expect(row(collectDiagnostics(sources({ online: false })), 'network').status).toBe('info')
  })
})

describe('persistenceRow', () => {
  it('is green when the browser has granted persistent storage', () => {
    expect(persistenceRow(true)).toEqual({
      id: 'persistence',
      label: 'Persistent storage',
      value: 'granted',
      status: 'ok',
    })
  })

  it('warns when it has not been granted yet', () => {
    const r = persistenceRow(false)
    expect(r.status).toBe('warn')
    expect(r.value).toBe('not granted')
  })

  it('fails when the browser cannot even answer, because eviction is then likely', () => {
    const r = persistenceRow(null)
    expect(r.status).toBe('bad')
    expect(r.value).toBe('cannot tell')
  })
})

describe('storageRow', () => {
  it('formats usage against quota', () => {
    const r = storageRow({ usage: 4_200_000, quota: 120_000_000_000 })
    expect(r.value).toBe('4.01 MB used of 112 GB')
    expect(r.status).toBe('info')
  })

  it('says unknown when the browser gives no estimate', () => {
    expect(storageRow(null).value).toBe('unknown')
  })
})

describe('geolocationRow', () => {
  it('fails when there is no geolocation at all', () => {
    expect(geolocationRow(false, 'granted')).toEqual({
      id: 'geolocation',
      label: 'Geolocation',
      value: 'missing',
      status: 'bad',
    })
  })

  it('is green once permission is granted', () => {
    expect(geolocationRow(true, 'granted').status).toBe('ok')
  })

  it('fails with a way to fix it when permission is denied', () => {
    const r = geolocationRow(true, 'denied')
    expect(r.value).toBe('blocked')
    expect(r.status).toBe('bad')
    expect(r.note).toMatch('site settings')
  })

  it('warns while the question has not been asked', () => {
    expect(geolocationRow(true, 'prompt').status).toBe('warn')
    expect(geolocationRow(true, null).status).toBe('warn')
  })
})

describe('shouldRecheckServiceWorker', () => {
  it('re-reads once when a first install has not registered yet', () => {
    expect(shouldRecheckServiceWorker(sources({ serviceWorkerState: 'none' }))).toBe(true)
  })

  it('leaves the answer alone once the worker has settled', () => {
    for (const state of ['active', 'controlling', 'waiting', 'installing'] as const) {
      expect(shouldRecheckServiceWorker(sources({ serviceWorkerState: state }))).toBe(false)
    }
  })

  it('does not wait on a registration that can never arrive', () => {
    expect(
      shouldRecheckServiceWorker(sources({ serviceWorkerSupported: false, serviceWorkerState: 'none' })),
    ).toBe(false)
    expect(shouldRecheckServiceWorker(sources({ serviceWorkerState: 'error' }))).toBe(false)
  })
})
