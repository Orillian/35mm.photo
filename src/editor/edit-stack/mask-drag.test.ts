import { describe, expect, it } from 'vitest'
import { snapLinearEnd } from './mask-drag'

const deg = (d: number) => (d * Math.PI) / 180
const angleOf = (fixed: [number, number], end: [number, number], aspect: number) =>
  (Math.atan2(end[1] - fixed[1], (end[0] - fixed[0]) * aspect) * 180) / Math.PI

describe('snapLinearEnd', () => {
  const fixed: [number, number] = [0.5, 0.5]

  it('snaps to the nearest 15° on a square picture, keeping the length', () => {
    const end: [number, number] = [0.5 + 0.3 * Math.cos(deg(41)), 0.5 + 0.3 * Math.sin(deg(41))]
    const snapped = snapLinearEnd(fixed, end, 1)
    expect(angleOf(fixed, snapped, 1)).toBeCloseTo(45, 6)
    expect(Math.hypot(snapped[0] - fixed[0], snapped[1] - fixed[1])).toBeCloseTo(0.3, 6)
  })

  it('reaches the level and the vertical', () => {
    expect(angleOf(fixed, snapLinearEnd(fixed, [0.9, 0.52], 1), 1)).toBeCloseTo(0, 6)
    expect(angleOf(fixed, snapLinearEnd(fixed, [0.48, 0.1], 1), 1)).toBeCloseTo(-90, 6)
  })

  it('measures the angle as the picture is seen, not in uv', () => {
    // On a 2:1 picture a line that *looks* 45° climbs half as far in u as in v.
    const snapped = snapLinearEnd(fixed, [0.5 + 0.1, 0.5 + 0.17], 2)
    expect(angleOf(fixed, snapped, 2)).toBeCloseTo(45, 6)
    expect((snapped[0] - fixed[0]) * 2).toBeCloseTo(snapped[1] - fixed[1], 6)
  })

  it('leaves a zero-length drag, and a bad step, alone', () => {
    expect(snapLinearEnd(fixed, fixed, 1)).toEqual(fixed)
    expect(snapLinearEnd(fixed, [0.7, 0.61], 1, 0)).toEqual([0.7, 0.61])
  })

  it('takes a finer step when asked', () => {
    const end: [number, number] = [0.5 + 0.3 * Math.cos(deg(43)), 0.5 + 0.3 * Math.sin(deg(43))]
    expect(angleOf(fixed, snapLinearEnd(fixed, end, 1, 5), 1)).toBeCloseTo(45, 6)
    expect(angleOf(fixed, snapLinearEnd(fixed, end, 1, 1), 1)).toBeCloseTo(43, 6)
  })
})
