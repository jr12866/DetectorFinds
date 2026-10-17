import { describe, expect, it } from 'vitest'

import { hrefFor, matchFirst, matchRoute, pathFromHash } from './hashRouter'

describe('pathFromHash', () => {
  it('turns the raw hash into a path', () => {
    expect(pathFromHash('#/map')).toBe('/map')
    expect(pathFromHash('/map')).toBe('/map')
  })

  it('keeps the root as a slash', () => {
    expect(pathFromHash('')).toBe('/')
    expect(pathFromHash('#')).toBe('/')
    expect(pathFromHash('#/')).toBe('/')
  })

  it('adds the leading slash when it is missing', () => {
    expect(pathFromHash('#finds')).toBe('/finds')
  })

  it('drops the query and the trailing slash', () => {
    expect(pathFromHash('#/finds/7?edit=1')).toBe('/finds/7')
    expect(pathFromHash('#/sites/7/')).toBe('/sites/7')
  })

  it('keeps nested paths', () => {
    expect(pathFromHash('#/settings/diagnostics')).toBe('/settings/diagnostics')
  })
})

describe('hrefFor', () => {
  it('is the form used in an href', () => {
    expect(hrefFor('/map')).toBe('#/map')
  })

  it('round-trips through pathFromHash', () => {
    for (const path of ['/', '/map', '/finds/abc-123', '/settings/diagnostics']) {
      expect(pathFromHash(hrefFor(path))).toBe(path)
    }
  })
})

describe('matchRoute', () => {
  it('matches a literal path with no params', () => {
    expect(matchRoute('/map', '/map')).toEqual({})
  })

  it('captures a named param', () => {
    expect(matchRoute('/finds/:id', '/finds/0198c3f2-7')).toEqual({ id: '0198c3f2-7' })
  })

  it('captures several params', () => {
    expect(matchRoute('/sites/:siteId/finds/:findId', '/sites/9/finds/4')).toEqual({
      siteId: '9',
      findId: '4',
    })
  })

  it('rejects a different literal segment', () => {
    expect(matchRoute('/finds', '/sites')).toBeNull()
  })

  it('rejects a path that is longer or shorter than the pattern', () => {
    expect(matchRoute('/finds', '/finds/0198c3f2-7')).toBeNull()
    expect(matchRoute('/finds/:id', '/finds')).toBeNull()
    expect(matchRoute('/finds/:id', '/finds/a/b')).toBeNull()
  })

  it('lets a trailing star swallow the rest of the path', () => {
    expect(matchRoute('/settings/*', '/settings/diagnostics/deep')).toEqual({})
    expect(matchRoute('/sites/:siteId/*', '/sites/9/photos/3')).toEqual({ siteId: '9' })
  })

  it('decodes a percent-encoded param and survives a bad escape', () => {
    expect(matchRoute('/sites/:name', '/sites/old%20mill')).toEqual({ name: 'old mill' })
    expect(matchRoute('/sites/:name', '/sites/100%')).toEqual({ name: '100%' })
  })
})

describe('matchFirst', () => {
  const patterns = ['/settings/diagnostics', '/settings', '/finds/:id', '/finds']

  it('returns the first pattern that matches, with its params', () => {
    expect(matchFirst(patterns, '/settings/diagnostics')).toEqual({
      path: '/settings/diagnostics',
      params: {},
    })
    expect(matchFirst(patterns, '/finds/7')).toEqual({ path: '/finds/:id', params: { id: '7' } })
  })

  it('returns null when nothing matches', () => {
    expect(matchFirst(patterns, '/nowhere')).toBeNull()
  })
})
