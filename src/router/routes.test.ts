import { describe, expect, it } from 'vitest'

import { activeNavPath, matchAppRoute, NAV_ITEMS, ROUTE_PATTERNS } from './routes'

describe('route table', () => {
  it('has a tab for each of the five destinations the shell ships', () => {
    expect(NAV_ITEMS.map((item) => item.path)).toEqual([
      '/map',
      '/finds',
      '/sessions',
      '/sites',
      '/settings',
    ])
  })

  it('gives every tab a label and an icon', () => {
    for (const item of NAV_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.icon).toMatch(/^M/)
    }
  })

  it('tries every nav destination before its catch-all sibling', () => {
    // A more specific pattern placed after a looser one would never be reached.
    for (const item of NAV_ITEMS.filter((nav) => nav.path !== '/map')) {
      const navIndex = ROUTE_PATTERNS.indexOf(item.path)
      const detail = ROUTE_PATTERNS.findIndex((pattern) => pattern.startsWith(`${item.path}/`))
      if (detail >= 0) expect(detail).toBeLessThan(navIndex)
    }
  })
})

describe('matchAppRoute', () => {
  it('routes the shell screens', () => {
    expect(matchAppRoute('/')).toEqual({ path: '/', params: {} })
    expect(matchAppRoute('/map')).toEqual({ path: '/map', params: {} })
    expect(matchAppRoute('/finds')).toEqual({ path: '/finds', params: {} })
    expect(matchAppRoute('/sessions')).toEqual({ path: '/sessions', params: {} })
    expect(matchAppRoute('/sites')).toEqual({ path: '/sites', params: {} })
    expect(matchAppRoute('/settings')).toEqual({ path: '/settings', params: {} })
  })

  it('prefers the diagnostics screen over plain settings', () => {
    expect(matchAppRoute('/settings/diagnostics')?.path).toBe('/settings/diagnostics')
  })

  it('carries a detail id through a deep link', () => {
    expect(matchAppRoute('/finds/0198c3f2-0000-7000-8000-000000000000')).toEqual({
      path: '/finds/:id',
      params: { id: '0198c3f2-0000-7000-8000-000000000000' },
    })
    expect(matchAppRoute('/sessions/7')).toEqual({ path: '/sessions/:id', params: { id: '7' } })
    expect(matchAppRoute('/sites/7')).toEqual({ path: '/sites/:id', params: { id: '7' } })
  })

  it('reports nothing for an unknown path so the shell can show a not-found screen', () => {
    expect(matchAppRoute('/nope')).toBeNull()
    expect(matchAppRoute('/settings/diagnostics/extra')).toBeNull()
  })
})

describe('activeNavPath', () => {
  it('presses the Map tab for the start screen', () => {
    expect(activeNavPath('/')).toBe('/map')
    expect(activeNavPath('/map')).toBe('/map')
  })

  it('presses the owning tab for a detail screen', () => {
    expect(activeNavPath('/finds/7')).toBe('/finds')
    expect(activeNavPath('/sessions/7')).toBe('/sessions')
    expect(activeNavPath('/sites/7')).toBe('/sites')
    expect(activeNavPath('/settings/diagnostics')).toBe('/settings')
  })

  it('presses nothing for an unknown path', () => {
    expect(activeNavPath('/nowhere')).toBe('')
  })
})
