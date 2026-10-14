import { describe, expect, it } from 'vitest'
import { imageStats, toHistogram } from './stats'
import { picture, ripple } from './fixtures'

describe('imageStats', () => {
  it('reads a grey field as grey, mid, flat and neutral', () => {
    const p = picture(64, 48, (x, y) => {
      const v = 118 + ripple(x, y)
      return [v, v, v]
    })
    const s = imageStats(p.rgba, p.width, p.height)
    expect(s.median).toBeCloseTo(118 / 255, 1)
    expect(s.saturation).toBeLessThan(0.02)
    expect(Math.abs(s.warmth)).toBeLessThan(0.01)
    expect(s.p98 - s.p02).toBeLessThan(0.15)
    expect(s.skin).toBe(0)
    expect(s.clippedShadows).toBe(0)
    expect(s.clippedHighlights).toBe(0)
  })

  it('calls a warm cast warm, in linear means', () => {
    const p = picture(32, 32, () => [180, 140, 90])
    const s = imageStats(p.rgba, p.width, p.height)
    expect(s.warmth).toBeGreaterThan(0.2)
    expect(s.meanLinear[0]).toBeGreaterThan(s.meanLinear[2])
  })

  it('sees an orange sky over a dark ground as a sunset shape', () => {
    const p = picture(40, 40, (_x, y) => (y < 0.5 ? [230, 120, 40] : [40, 35, 30]))
    const s = imageStats(p.rgba, p.width, p.height)
    expect(s.orangeTop).toBeGreaterThan(0.9)
    expect(s.orangeBottom).toBe(0)
    expect(s.skyTop).toBe(0)
  })

  it('sees blue over green as sky', () => {
    const p = picture(40, 40, (_x, y) => (y < 0.5 ? [150, 190, 235] : [60, 110, 50]))
    const s = imageStats(p.rgba, p.width, p.height)
    expect(s.skyTop).toBeGreaterThan(0.9)
    expect(s.orangeTop).toBe(0)
  })

  it('counts skin and vivid colour', () => {
    const skin = picture(20, 20, () => [205, 150, 120])
    expect(imageStats(skin.rgba, 20, 20).skin).toBeGreaterThan(0.9)
    const vivid = picture(20, 20, () => [240, 30, 30])
    const s = imageStats(vivid.rgba, 20, 20)
    expect(s.vivid).toBeGreaterThan(0.9)
    expect(s.saturation).toBeGreaterThan(0.8)
  })

  it('counts the dark and the clipped, and the points of light in a night frame', () => {
    const p = picture(50, 50, (x, y) => (x > 0.9 && y > 0.9 ? [255, 255, 255] : [8, 8, 12]))
    const s = imageStats(p.rgba, p.width, p.height)
    expect(s.dark).toBeGreaterThan(0.95)
    expect(s.brightPoints).toBeGreaterThan(0.005)
    expect(s.clippedHighlights).toBeGreaterThan(0)
    expect(s.median).toBeLessThan(0.06)
  })

  it('measures the halves, and the subject when given one', () => {
    const p = picture(40, 40, (_x, y) => (y < 0.5 ? [200, 200, 200] : [40, 40, 40]))
    const s = imageStats(p.rgba, p.width, p.height)
    expect(s.topLuma).toBeGreaterThan(s.bottomLuma * 3)
    expect(s.subject).toBeNull()
    const map = new Uint8ClampedArray(4 * 4).fill(0)
    map[0] = 255 // the top-left sixteenth
    const t = imageStats(p.rgba, p.width, p.height, { data: map, size: 4 })
    expect(t.subject?.area).toBeCloseTo(1 / 16, 2)
  })

  it('hands the Auto button a histogram it can read', () => {
    const p = picture(16, 16, () => [100, 100, 100])
    const h = toHistogram(imageStats(p.rgba, 16, 16))
    expect(h.luma[100]).toBe(256)
    expect(h.clippedShadows).toBe(0)
  })
})
