import { describe, expect, it } from 'vitest'
import { buildAutoLook } from './rules'
import { imageStats } from './stats'
import { picture, ripple } from './fixtures'
import { NEUTRAL_TEMPERATURE } from '../edit-stack/defaults'
import { neutralise } from '../tools/white-picker'
import type { SceneGuess } from './scene'

const stats = (p: ReturnType<typeof picture>) => imageStats(p.rgba, p.width, p.height)
const guess = (scene: SceneGuess['scene'], confidence = 0.8): SceneGuess => ({ scene, confidence, source: 'stats' })

/** Dark, flat, warm-cast and muted: the photo every rule has something to say about. */
const dim = () => stats(picture(64, 48, (x, y) => {
  const v = 52 + ripple(x, y, 6)
  return [v + 14, v + 4, v - 10]
}))

describe('buildAutoLook', () => {
  it('lifts, warms back toward neutral at part strength, and adds colour to a dim flat cast', () => {
    const look = buildAutoLook(dim(), null)
    expect(look.kind).toBe('look')
    expect(look.edits.exposure).toBeGreaterThan(0.5)
    // Gray-world would pull the temperature well below neutral; part of the way, not all of it.
    const full = neutralise(dim().meanLinear) as { temperature: number }
    expect(full.temperature).toBeLessThan(NEUTRAL_TEMPERATURE)
    expect(look.edits.temperature).toBeLessThan(NEUTRAL_TEMPERATURE)
    expect(look.edits.temperature).toBeGreaterThan(full.temperature)
    // A dark cast is saturated in HSV terms, so no vibrance here — see the next case.
    expect(look.edits.vibrance).toBeUndefined()
    expect(look.lookId).not.toBeNull()
    expect(look.name).toMatch(/^\w+( \w+)* \w+$/)
  })

  it('lifts the colour of a flat, faintly coloured frame — and only then', () => {
    const faint = stats(picture(48, 48, (x, y) => {
      const v = 110 + ripple(x, y, 10)
      return [v + 12, v + 6, v]
    }))
    const look = buildAutoLook(faint, null)
    expect(faint.saturation).toBeGreaterThan(0.04)
    expect(faint.saturation).toBeLessThan(0.2)
    expect(look.edits.vibrance).toBeGreaterThanOrEqual(8)
    expect(look.edits.vibrance).toBeLessThanOrEqual(35)
  })

  it('leaves a sunset its warmth and does not brighten it much', () => {
    const s = stats(picture(40, 40, (_x, y) => (y < 0.5 ? [230, 130, 40] : [50, 40, 35])))
    const look = buildAutoLook(s, guess('sunset'))
    expect(look.edits.temperature).toBeUndefined()
    expect(look.edits.tint).toBeUndefined()
    expect(look.edits.exposure ?? 0).toBeLessThanOrEqual(0.5)
    expect(look.lookId).toBe('gold')
    expect(look.name).toMatch(/^Golden Hour/)
  })

  it('keeps night dark: no exposure, a little shadow, grainy negative look', () => {
    const s = stats(picture(50, 50, (x, y) => (x > 0.9 && y > 0.9 ? [255, 250, 220] : [10, 10, 14])))
    const look = buildAutoLook(s, guess('night'))
    expect(look.edits.exposure).toBeUndefined()
    expect(look.edits.shadows ?? 0).toBeGreaterThan(0)
    expect(look.edits.shadows ?? 0).toBeLessThanOrEqual(20)
    expect(look.lookId).toBe('retro-neg')
    expect(look.name).toMatch(/^Night/)
  })

  it('aims snow brighter than middle grey', () => {
    const s = stats(picture(40, 40, (x, y) => {
      const v = 150 + ripple(x, y, 8)
      return [v, v, v + 6]
    }))
    const plain = buildAutoLook(s, null)
    const snow = buildAutoLook(s, guess('snow'))
    expect(snow.edits.exposure ?? 0).toBeGreaterThan(plain.edits.exposure ?? 0)
    expect(snow.edits.exposure ?? 0).toBeGreaterThanOrEqual(0)
  })

  it('holds back on a portrait', () => {
    const look = buildAutoLook(dim(), guess('portrait'))
    expect(look.edits.vibrance ?? 0).toBeLessThanOrEqual(15)
    expect(look.edits.contrast ?? 0).toBeLessThanOrEqual(15)
    expect(look.lookId).toBe('portrait')
  })

  it('only suggests a look when the photo was fine already', () => {
    // Mid-grey on the target, with real highlights and shadows at either end and no colour.
    const s = stats(picture(64, 48, (x) => (x < 0.05 ? [12, 12, 12] : x > 0.95 ? [240, 240, 240] : [115, 115, 115])))
    const look = buildAutoLook(s, null)
    expect(look.kind).toBe('suggest')
    expect(look.edits).toEqual({})
    expect(look.name).toMatch(/^Try /)
  })

  it('picks a monochrome look for a contrasty colourless frame', () => {
    const s = stats(picture(40, 40, (x) => (x < 0.5 ? [12, 12, 12] : [242, 242, 242])))
    const look = buildAutoLook(s, null)
    expect(look.lookId).toBe('graphite')
    // And no vibrance: there is no colour to lift.
    expect(look.edits.vibrance).toBeUndefined()
  })

  it('never sets a value that rounds to nothing', () => {
    const look = buildAutoLook(dim(), null)
    for (const [k, v] of Object.entries(look.edits)) {
      if (typeof v === 'number') expect(k === 'temperature' ? v !== NEUTRAL_TEMPERATURE : v !== 0).toBe(true)
    }
  })
})
