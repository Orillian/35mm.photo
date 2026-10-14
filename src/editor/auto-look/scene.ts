import { SCENE_CLASSES } from './scene-classes'
import type { ImageStats } from './stats'

/**
 * What the photo is of, roughly, so the rules know what to leave alone.
 *
 * Two sources, combined. A small ImageNet classifier knows *things* — a plate
 * of food, a ski, a streetcar, a jersey on somebody — and the scenes that are
 * made of things come from it. The three it cannot see are the ones that
 * matter most to the rules, and they are plain in the statistics: a sunset is
 * an orange sky, night is a dark frame with points of light, a portrait is a
 * frame with a lot of skin in it.
 */
export type Scene = 'portrait' | 'landscape' | 'sunset' | 'night' | 'street' | 'food' | 'interior' | 'snow'

export const SCENE_LABEL: Record<Scene, string> = {
  portrait: 'Portrait',
  landscape: 'Landscape',
  sunset: 'Golden hour',
  night: 'Night',
  street: 'Street',
  food: 'Food',
  interior: 'Interior',
  snow: 'Snow / beach',
}

export interface SceneGuess {
  scene: Scene
  /** 0..1, by whichever source made the call. */
  confidence: number
  source: 'model' | 'stats'
}

/** Below this share of probability a model's call is noise, not a scene. */
export const MODEL_MIN_CONFIDENCE = 0.2

export function softmax(logits: ArrayLike<number>): Float32Array {
  const out = new Float32Array(logits.length)
  let max = -Infinity
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i]
  let sum = 0
  for (let i = 0; i < logits.length; i++) {
    out[i] = Math.exp(logits[i] - max)
    sum += out[i]
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum
  return out
}

/** The classifier's probabilities, summed per scene; the heaviest scene, if it carries enough. */
export function sceneFromClasses(probs: ArrayLike<number>): SceneGuess | null {
  let best: Scene | null = null
  let bestMass = 0
  for (const scene of Object.keys(SCENE_CLASSES) as (keyof typeof SCENE_CLASSES)[]) {
    let mass = 0
    for (const i of SCENE_CLASSES[scene]) mass += probs[i] ?? 0
    if (mass > bestMass) {
      bestMass = mass
      best = scene
    }
  }
  if (!best || bestMass < MODEL_MIN_CONFIDENCE) return null
  return { scene: best, confidence: Math.min(1, bestMass), source: 'model' }
}

/** The scenes the statistics can tell on their own. */
export function sceneFromStats(stats: ImageStats, meta: { iso?: number } = {}): SceneGuess | null {
  const guesses: SceneGuess[] = []

  // Orange above, plainly less of it below, and the top the brighter half: a
  // sky over its ground — not a face, and not a wooden table above a sheet of paper.
  // A third of the top half or more, and bright: warm ceiling lights in a room
  // are orange too, but they are a few points of it, not a sky.
  if (
    stats.orangeTop >= 0.3 &&
    stats.warmth > 0.1 &&
    stats.orangeTop > stats.orangeBottom * 2 &&
    stats.topLuma >= 0.35 &&
    stats.topLuma > stats.bottomLuma * 1.15
  ) {
    guesses.push({ scene: 'sunset', confidence: Math.min(1, stats.orangeTop * 2.5), source: 'stats' })
  }
  const highIso = (meta.iso ?? 0) >= 1600
  if (stats.median < 0.14 && stats.dark > 0.45 && (highIso || stats.brightPoints > 0.001)) {
    guesses.push({ scene: 'night', confidence: Math.min(1, stats.dark + (highIso ? 0.2 : 0)), source: 'stats' })
  }
  // A portrait is skin *on the subject*: a person small in the frame is still
  // the subject, and a beige wall or a rock face never is. Without a subject
  // map, skin over the whole frame is only a hint — never enough on its own to
  // overrule what the classifier saw.
  const subject = stats.subject
  if (subject && subject.area >= 0.03 && subject.area <= 0.85 && subject.skin >= 0.2 && stats.skin >= 0.02) {
    guesses.push({ scene: 'portrait', confidence: Math.min(1, 0.5 + subject.skin), source: 'stats' })
  } else if (!subject && stats.skin > 0.1) {
    guesses.push({ scene: 'portrait', confidence: Math.min(0.45, stats.skin * 3), source: 'stats' })
  }
  if (stats.skyTop > 0.3) {
    guesses.push({ scene: 'landscape', confidence: Math.min(0.6, stats.skyTop), source: 'stats' })
  }

  guesses.sort((a, b) => b.confidence - a.confidence)
  return guesses[0] ?? null
}

/**
 * One answer from the two. The statistics own sunset and night outright when
 * they are sure — a classifier that sees a jersey at a night match is right
 * about the jersey and wrong about what matters. Otherwise the model, when it
 * has something; otherwise whatever the statistics had, if it was firm.
 */
export function chooseScene(fromStats: SceneGuess | null, fromModel: SceneGuess | null): SceneGuess | null {
  if (fromStats && (fromStats.scene === 'sunset' || fromStats.scene === 'night') && fromStats.confidence >= 0.5) {
    return fromStats
  }
  // A person found on the subject outranks the room, the street or the view
  // behind them — the classifier names what it recognises, which is the
  // backdrop when the person is not looking at it or is wrapped in a towel.
  // Food is the exception: skin on a plate is a hand, and the plate is the point.
  // Unless the model was sure of its backdrop: then the subject has to be
  // plainly a person (more of it skin), not merely skin-coloured — a car in a
  // beige garage is not a portrait.
  if (fromStats?.scene === 'portrait' && fromModel?.scene !== 'food') {
    const sure = fromModel !== null && fromModel.confidence >= 0.6
    if (fromStats.confidence >= (sure ? 0.85 : 0.7)) return fromStats
  }
  if (fromModel) return fromModel
  if (fromStats && fromStats.confidence >= 0.4) return fromStats
  return null
}
