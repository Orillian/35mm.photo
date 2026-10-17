import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOUR_VERSION, markTourSeen, tourSeen } from './preference'
import { RAW_FORMATS, SCENES, TOOLKIT, TOUR_STEPS, clampStep } from './steps'

const stored = new Map<string, string>()
const fakeStorage = {
  getItem: (k: string) => stored.get(k) ?? null,
  setItem: (k: string, v: string) => void stored.set(k, v),
}

afterEach(() => {
  stored.clear()
  delete (globalThis as { localStorage?: unknown }).localStorage
})

describe('remembering the tour', () => {
  it('is unseen in a fresh browser, and seen once marked', () => {
    Object.assign(globalThis, { localStorage: fakeStorage })
    expect(tourSeen()).toBe(false)
    markTourSeen()
    expect(stored.get('35mm.tour')).toBe(String(TOUR_VERSION))
    expect(tourSeen()).toBe(true)
  })

  it('comes back for a newer tour, but not an older one', () => {
    Object.assign(globalThis, { localStorage: fakeStorage })
    stored.set('35mm.tour', String(TOUR_VERSION - 1))
    expect(tourSeen()).toBe(false)
    stored.set('35mm.tour', String(TOUR_VERSION + 1))
    expect(tourSeen()).toBe(true)
  })

  it('treats anything it cannot read as unseen', () => {
    Object.assign(globalThis, { localStorage: fakeStorage })
    stored.set('35mm.tour', 'yes')
    expect(tourSeen()).toBe(false)
    stored.set('35mm.tour', '')
    expect(tourSeen()).toBe(false)
  })

  it('never shows where nothing can be remembered — it would come back every visit', () => {
    expect(tourSeen()).toBe(true)
    expect(() => markTourSeen()).not.toThrow()
    Object.assign(globalThis, {
      localStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
      },
    })
    expect(tourSeen()).toBe(true)
    expect(() => markTourSeen()).not.toThrow()
  })
})

describe('the chapters', () => {
  it('opens with the welcome and closes with the way in', () => {
    expect(TOUR_STEPS[0].id).toBe('welcome')
    expect(TOUR_STEPS.at(-1)?.id).toBe('start')
  })

  it('has one chapter per visual, each with something to say', () => {
    const ids = TOUR_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const step of TOUR_STEPS) {
      expect(step.kicker.trim()).not.toBe('')
      expect(step.title.trim()).not.toBe('')
      expect(step.body.length).toBeGreaterThan(40)
      expect(step.points.length > 0 || (step.keys?.length ?? 0) > 0 || step.id === 'raw').toBe(true)
    }
  })

  it('introduces every on-device model the app ships', () => {
    const models = TOUR_STEPS.flatMap((s) => (s.ai ? [s.ai.model] : []))
    expect(models.sort()).toEqual(['MI-GAN', 'MobileNetV2', 'Real-ESRGAN', 'U²-Netp'].sort())
    for (const step of TOUR_STEPS.filter((s) => s.ai)) {
      expect(step.ai!.size).toMatch(/^\d+(\.\d+)? MB$/)
      expect(step.ai!.runs).toMatch(/^on your (CPU|GPU)$/)
    }
  })

  it('only draws pictures that are actually shipped', () => {
    const dir = resolve(__dirname, '../../../public/tour')
    const named = new Set(TOUR_STEPS.flatMap((s) => s.images))
    expect(named.size).toBeGreaterThan(0)
    for (const name of named) expect(existsSync(resolve(dir, name)), name).toBe(true)
  })

  it('keeps every picture small — the tour is the first thing anyone downloads', async () => {
    const { statSync } = await import('node:fs')
    const dir = resolve(__dirname, '../../../public/tour')
    const named = new Set(TOUR_STEPS.flatMap((s) => s.images))
    for (const name of named) {
      expect(name.endsWith('.webp'), name).toBe(true)
      expect(statSync(resolve(dir, name)).size, name).toBeLessThan(80_000)
    }
  })

  it('names its keys the way the app binds them', () => {
    const start = TOUR_STEPS.find((s) => s.id === 'start')!
    expect(start.keys?.map((k) => k.keys.join(''))).toEqual(
      expect.arrayContaining(['⌘O', '⌘Z', '⌘S', '⌘E']),
    )
    const keysFor = (id: string) => TOUR_STEPS.find((s) => s.id === id)?.keys?.[0].keys.join('')
    expect(keysFor('crop')).toBe('C')
    expect(keysFor('subject')).toBe('M')
    expect(keysFor('heal')).toBe('Q')
  })

  it('has the supporting lists filled in', () => {
    expect(TOOLKIT.length).toBe(10)
    expect(new Set(TOOLKIT.map((t) => t.icon)).size).toBe(TOOLKIT.length)
    expect(RAW_FORMATS).toContain('DNG')
    expect(SCENES).toContain('Landscape')
  })
})

describe('clampStep', () => {
  it('keeps the index inside the tour', () => {
    expect(clampStep(-1)).toBe(0)
    expect(clampStep(3)).toBe(3)
    expect(clampStep(2.7)).toBe(2)
    expect(clampStep(TOUR_STEPS.length)).toBe(TOUR_STEPS.length - 1)
    expect(clampStep(Number.NaN)).toBe(0)
    expect(clampStep(Infinity)).toBe(0)
  })
})

describe('the store', () => {
  const freshStore = async () => {
    vi.resetModules()
    return (await import('../../editor/edit-stack/store')).useEditor
  }

  it('opens the tour on a first visit', async () => {
    Object.assign(globalThis, { localStorage: fakeStorage })
    expect((await freshStore()).getState().tourOpen).toBe(true)
  })

  it('keeps it closed once it has been seen', async () => {
    Object.assign(globalThis, { localStorage: fakeStorage })
    markTourSeen()
    expect((await freshStore()).getState().tourOpen).toBe(false)
  })

  it('replays from Help, closing Help to do it', async () => {
    Object.assign(globalThis, { localStorage: fakeStorage })
    markTourSeen()
    const store = await freshStore()
    store.getState().setAboutOpen(true)
    store.getState().setTourOpen(true)
    expect(store.getState()).toMatchObject({ tourOpen: true, aboutOpen: false })
    store.getState().setTourOpen(false)
    expect(store.getState().tourOpen).toBe(false)
  })
})
