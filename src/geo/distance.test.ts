import { describe, expect, it } from 'vitest'
import { boundsOf, distanceM, scatterM } from './distance'

describe('distanceM', () => {
  it('is zero from a point to itself', () => {
    expect(distanceM({ lat: 39, lon: -99 }, { lat: 39, lon: -99 })).toBe(0)
  })

  it('is symmetric', () => {
    const a = { lat: 51.2, lon: -1.4 }
    const b = { lat: 51.25, lon: -1.31 }
    expect(distanceM(a, b)).toBeCloseTo(distanceM(b, a), 6)
  })

  it('a degree of latitude is about 111.2 km wherever you are', () => {
    const atEquator = distanceM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })
    const atFifty = distanceM({ lat: 50, lon: 0 }, { lat: 51, lon: 0 })
    expect(atEquator).toBeCloseTo(111_195, -2)
    expect(atFifty).toBeCloseTo(111_195, -2)
  })

  it('a degree of longitude shrinks as you go north, which is what makes the cos term necessary', () => {
    const atEquator = distanceM({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })
    const atSixty = distanceM({ lat: 60, lon: 0 }, { lat: 60, lon: 1 })
    expect(atEquator).toBeGreaterThan(111_000)
    expect(atEquator).toBeLessThan(112_000)
    expect(atSixty).toBeCloseTo(atEquator / 2, -3)
  })

  it('is accurate enough for a field: within 0.2% of a spherical great-circle solve', () => {
    const a = { lat: 51.0, lon: -1.0 }
    const b = { lat: 51.009, lon: -1.007 }
    const phi1 = (a.lat * Math.PI) / 180
    const phi2 = (b.lat * Math.PI) / 180
    const dPhi = phi2 - phi1
    const dLambda = ((b.lon - a.lon) * Math.PI) / 180
    const haversine = 2 * 6_371_000 * Math.asin(
      Math.sqrt(Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2),
    )
    const ours = distanceM(a, b)
    expect(Math.abs(ours - haversine) / haversine).toBeLessThan(0.002)
    expect(ours).toBeGreaterThan(1_050)
    expect(ours).toBeLessThan(1_180)
  })
})

describe('scatterM (R-GPS-3)', () => {
  const centre = { lat: 51, lon: -1 }

  it('has no scatter to report for one reading', () => {
    expect(scatterM([centre], centre)).toBeNull()
    expect(scatterM([], centre)).toBeNull()
  })

  it('has no scatter to report without a mean to measure from', () => {
    expect(scatterM([centre, { lat: 51.001, lon: -1 }], null)).toBeNull()
  })

  it('is zero when every reading is the same place', () => {
    expect(scatterM([centre, centre, centre], centre)).toBeCloseTo(0, 6)
  })

  it('is the root-mean-square distance from the mean', () => {
    const points = [{ lat: 51.0001, lon: -1 }, { lat: 50.9999, lon: -1 }]
    const mean = { lat: 51, lon: -1 }
    const each = distanceM(points[0], mean)
    expect(scatterM(points, mean)).toBeCloseTo(each, 6)
  })

  it('grows when the dot wanders further', () => {
    const tight = scatterM([{ lat: 51.00002, lon: -1 }, { lat: 50.99998, lon: -1 }], centre)
    const loose = scatterM([{ lat: 51.0002, lon: -1 }, { lat: 50.9998, lon: -1 }], centre)
    expect(tight).not.toBeNull()
    expect(loose).not.toBeNull()
    expect(loose as number).toBeGreaterThan((tight as number) * 5)
  })
})

describe('boundsOf', () => {
  it('is null with nothing to cover', () => {
    expect(boundsOf([])).toBeNull()
  })

  it('covers every point it is given', () => {
    const points = [
      { lat: 51.0, lon: -1.0 },
      { lat: 51.01, lon: -1.02 },
      { lat: 50.99, lon: -0.98 },
    ]
    const box = boundsOf(points)
    expect(box).not.toBeNull()
    for (const point of points) {
      expect(box!.south).toBeLessThanOrEqual(point.lat)
      expect(box!.north).toBeGreaterThanOrEqual(point.lat)
      expect(box!.west).toBeLessThanOrEqual(point.lon)
      expect(box!.east).toBeGreaterThanOrEqual(point.lon)
    }
  })

  it('a single point is a degenerate box', () => {
    expect(boundsOf([{ lat: 51, lon: -1 }])).toEqual({ south: 51, west: -1, north: 51, east: -1 })
  })

  it('padding makes the box bigger by roughly the padding asked for', () => {
    const points = [{ lat: 51, lon: -1 }, { lat: 51.001, lon: -1 }]
    const tight = boundsOf(points)!
    const padded = boundsOf(points, 100)!
    expect(padded.south).toBeLessThan(tight.south)
    expect(padded.north).toBeGreaterThan(tight.north)
    expect(distanceM({ lat: tight.south, lon: -1 }, { lat: padded.south, lon: -1 })).toBeCloseTo(100, -1)
  })

  it('ignores a position the device never reported', () => {
    // lat/lon of 0/0 is the sentinel for "no position", not a point in the sea.
    const box = boundsOf([{ lat: 51, lon: -1 }, { lat: Number.NaN, lon: Number.NaN }])!
    expect(box.south).toBe(51)
    expect(box.north).toBe(51)
  })

  it('never runs off the poles or the antimeridian', () => {
    const box = boundsOf([{ lat: 89.9, lon: 179.9 }], 100_000)!
    expect(box.north).toBeLessThanOrEqual(90)
    expect(box.east).toBeLessThanOrEqual(180)
  })
})
