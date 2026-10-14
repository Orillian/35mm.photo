import { whiteBalanceGain } from '../gpu/whitebalance'

/**
 * The white picker: click something that should be neutral, and the warmth
 * and tint are set so that it is.
 *
 * The sample is read from the *source* pixels, before any of the stack —
 * which is exactly what the colour pass multiplies by the white-balance gain,
 * so the question is well posed: which temperature and tint make the gain
 * that turns this colour grey? The gain is a blackbody model with a tint
 * across it (see whitebalance.ts), not something that inverts in closed form,
 * so the pair is found by search — coarse over the whole range, then finer
 * around the best, a few thousand evaluations of a cheap function.
 */

export const TEMPERATURE_RANGE: [number, number] = [2000, 12000]
export const TINT_RANGE: [number, number] = [-100, 100]

/** sRGB byte → linear light, the way the shader's `toLinear` does it. */
export function srgbToLinear(byte: number): number {
  const v = byte / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/**
 * The mean colour of a window of RGBA bytes, in linear light. Averaged after
 * linearising, so a noisy patch comes out at its true mean rather than at the
 * gamma-weighted one.
 */
export function averageLinear(rgba: Uint8ClampedArray): [number, number, number] {
  const n = rgba.length / 4
  if (!n) return [0, 0, 0]
  let r = 0
  let g = 0
  let b = 0
  for (let i = 0; i < rgba.length; i += 4) {
    r += srgbToLinear(rgba[i])
    g += srgbToLinear(rgba[i + 1])
    b += srgbToLinear(rgba[i + 2])
  }
  return [r / n, g / n, b / n]
}

/**
 * The square window read around a pixel, kept inside the picture: at an edge
 * the window slides in rather than shrinking, so the sample is always the same
 * number of pixels.
 */
export function sampleWindow(
  x: number,
  y: number,
  width: number,
  height: number,
  reach: number,
): { x0: number; y0: number; side: number } {
  const side = Math.min(reach * 2 + 1, width, height)
  const x0 = Math.max(0, Math.min(width - side, Math.round(x) - reach))
  const y0 = Math.max(0, Math.min(height - side, Math.round(y) - reach))
  return { x0, y0, side }
}

/** Why a sample cannot be used, in words for a toast. */
export type PickProblem = 'dark' | 'clipped'

/**
 * The temperature and tint under which `linear` would be neutral, or why it
 * cannot be: a near-black patch has no colour to read, and a clipped one has
 * lost the colour it had — the channels that hit the ceiling first no longer
 * say how far they would have gone.
 */
export function neutralise(
  linear: [number, number, number],
): { temperature: number; tint: number } | { problem: PickProblem } {
  const [r, g, b] = linear
  const max = Math.max(r, g, b)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  if (luminance < 0.004 || Math.min(r, g, b) <= 0) return { problem: 'dark' }
  if (max > 0.985) return { problem: 'clipped' }

  // Squared log-ratio error: zero when the balanced colour is grey, and
  // symmetric, so a pixel twice too red costs the same as one half as red.
  const error = (temperature: number, tint: number) => {
    const [gr, gg, gb] = whiteBalanceGain(temperature, tint)
    const er = Math.log((r * gr) / (g * gg))
    const eb = Math.log((b * gb) / (g * gg))
    return er * er + eb * eb
  }

  let bestT = 5500
  let bestTint = 0
  let best = Infinity
  const search = (t0: number, t1: number, tStep: number, n0: number, n1: number, nStep: number) => {
    for (let t = t0; t <= t1 + 1e-9; t += tStep) {
      for (let n = n0; n <= n1 + 1e-9; n += nStep) {
        const e = error(t, n)
        if (e < best) {
          best = e
          bestT = t
          bestTint = n
        }
      }
    }
  }
  const clampT = (t: number) => Math.min(TEMPERATURE_RANGE[1], Math.max(TEMPERATURE_RANGE[0], t))
  const clampN = (n: number) => Math.min(TINT_RANGE[1], Math.max(TINT_RANGE[0], n))

  search(TEMPERATURE_RANGE[0], TEMPERATURE_RANGE[1], 200, TINT_RANGE[0], TINT_RANGE[1], 10)
  search(clampT(bestT - 200), clampT(bestT + 200), 25, clampN(bestTint - 10), clampN(bestTint + 10), 2)
  search(clampT(bestT - 25), clampT(bestT + 25), 5, clampN(bestTint - 2), clampN(bestTint + 2), 0.5)

  // The sliders' own steps.
  return { temperature: Math.round(bestT / 10) * 10, tint: Math.round(bestTint) }
}
