import type { HistogramData } from '../histogram-worker'

/**
 * What the auto look measures: a handful of numbers about a small copy of the
 * photo, as the camera wrote it — before any of the stack, so the rules see
 * the problem rather than the current attempt at fixing it.
 *
 * Everything is a fraction or a 0..1 level, so a rule reads the same whatever
 * the photo's size. The "top half" features exist for the guards: a sky that
 * is orange is a sunset, and a sunset's warmth is the point, not a cast.
 */
export interface ImageStats {
  width: number
  height: number
  /** sRGB luma histogram, 256 bins — the shape the Auto button already reads. */
  luma: Uint32Array
  clippedShadows: number
  clippedHighlights: number
  /** Luminance percentiles, 0..1. */
  p02: number
  p05: number
  median: number
  p95: number
  p98: number
  /** Mean colour in linear light: what gray-world white balance works from. */
  meanLinear: [number, number, number]
  /** Mean HSV saturation, 0..1, and the share of pixels that are plainly vivid. */
  saturation: number
  vivid: number
  /** (R − B) / (R + B) of the linear means: above zero is warm, below is cool. */
  warmth: number
  /** Share of the top half that is warm orange and not dark: a low sun, or its sky. */
  orangeTop: number
  /** The same for the bottom half — a face or a floor is orange too, and is not a sunset. */
  orangeBottom: number
  /** Share of the top half that is light blue: open sky. */
  skyTop: number
  /** Share of pixels in the range of skin tones. */
  skin: number
  /** Share of pixels darker than 8 %, and brighter than 95 %. */
  dark: number
  brightPoints: number
  /** Mean luminance of the top and bottom halves, 0..1: a sky is brighter than its ground. */
  topLuma: number
  bottomLuma: number
  /**
   * The salient subject, when a map of it was supplied: how much of the frame
   * it covers, and how much of *it* is skin-toned. Skin inside the subject is
   * what makes a portrait — a small person in foliage is the subject; a beige
   * wall never is.
   */
  subject: { area: number; skin: number } | null
}

/** A subject map as the detector returns it: `size` square, in the same orientation as the pixels. */
export interface SubjectCoverage {
  data: Uint8ClampedArray
  size: number
}

const LINEAR = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const v = i / 255
  LINEAR[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

export function imageStats(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  subject: SubjectCoverage | null = null,
): ImageStats {
  const n = width * height
  const luma = new Uint32Array(256)
  let r = 0
  let g = 0
  let b = 0
  let satSum = 0
  let vivid = 0
  let orangeTop = 0
  let orangeBottom = 0
  let skyTop = 0
  let topCount = 0
  let skin = 0
  let dark = 0
  let bright = 0
  let topLuma = 0
  let bottomLuma = 0
  let inSubject = 0
  let skinInSubject = 0
  const halfway = Math.floor(height / 2)

  for (let y = 0; y < height; y++) {
    const top = y < halfway
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const R = rgba[i]
      const G = rgba[i + 1]
      const B = rgba[i + 2]
      const l = Math.round(0.2126 * R + 0.7152 * G + 0.0722 * B)
      luma[l]++
      if (top) topLuma += l
      else bottomLuma += l
      const covered =
        subject !== null &&
        subject.data[
          Math.min(subject.size - 1, Math.floor((y / height) * subject.size)) * subject.size +
            Math.min(subject.size - 1, Math.floor((x / width) * subject.size))
        ] >= 128
      if (covered) inSubject++
      r += LINEAR[R]
      g += LINEAR[G]
      b += LINEAR[B]

      const max = Math.max(R, G, B)
      const min = Math.min(R, G, B)
      const v = max / 255
      const s = max === 0 ? 0 : (max - min) / max
      satSum += s
      if (s > 0.5 && v > 0.25) vivid++
      if (v < 0.08) dark++
      if (v > 0.95) bright++

      // Hue in degrees, only where there is enough colour for it to mean anything.
      if (s > 0.12 && v > 0.15) {
        const d = max - min
        let h =
          max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
        h *= 60
        if (h < 0) h += 360
        // Skin: a narrow band of orange at moderate saturation.
        if (h >= 8 && h <= 40 && s >= 0.18 && s <= 0.62 && v >= 0.3) {
          skin++
          if (covered) skinInSubject++
        }
        const orange = h >= 10 && h <= 50 && s >= 0.3 && v >= 0.35
        if (top) {
          if (orange) orangeTop++
          if (h >= 190 && h <= 240 && s >= 0.15 && v >= 0.45) skyTop++
        } else if (orange) {
          orangeBottom++
        }
      }
      if (top) topCount++
    }
  }

  const percentile = (q: number) => {
    const want = q * n
    let seen = 0
    for (let i = 0; i < 256; i++) {
      seen += luma[i]
      if (seen >= want) return i / 255
    }
    return 1
  }

  return {
    width,
    height,
    luma,
    clippedShadows: n ? luma[0] / n : 0,
    clippedHighlights: n ? luma[255] / n : 0,
    p02: percentile(0.02),
    p05: percentile(0.05),
    median: percentile(0.5),
    p95: percentile(0.95),
    p98: percentile(0.98),
    meanLinear: n ? [r / n, g / n, b / n] : [0, 0, 0],
    saturation: n ? satSum / n : 0,
    vivid: n ? vivid / n : 0,
    warmth: r + b > 0 ? (r - b) / (r + b) : 0,
    orangeTop: topCount ? orangeTop / topCount : 0,
    orangeBottom: n - topCount ? orangeBottom / (n - topCount) : 0,
    skyTop: topCount ? skyTop / topCount : 0,
    skin: n ? skin / n : 0,
    dark: n ? dark / n : 0,
    brightPoints: n ? bright / n : 0,
    topLuma: topCount ? topLuma / topCount / 255 : 0,
    bottomLuma: n - topCount ? bottomLuma / (n - topCount) / 255 : 0,
    subject: subject && n ? { area: inSubject / n, skin: inSubject ? skinInSubject / inSubject : 0 } : null,
  }
}

/** The shape the Auto button's rules read, so they can be reused as they are. */
export function toHistogram(stats: ImageStats): HistogramData {
  return {
    r: stats.luma,
    g: stats.luma,
    b: stats.luma,
    luma: stats.luma,
    clippedShadows: stats.clippedShadows,
    clippedHighlights: stats.clippedHighlights,
  }
}
