import type { Scene } from './scene'
import type { EditState } from '../edit-stack/types'

/**
 * A name for a generated look: where it was taken, or failing that what the
 * light was like, and then what the look did about it. Two words, so the
 * grid tile fits it, from a bank small enough to stay in character.
 */

const SCENE_WORD: Record<Scene, string> = {
  sunset: 'Golden Hour',
  night: 'Night',
  portrait: 'Portrait',
  landscape: 'Open Sky',
  street: 'Street',
  food: 'Table',
  interior: 'Indoor',
  snow: 'Bright Shore',
}

export interface NameTraits {
  warm: boolean
  cool: boolean
  dark: boolean
  bright: boolean
  flat: boolean
  mono: boolean
}

export function nameFor(traits: NameTraits, scene: Scene | null, edits: Partial<EditState>): string {
  const first = scene
    ? SCENE_WORD[scene]
    : traits.warm
      ? 'Warm'
      : traits.cool
        ? 'Cool'
        : traits.dark
          ? 'Low'
          : traits.bright
            ? 'High'
            : traits.flat
              ? 'Soft'
              : 'Clear'

  const exposure = edits.exposure ?? 0
  const second = traits.mono
    ? 'Mono'
    : exposure >= 0.3
      ? 'Lift'
      : exposure <= -0.3
        ? 'Dusk'
        : (edits.contrast ?? 0) >= 12
          ? 'Crisp'
          : (edits.vibrance ?? 0) >= 12
            ? 'Bloom'
            : 'Balance'

  return `${first} ${second}`
}
