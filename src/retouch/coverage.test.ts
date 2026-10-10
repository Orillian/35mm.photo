import { describe, expect, it } from 'vitest'
import { blurCoverage } from './coverage'
import type { RetouchStroke } from '../editor/edit-stack/types'

const stroke = (over: Partial<RetouchStroke> = {}): RetouchStroke => ({
  id: 'a',
  enabled: true,
  mode: 'blur',
  points: [0.5, 0.5],
  size: 0.1,
  feather: 0,
  dx: 0,
  dy: 0,
  strength: 100,
  ...over,
})

/** The byte the map would store for a fraction — clamped arrays round half to even. */
const byte = (fraction: number) => new Uint8ClampedArray([fraction * 255])[0]

const at = (map: { data: Uint8ClampedArray; width: number }, u: number, v: number) =>
  map.data[Math.floor(v * (map.data.length / map.width)) * map.width + Math.floor(u * map.width)]

describe('blurCoverage', () => {
  it('is nothing when no blur stroke is on', () => {
    expect(blurCoverage([], 1.5)).toBeNull()
    expect(blurCoverage([stroke({ mode: 'heal' }), stroke({ enabled: false })], 1.5)).toBeNull()
    expect(blurCoverage([stroke({ strength: 0 })], 1.5)).toBeNull()
  })

  it('follows the picture’s aspect, long edge first', () => {
    expect(blurCoverage([stroke()], 2, 200)).toMatchObject({ width: 200, height: 100 })
    expect(blurCoverage([stroke()], 0.5, 200)).toMatchObject({ width: 100, height: 200 })
    expect(blurCoverage([stroke()], Number.NaN, 200)).toMatchObject({ width: 200, height: 200 })
  })

  it('covers the brush at its strength and nothing outside it', () => {
    const map = blurCoverage([stroke({ strength: 60 })], 1, 200)!
    expect(at(map, 0.5, 0.5)).toBe(byte(0.6))
    expect(at(map, 0.05, 0.05)).toBe(0)
    expect(at(map, 0.95, 0.5)).toBe(0)
  })

  it('keeps a round brush round on a wide frame', () => {
    const map = blurCoverage([stroke({ size: 0.1 })], 2, 400)! // 400 × 200
    // Radius is a tenth of the shorter edge: 20 px either way.
    expect(at(map, 0.5 + 15 / 400, 0.5)).toBeGreaterThan(0)
    expect(at(map, 0.5 + 25 / 400, 0.5)).toBe(0)
    expect(at(map, 0.5, 0.5 + 15 / 200)).toBeGreaterThan(0)
    expect(at(map, 0.5, 0.5 + 25 / 200)).toBe(0)
  })

  it('takes the stronger stroke where two overlap, not the sum', () => {
    const map = blurCoverage([stroke({ strength: 40 }), stroke({ id: 'b', strength: 70 })], 1, 200)!
    expect(at(map, 0.5, 0.5)).toBe(byte(0.7))
  })

  it('a stroke saved without a strength gets the default', () => {
    const { strength: _none, ...bare } = stroke()
    const map = blurCoverage([bare as RetouchStroke], 1, 200)!
    expect(at(map, 0.5, 0.5)).toBe(byte(0.5))
  })
})
