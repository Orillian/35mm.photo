import type { EditState } from '../edit-stack/types'
import { defaultEdits, NEUTRAL_TEMPERATURE } from '../edit-stack/defaults'
import { autoAdjust } from '../tools/auto'
import { neutralise } from '../tools/white-picker'
import { LOOKS_BY_ID } from '../presets/looks'
import { nameFor, type NameTraits } from './names'
import { type Scene, type SceneGuess } from './scene'
import { toHistogram, type ImageStats } from './stats'

/**
 * The rules: statistics and a scene in, a look out. A look is a handful of
 * slider values and, usually, one of the built-in film looks at a strength —
 * every one of them an ordinary entry on the edit stack, so what comes out can
 * be opened, nudged or saved like anything else.
 *
 * Conservative on purpose. The aim is a starting point most people keep and
 * tweak, not the best possible edit; a look that overreaches is worse than
 * one that under-reaches, because the second can be nudged and the first has
 * to be undone.
 */

export interface Traits extends NameTraits {
  muted: boolean
  vivid: boolean
  contrasty: boolean
  lowLight: boolean
}

export interface AutoLook {
  /** `look`: adjustments and a film look. `suggest`: the photo was fine; just a look to try. */
  kind: 'look' | 'suggest'
  edits: Partial<EditState>
  lookId: string | null
  lookStrength: number
  name: string
  scene: SceneGuess | null
  traits: Traits
}

/** How far a scene lets the rules go. */
interface Profile {
  /** Where the median is aimed; null leaves exposure alone. */
  medianTarget: number | null
  exposure: [number, number]
  /** How much of the gray-world correction is applied. */
  wb: number
  vibranceMax: number
  contrastMax: number
}

const DEFAULT_PROFILE: Profile = { medianTarget: 0.45, exposure: [-2, 2], wb: 0.6, vibranceMax: 35, contrastMax: 30 }

const PROFILES: Partial<Record<Scene, Partial<Profile>>> = {
  // The warmth is the picture; the low sun is meant to be low.
  sunset: { wb: 0, exposure: [-1, 0.5], vibranceMax: 15 },
  // Dark is the point. Open the shadows a little and stop there.
  night: { medianTarget: null, exposure: [-0.5, 0.5], wb: 0.3, vibranceMax: 10, contrastMax: 15 },
  // Skin comes first: no saturation push, a gentle hand on contrast.
  portrait: { vibranceMax: 15, contrastMax: 15 },
  // Snow and sand are bright; a meter's middle grey is wrong for them.
  snow: { medianTarget: 0.55, exposure: [0, 2] },
  food: { vibranceMax: 25 },
}

/** Under these the photo was fine already, and a look would be fussing. */
const TINY = { exposure: 0.15, tone: 8, temperature: 250, tint: 6, vibrance: 8 }

export function buildAutoLook(stats: ImageStats, scene: SceneGuess | null, meta: { iso?: number } = {}): AutoLook {
  const profile: Profile = { ...DEFAULT_PROFILE, ...(scene ? PROFILES[scene.scene] : {}) }
  const traits = traitsOf(stats, meta)
  const edits: Partial<EditState> = {}

  /* Tone: the Auto button's own rules, then the scene's limits on top. */
  const auto = autoAdjust(defaultEdits(), toHistogram(stats))
  if (profile.medianTarget !== null) {
    let exposure = auto.exposure ?? 0
    if (profile.medianTarget !== DEFAULT_PROFILE.medianTarget && stats.median > 0.01) {
      exposure = Math.log2(profile.medianTarget / stats.median)
    }
    edits.exposure = round2(clamp(exposure, profile.exposure[0], profile.exposure[1]))
  }
  if (auto.contrast) edits.contrast = Math.min(auto.contrast, profile.contrastMax)
  if (auto.highlights) edits.highlights = auto.highlights
  if (auto.shadows) edits.shadows = scene?.scene === 'night' ? Math.min(auto.shadows, 20) : auto.shadows
  else if (scene?.scene === 'night' && stats.dark > 0.5) edits.shadows = 12
  if (auto.blacks) edits.blacks = auto.blacks
  if (auto.whites) edits.whites = auto.whites

  /* White balance: gray-world, at part strength, so some of the light's own colour stays. */
  if (profile.wb > 0) {
    const found = neutralise(stats.meanLinear)
    if (!('problem' in found)) {
      const temperature = NEUTRAL_TEMPERATURE + profile.wb * (found.temperature - NEUTRAL_TEMPERATURE)
      edits.temperature = Math.round(temperature / 10) * 10
      edits.tint = Math.round(profile.wb * found.tint)
    }
  }

  /* Colour: a lift only where the picture is plainly flat — and has colour to
     lift. A monochrome frame is left monochrome. */
  if (stats.saturation >= 0.04 && stats.saturation < 0.2 && profile.vibranceMax > 0) {
    edits.vibrance = clamp(Math.round((0.24 - stats.saturation) * 250), 8, profile.vibranceMax)
  }

  /* The film look, by scene first and the picture's character second. */
  const { lookId, lookStrength } = pickLook(traits, scene)

  if (isTiny(edits)) {
    const name = lookId ? `Try ${LOOKS_BY_ID.get(lookId)?.name ?? 'a look'}` : 'As shot'
    return { kind: 'suggest', edits: {}, lookId, lookStrength, name, scene, traits }
  }

  dropNoise(edits)
  return {
    kind: 'look',
    edits,
    lookId,
    lookStrength,
    name: nameFor(traits, scene?.scene ?? null, edits),
    scene,
    traits,
  }
}

function traitsOf(stats: ImageStats, meta: { iso?: number }): Traits {
  const range = stats.p98 - stats.p02
  return {
    warm: stats.warmth > 0.12,
    cool: stats.warmth < -0.1,
    muted: stats.saturation < 0.22,
    vivid: stats.vivid > 0.2 || stats.saturation > 0.4,
    flat: range < 0.6,
    contrasty: range > 0.85,
    dark: stats.median < 0.25,
    bright: stats.median > 0.65,
    mono: stats.saturation < 0.06,
    lowLight: (meta.iso ?? 0) >= 3200,
  }
}

function pickLook(t: Traits, scene: SceneGuess | null): { lookId: string | null; lookStrength: number } {
  const s = scene?.scene ?? null
  if (t.mono && t.contrasty) return { lookId: 'graphite', lookStrength: 80 }
  if (s === 'night' || t.lowLight) return { lookId: 'retro-neg', lookStrength: 70 }
  if (s === 'sunset') return { lookId: 'gold', lookStrength: 55 }
  if (s === 'portrait') return { lookId: 'portrait', lookStrength: 70 }
  if (s === 'food') return { lookId: 'satin', lookStrength: 55 }
  if (s === 'snow') return { lookId: 'azure', lookStrength: 45 }
  if (t.vivid && (s === 'landscape' || t.contrasty)) return { lookId: 'vivid', lookStrength: 60 }
  if (t.warm && t.muted) return { lookId: 'chrome', lookStrength: 70 }
  if (t.cool && t.muted) return { lookId: 'faded', lookStrength: 50 }
  if (t.flat && t.muted) return { lookId: 'chrome', lookStrength: 55 }
  if (t.mono) return { lookId: 'mono', lookStrength: 70 }
  return { lookId: 'standard', lookStrength: 50 }
}

function isTiny(e: Partial<EditState>): boolean {
  const tone = Math.max(
    Math.abs(e.contrast ?? 0),
    Math.abs(e.highlights ?? 0),
    Math.abs(e.shadows ?? 0),
    Math.abs(e.blacks ?? 0),
    Math.abs(e.whites ?? 0),
  )
  return (
    Math.abs(e.exposure ?? 0) < TINY.exposure &&
    tone < TINY.tone &&
    Math.abs((e.temperature ?? NEUTRAL_TEMPERATURE) - NEUTRAL_TEMPERATURE) < TINY.temperature &&
    Math.abs(e.tint ?? 0) < TINY.tint &&
    (e.vibrance ?? 0) < TINY.vibrance
  )
}

/** A value that rounds to nothing is left off, so the look sets only what it means to. */
function dropNoise(e: Partial<EditState>): void {
  for (const key of Object.keys(e) as (keyof EditState)[]) {
    const v = e[key]
    if (typeof v !== 'number') continue
    if (key === 'temperature' ? v === NEUTRAL_TEMPERATURE : v === 0) delete e[key]
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

function round2(v: number) {
  return Math.round(v * 100) / 100
}
