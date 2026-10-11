import type { RetouchStroke } from '../editor/edit-stack/types'
import { brushBounds, brushCoverage } from './heal'
import { DEFAULT_STRENGTH } from './brush'

/**
 * Where the blur brush has been, as one map the detail pass reads.
 *
 * A blur stroke is not a patch on the source pixels the way a heal is. Healed
 * on the source it would be graded afterwards, and a tone curve that drives the
 * background to white re-cuts the very edge the blur had softened — which is
 * what happened to a hairline against an overexposed sky. So the blur goes on
 * top instead: the strokes are rasterised into coverage, in the upright uv a
 * mask lives in, and the detail pass defocuses the *finished* picture by that
 * much, exactly as a mask's blur slider does.
 *
 * The map is a fixed size whatever the photo is, so the preview and a
 * full-resolution export read the same thing; the hardware's LINEAR filter
 * covers the gap, and a brush edge has no detail that would miss.
 */

export interface BlurMap {
  /** One byte of blur amount per pixel, row-major. */
  data: Uint8ClampedArray
  width: number
  height: number
}

/** Long edge of the map. A brush is never sharper than a thousandth of the frame. */
export const BLUR_MAP_EDGE = 1024

/** The blur stroke under the pointer right now: shown live, an edit only once it lifts. */
export interface LiveStroke {
  points: number[]
  size: number
  feather: number
  strength: number
}

function mapSize(aspect: number, edge: number): { width: number; height: number } {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1
  return {
    width: a >= 1 ? edge : Math.max(1, Math.round(edge * a)),
    height: a >= 1 ? Math.max(1, Math.round(edge / a)) : edge,
  }
}

/** Lay one stroke into the map at `strength` (0..1), stronger-wins. True if anything landed. */
function paint(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  stroke: { points: number[]; size: number; feather: number },
  strength: number,
): boolean {
  if (strength <= 0 || stroke.points.length < 2) return false
  const points: number[] = []
  for (let i = 0; i + 1 < stroke.points.length; i += 2) {
    points.push(stroke.points[i] * width, stroke.points[i + 1] * height)
  }
  const brush = {
    points,
    radius: Math.max(0.5, stroke.size * Math.min(width, height)),
    feather: stroke.feather / 100,
  }
  const alpha = brushCoverage(brush, width, height)
  const box = brushBounds(brush, width, height)
  let any = false
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = y * width + x
      const v = alpha[i] * strength * 255
      if (v > data[i]) {
        data[i] = v
        any = true
      }
    }
  }
  return any
}

/**
 * Rasterise the enabled blur strokes. `aspect` is the upright picture's width ÷
 * height, so a round brush stays round on the map. Overlapping strokes take
 * the stronger, not the sum: painting the same place twice is still one blur.
 * Null when there is nothing to draw, so the renderer can drop the texture.
 */
export function blurCoverage(strokes: RetouchStroke[], aspect: number, edge = BLUR_MAP_EDGE): BlurMap | null {
  const live = strokes.filter((s) => s.enabled && s.mode === 'blur')
  if (!live.length) return null

  const { width, height } = mapSize(aspect, edge)
  const data = new Uint8ClampedArray(width * height)
  let any = false
  for (const stroke of live) {
    const strength = Math.min(1, Math.max(0, (stroke.strength ?? DEFAULT_STRENGTH) / 100))
    if (paint(data, width, height, stroke, strength)) any = true
  }
  return any ? { data, width, height } : null
}

/**
 * The committed map with the stroke being drawn laid over it, so the blur
 * shows under the brush as it moves. The base is copied, never written: it is
 * what the viewport goes back to if the drag is cancelled.
 */
export function withLiveStroke(
  base: BlurMap | null,
  live: LiveStroke,
  aspect: number,
  edge = BLUR_MAP_EDGE,
): BlurMap | null {
  const { width, height } = base ?? mapSize(aspect, edge)
  const data = base ? new Uint8ClampedArray(base.data) : new Uint8ClampedArray(width * height)
  const painted = paint(data, width, height, live, Math.min(1, Math.max(0, live.strength / 100)))
  return painted || base ? { data, width, height } : null
}
