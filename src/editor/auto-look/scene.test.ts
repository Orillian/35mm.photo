import { describe, expect, it } from 'vitest'
import { chooseScene, sceneFromClasses, sceneFromStats, softmax } from './scene'
import { CLASS_LABEL, SCENE_CLASSES } from './scene-classes'
import { imageStats } from './stats'
import { picture } from './fixtures'

const stats = (p: ReturnType<typeof picture>) => imageStats(p.rgba, p.width, p.height)

describe('the class table', () => {
  it('puts each class in at most one scene', () => {
    const seen = new Set<number>()
    for (const list of Object.values(SCENE_CLASSES)) {
      for (const i of list) {
        expect(seen.has(i)).toBe(false)
        seen.add(i)
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(1000)
      }
    }
    expect(seen.size).toBeGreaterThan(250)
  })

  it('files what a baby is wrapped in or laid in under portrait, and a menu under nothing', () => {
    const label = (name: string) => Object.entries(CLASS_LABEL).find(([, n]) => n === name)?.[0]
    for (const thing of ['bath towel', 'crib', 'cradle', 'diaper']) {
      const i = Number(label(thing))
      expect(SCENE_CLASSES.portrait, thing).toContain(i)
    }
    expect(label('menu')).toBeUndefined()
  })
})

describe('sceneFromClasses', () => {
  const probsOn = (indices: readonly number[], mass: number) => {
    const p = new Float32Array(1000).fill((1 - mass) / 1000)
    for (const i of indices) p[i] += mass / indices.length
    return p
  }

  it('names the scene whose things carry the probability', () => {
    expect(sceneFromClasses(probsOn(SCENE_CLASSES.food, 0.7))).toMatchObject({ scene: 'food', source: 'model' })
    expect(sceneFromClasses(probsOn(SCENE_CLASSES.street, 0.4))?.scene).toBe('street')
  })

  it('says nothing when no scene carries enough', () => {
    expect(sceneFromClasses(new Float32Array(1000).fill(0.001))).toBeNull()
    expect(sceneFromClasses(probsOn(SCENE_CLASSES.interior, 0.1))).toBeNull()
  })

  it('softmax sums to one and keeps the order', () => {
    const p = softmax([1, 3, 2])
    expect(p[0] + p[1] + p[2]).toBeCloseTo(1, 6)
    expect(p[1]).toBeGreaterThan(p[2])
  })
})

describe('sceneFromStats', () => {
  it('calls an orange sky a sunset', () => {
    const s = stats(picture(40, 40, (_x, y) => (y < 0.5 ? [230, 130, 40] : [60, 45, 35])))
    expect(sceneFromStats(s)?.scene).toBe('sunset')
  })

  it('calls a dark frame with points of light night, and a dark frame at high ISO too', () => {
    const lights = stats(picture(50, 50, (x, y) => (x > 0.9 && y > 0.9 ? [255, 250, 220] : [10, 10, 14])))
    expect(sceneFromStats(lights)?.scene).toBe('night')
    const plain = stats(picture(50, 50, () => [12, 12, 14]))
    expect(sceneFromStats(plain)).toBeNull()
    expect(sceneFromStats(plain, { iso: 3200 })?.scene).toBe('night')
  })

  it('without a subject map, skin over the frame is only a hint', () => {
    const s = stats(picture(30, 30, (x) => (x < 0.4 ? [205, 150, 120] : [90, 90, 100])))
    const g = sceneFromStats(s)
    expect(g?.scene).toBe('portrait')
    expect(g!.confidence).toBeLessThanOrEqual(0.45)
  })

  it('calls a small person on the subject a portrait, and a beige subject not', () => {
    // A small figure, skin-toned, on a green ground; the map covers just the figure.
    const p = picture(60, 60, (x, y) => (x > 0.45 && x < 0.55 && y > 0.3 && y < 0.7 ? [205, 150, 120] : [60, 110, 50]))
    const map = new Uint8ClampedArray(320 * 320)
    for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
      if (x / 320 > 0.45 && x / 320 < 0.55 && y / 320 > 0.3 && y / 320 < 0.7) map[y * 320 + x] = 255
    }
    const s = imageStats(p.rgba, p.width, p.height, { data: map, size: 320 })
    expect(s.subject?.area).toBeCloseTo(0.04, 1)
    expect(s.subject?.skin).toBeGreaterThan(0.9)
    const g = sceneFromStats(s)
    expect(g?.scene).toBe('portrait')
    expect(g!.confidence).toBeGreaterThanOrEqual(0.7)

    // The same map over a frame of beige: the subject is not skin-toned enough.
    const wall = picture(60, 60, () => [200, 190, 170])
    const w = imageStats(wall.rgba, wall.width, wall.height, { data: map, size: 320 })
    expect(sceneFromStats(w)).toBeNull()
  })

  it('does not call a warm-lit room a sunset', () => {
    // A few orange lamps across the top of a dim room: orange, but a tenth of it, and not bright.
    const s = stats(picture(60, 40, (x, y) => (y < 0.5 && Math.floor(x * 10) % 5 === 0 ? [230, 140, 50] : [40, 38, 36])))
    expect(s.orangeTop).toBeLessThan(0.3)
    expect(sceneFromStats(s)?.scene).not.toBe('sunset')
  })

  it('has nothing to say about a plain grey', () => {
    expect(sceneFromStats(stats(picture(20, 20, () => [120, 120, 120])))).toBeNull()
  })
})

describe('chooseScene', () => {
  const g = (scene: 'sunset' | 'night' | 'food' | 'portrait', confidence: number, source: 'model' | 'stats') =>
    ({ scene, confidence, source }) as const

  it('lets a sure sunset or night from the statistics overrule the model', () => {
    expect(chooseScene(g('sunset', 0.8, 'stats'), g('food', 0.6, 'model'))?.scene).toBe('sunset')
    expect(chooseScene(g('night', 0.7, 'stats'), g('portrait', 0.9, 'model'))?.scene).toBe('night')
  })

  it('lets a person on the subject outrank the backdrop, unless the model was sure and the person is not plain', () => {
    expect(chooseScene(g('portrait', 0.75, 'stats'), { scene: 'landscape', confidence: 0.5, source: 'model' })?.scene).toBe('portrait')
    expect(chooseScene(g('portrait', 0.75, 'stats'), { scene: 'street', confidence: 0.7, source: 'model' })?.scene).toBe('street')
    expect(chooseScene(g('portrait', 0.9, 'stats'), { scene: 'street', confidence: 0.7, source: 'model' })?.scene).toBe('portrait')
    expect(chooseScene(g('portrait', 0.9, 'stats'), g('food', 0.5, 'model'))?.scene).toBe('food')
  })

  it('otherwise takes the model, then a firm statistic, then nothing', () => {
    expect(chooseScene(g('portrait', 0.3, 'stats'), g('food', 0.3, 'model'))?.scene).toBe('food')
    expect(chooseScene(g('portrait', 0.5, 'stats'), null)?.scene).toBe('portrait')
    expect(chooseScene(g('portrait', 0.3, 'stats'), null)).toBeNull()
    expect(chooseScene(null, null)).toBeNull()
  })
})
