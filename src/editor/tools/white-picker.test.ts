import { describe, expect, it } from 'vitest'
import { averageLinear, neutralise, sampleWindow, srgbToLinear } from './white-picker'
import { whiteBalanceGain } from '../gpu/whitebalance'
import { NEUTRAL_TEMPERATURE } from '../edit-stack/defaults'

/** A grey patch as the camera would have recorded it under a light of (T, tint): the gain undone. */
function castGrey(level: number, temperature: number, tint: number): [number, number, number] {
  const [gr, gg, gb] = whiteBalanceGain(temperature, tint)
  return [level / gr, level / gg, level / gb]
}

describe('neutralise', () => {
  it('leaves a neutral grey at the neutral point', () => {
    expect(neutralise([0.3, 0.3, 0.3])).toEqual({ temperature: NEUTRAL_TEMPERATURE, tint: 0 })
  })

  it.each([
    [3200, 0],
    [7500, 0],
    [5500, 30],
    [4000, -25],
    [9000, 15],
  ])('recovers the light a grey was cast by: %i K, tint %i', (temperature, tint) => {
    const found = neutralise(castGrey(0.4, temperature, tint))
    expect(found).not.toHaveProperty('problem')
    const { temperature: t, tint: n } = found as { temperature: number; tint: number }
    expect(Math.abs(t - temperature)).toBeLessThanOrEqual(20)
    expect(Math.abs(n - tint)).toBeLessThanOrEqual(1)
  })

  it('actually makes the sample grey under what it finds', () => {
    const sample = castGrey(0.25, 3600, -12)
    const { temperature, tint } = neutralise(sample) as { temperature: number; tint: number }
    const [gr, gg, gb] = whiteBalanceGain(temperature, tint)
    const [r, g, b] = [sample[0] * gr, sample[1] * gg, sample[2] * gb]
    expect(r / g).toBeCloseTo(1, 2)
    expect(b / g).toBeCloseTo(1, 2)
  })

  it('refuses a patch too dark to read, or one that has clipped', () => {
    expect(neutralise([0.001, 0.001, 0.001])).toEqual({ problem: 'dark' })
    expect(neutralise([0.3, 0, 0.3])).toEqual({ problem: 'dark' })
    expect(neutralise([1, 0.9, 0.8])).toEqual({ problem: 'clipped' })
  })

  it('stays inside the sliders’ range for a cast beyond it', () => {
    const found = neutralise([0.6, 0.3, 0.04])
    expect(found).not.toHaveProperty('problem')
    const { temperature, tint } = found as { temperature: number; tint: number }
    expect(temperature).toBeGreaterThanOrEqual(2000)
    expect(temperature).toBeLessThanOrEqual(12000)
    expect(Math.abs(tint)).toBeLessThanOrEqual(100)
  })
})

describe('sampleWindow', () => {
  it('centres on the pixel, and slides inside the picture at an edge', () => {
    expect(sampleWindow(50, 40, 100, 80, 3)).toEqual({ x0: 47, y0: 37, side: 7 })
    expect(sampleWindow(1, 1, 100, 80, 3)).toEqual({ x0: 0, y0: 0, side: 7 })
    expect(sampleWindow(99, 79, 100, 80, 3)).toEqual({ x0: 93, y0: 73, side: 7 })
  })

  it('never asks for more than the picture has', () => {
    expect(sampleWindow(2, 2, 5, 5, 3)).toEqual({ x0: 0, y0: 0, side: 5 })
  })
})

describe('reading the sample', () => {
  it('linearises before averaging', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])
    const [r] = averageLinear(rgba)
    expect(r).toBeCloseTo(0.5, 6)
    expect(srgbToLinear(128)).toBeCloseTo(0.2158, 3)
  })

  it('is black for nothing', () => {
    expect(averageLinear(new Uint8ClampedArray(0))).toEqual([0, 0, 0])
  })
})
