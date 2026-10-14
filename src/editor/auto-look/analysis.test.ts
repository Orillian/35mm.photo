import { describe, expect, it } from 'vitest'
import { uprightMap } from './analysis'

describe('uprightMap', () => {
  // A 4 × 4 map with one lit cell at stored (x 3, y 0): top-right as stored.
  const stored = new Uint8ClampedArray(16)
  stored[3] = 255
  const lit = (data: Uint8ClampedArray) => [...data].findIndex((v) => v === 255)

  it('copies an upright photo’s map untouched', () => {
    const out = uprightMap({ data: stored, size: 4 }, 1)
    expect(lit(out.data)).toBe(3)
    expect(out.data).not.toBe(stored)
  })

  it('turns the map with the photo', () => {
    // Orientation 6 is a quarter turn clockwise to show upright: the stored
    // top-right ends up bottom-right.
    const out = uprightMap({ data: stored, size: 4 }, 6)
    expect(lit(out.data)).toBe(15)
    // And 8, the other way: top-left.
    expect(lit(uprightMap({ data: stored, size: 4 }, 8).data)).toBe(0)
  })
})
