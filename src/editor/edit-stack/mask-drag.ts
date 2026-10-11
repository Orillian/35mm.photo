/**
 * Shift-drag on a linear mask's end snaps the line to a multiple of this, in
 * degrees — every 15°, which takes in the level, the vertical and the
 * diagonals without making the in-betweens unreachable.
 */
export const ANGLE_SNAP_STEP = 15

/**
 * The end of a linear mask being dragged, snapped so the line from `fixed`
 * runs at a multiple of `step` degrees *as the picture is seen*. Masks live in
 * upright uv, where a square picture's 45° and a wide one's are different
 * vectors, so `aspect` (upright width ÷ height) corrects the measurement and
 * is undone on the way back. The length is kept: only the direction snaps.
 */
export function snapLinearEnd(
  fixed: [number, number],
  dragged: [number, number],
  aspect: number,
  step = ANGLE_SNAP_STEP,
): [number, number] {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1
  const vx = (dragged[0] - fixed[0]) * a
  const vy = dragged[1] - fixed[1]
  const length = Math.hypot(vx, vy)
  if (length < 1e-6 || !(step > 0)) return dragged

  const stepRad = (step * Math.PI) / 180
  const angle = Math.round(Math.atan2(vy, vx) / stepRad) * stepRad
  return [fixed[0] + (length * Math.cos(angle)) / a, fixed[1] + length * Math.sin(angle)]
}
