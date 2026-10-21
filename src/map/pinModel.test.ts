import { describe, expect, it } from 'vitest'
import type { Find } from '../db/types'
import { isPlottableFind, pinDescriptors, pinFor, unplottableCount } from './pinModel'

function find(part: Partial<Find> = {}): Find {
  return {
    id: 'find-1',
    foundAt: 1,
    siteId: '',
    sessionId: '',
    lat: 51,
    lon: -1,
    altitudeM: 0,
    accuracyM: 0,
    positionSource: 'gps',
    note: '',
    categoryId: 'coin',
    itemCount: 1,
    photoCount: 0,
    needsDetail: 0,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: 0,
    cascadeDeletedFrom: '',
    ...part,
  }
}

describe('pinFor', () => {
  it('carries the four things a canvas circle needs, and nothing else', () => {
    expect(pinFor(find({ categoryId: '', positionSource: 'hand' }), false)).toEqual({
      id: 'find-1',
      lat: 51,
      lon: -1,
      categoryId: '',
      placed: true,
      selected: false,
    })
  })

  it('a hand position is a Placed Pin and a gps position is not', () => {
    expect(pinFor(find({ positionSource: 'hand' }), false).placed).toBe(true)
    for (const source of ['gps', 'photo'] as const) {
      expect(pinFor(find({ positionSource: source }), false).placed).toBe(false)
    }
  })

  it('only the selected Find comes back selected', () => {
    expect(pinFor(find(), true).selected).toBe(true)
  })
})

describe('pinDescriptors', () => {
  it('draws one Pin per Find that has a position', () => {
    const pins = pinDescriptors([find({ id: 'a' }), find({ id: 'b' })])
    expect(pins.map((pin) => pin.id)).toEqual(['a', 'b'])
  })

  it('draws nothing for the no-position sentinel', () => {
    // 0/0 is "this record has no position", not a point in the sea off Ghana.
    expect(pinDescriptors([find({ lat: 0, lon: 0 })])).toEqual([])
  })

  it('draws nothing for a coordinate that is not a number', () => {
    expect(pinDescriptors([find({ lat: Number.NaN, lon: -1 })])).toEqual([])
    expect(pinDescriptors([find({ lat: 51, lon: Number.NaN })])).toEqual([])
  })

  it('a position on the equator or the meridian is still a position', () => {
    expect(pinDescriptors([find({ lat: 0, lon: -1 })]).length).toBe(1)
    expect(pinDescriptors([find({ lat: 51, lon: 0 })]).length).toBe(1)
  })

  it('marks exactly one Pin selected', () => {
    const pins = pinDescriptors([find({ id: 'a' }), find({ id: 'b' })], 'b')
    expect(pins.map((pin) => pin.selected)).toEqual([false, true])
  })

  it('a selected id that is not in the list changes nothing', () => {
    const pins = pinDescriptors([find({ id: 'a' })], 'gone-away')
    expect(pins.map((pin) => pin.selected)).toEqual([false])
  })

  it('keeps the order it was given, because the caller already sorted the list', () => {
    const pins = pinDescriptors([find({ id: 'newest' }), find({ id: 'oldest' })])
    expect(pins.map((pin) => pin.id)).toEqual(['newest', 'oldest'])
  })

  it('counts what it left out, so the screen can say so rather than looking short', () => {
    const finds = [find({ id: 'ok' }), find({ lat: 0, lon: 0 }), find({ lat: Number.NaN, lon: 0 })]
    expect(pinDescriptors(finds).length).toBe(1)
    expect(unplottableCount(finds)).toBe(2)
    expect(isPlottableFind({ lat: 0, lon: 0 })).toBe(false)
  })
})
