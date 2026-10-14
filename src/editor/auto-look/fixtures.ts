/** Small synthetic pictures for the auto-look tests: RGBA, painted by a function of position. */
export function picture(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number],
): { rgba: Uint8ClampedArray; width: number; height: number } {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x / width, y / height)
      const i = (y * width + x) * 4
      rgba[i] = r
      rgba[i + 1] = g
      rgba[i + 2] = b
      rgba[i + 3] = 255
    }
  }
  return { rgba, width, height }
}

/** A deterministic ripple, so a "flat" field still has a histogram with some width. */
export const ripple = (x: number, y: number, amount = 12) =>
  Math.round(Math.sin(x * 37) * Math.cos(y * 29) * amount)
