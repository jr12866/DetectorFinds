import { describe, expect, it } from 'vitest'
import {
  MISS_COLOUR,
  PIN_COLOUR,
  PLACED_COLOUR,
  PIN_RADIUS_PX,
  SELECTED_COLOUR,
  SELECTED_EXTRA_PX,
  isMissCategory,
  pinColourForCategory,
  pinStyleFor,
} from './pinStyle'

/**
 * R-MAP-1: a recovery and a Miss have to be tellable apart on the
 * map, and a hand-placed Pin has to look different again. Those three
 * distinctions are the whole reason this file exists, so they are pinned here
 * rather than eyeballed on a phone.
 */
describe('pin colours', () => {
  it('a Find with no Category is a Miss', () => {
    expect(isMissCategory('')).toBe(true)
    expect(pinColourForCategory('')).toBe(MISS_COLOUR)
  })

  it('any Category at all reads as a recovery', () => {
    for (const category of ['coin', 'jewellery', 'military', 'unclassified']) {
      expect(isMissCategory(category)).toBe(false)
      expect(pinColourForCategory(category)).toBe(PIN_COLOUR)
    }
  })
})

describe('pinStyleFor', () => {
  it('a GPS recovery is a filled disc with a light ring', () => {
    const style = pinStyleFor({ categoryId: 'coin', placed: false, selected: false })
    expect(style.fillColor).toBe(PIN_COLOUR)
    expect(style.fillOpacity).toBe(1)
    expect(style.color).toBe('#ffffff')
    expect(style.radius).toBe(PIN_RADIUS_PX)
  })

  it('a Miss is hollow: a faint fill and a coloured ring', () => {
    const style = pinStyleFor({ categoryId: '', placed: false, selected: false })
    expect(style.color).toBe(MISS_COLOUR)
    expect(style.fillOpacity).toBeLessThan(0.5)
    expect(style.fillColor).toBe('#ffffff')
  })

  it('a hand-placed recovery takes the Placed Pin colour', () => {
    const style = pinStyleFor({ categoryId: 'coin', placed: true, selected: false })
    expect(style.fillColor).toBe(PLACED_COLOUR)
    expect(style.color).toBe('#ffffff')
  })

  it('a hand-placed Miss keeps the hollow shape but shows it was placed', () => {
    const style = pinStyleFor({ categoryId: '', placed: true, selected: false })
    expect(style.fillOpacity).toBeLessThan(0.5)
    expect(style.color).toBe(PLACED_COLOUR)
  })

  it('no Miss is ever painted with the recovery colour', () => {
    for (const placed of [false, true]) {
      for (const selected of [false, true]) {
        const style = pinStyleFor({ categoryId: '', placed, selected })
        expect(style.fillColor).not.toBe(PIN_COLOUR)
      }
    }
  })

  it('selecting a Pin makes it bigger rather than changing what it means', () => {
    const plain = pinStyleFor({ categoryId: 'coin', placed: false, selected: false })
    const selected = pinStyleFor({ categoryId: 'coin', placed: false, selected: true })
    expect(selected.radius).toBe(plain.radius + SELECTED_EXTRA_PX)
    expect(selected.color).toBe(SELECTED_COLOUR)
    expect(selected.fillColor).toBe(PIN_COLOUR)
  })

  it('a selected Miss does not turn into a recovery', () => {
    const selected = pinStyleFor({ categoryId: '', placed: false, selected: true })
    expect(selected.fillColor).toBe('#ffffff')
    expect(selected.fillColor).not.toBe(PIN_COLOUR)
    expect(selected.radius).toBe(PIN_RADIUS_PX + SELECTED_EXTRA_PX)
  })

  it('every style is a usable canvas paint set', () => {
    for (const categoryId of ['', 'coin']) {
      for (const placed of [false, true]) {
        for (const selected of [false, true]) {
          const style = pinStyleFor({ categoryId, placed, selected })
          expect(style.radius).toBeGreaterThan(0)
          expect(style.weight).toBeGreaterThan(0)
          expect(style.fillOpacity).toBeGreaterThanOrEqual(0)
          expect(style.fillOpacity).toBeLessThanOrEqual(1)
          expect(style.opacity).toBeGreaterThan(0)
          expect(style.color).toMatch(/^#[0-9a-f]{6}$/)
          expect(style.fillColor).toMatch(/^#[0-9a-f]{6}$/)
        }
      }
    }
  })
})
