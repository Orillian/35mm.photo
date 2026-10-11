import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_GRID, gridLines, loadGrid, saveGrid } from './grid'

describe('gridLines', () => {
  it('puts density − 1 lines across, evenly', () => {
    expect(gridLines(4, 400, 300).xs).toEqual([100, 200, 300])
    expect(gridLines(2, 400, 300).xs).toEqual([200])
  })

  it('fits the picture: the rows follow its shape and end on its edges', () => {
    // 4 across on a 4:3 picture is 3 down — the last line is a cell above the edge, never a sliver.
    expect(gridLines(4, 400, 300).ys).toEqual([100, 200])
    // 3 across on a 3:2 picture is 2 down.
    expect(gridLines(3, 600, 400).ys).toEqual([200])
    // A tall frame gets more rows than columns.
    expect(gridLines(3, 300, 900).ys).toEqual([100, 200, 300, 400, 500, 600, 700, 800])
  })

  it('stretches the cells a little rather than cutting the last row short', () => {
    // 3 across on 16:9: 1.7 rows rounds to 2, each 90 px tall — not 106 px cells with 48 px left over.
    expect(gridLines(3, 320, 180).ys).toEqual([90])
    // Every photo gets whole cells: the lines are always inside the picture.
    for (const [w, h] of [[400, 300], [300, 400], [320, 180], [1000, 1000], [500, 210]]) {
      const { ys } = gridLines(6, w, h)
      expect(ys.every((y) => y > 0 && y < h)).toBe(true)
      expect(ys.length).toBeGreaterThan(0)
    }
  })

  it('is empty for nothing to draw on', () => {
    expect(gridLines(4, 0, 0)).toEqual({ xs: [], ys: [] })
    expect(gridLines(1, 400, 300).xs).toEqual([])
  })
})

describe('remembering the grid', () => {
  const stored = new Map<string, string>()
  const fakeStorage = {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
  }

  afterEach(() => {
    stored.clear()
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('round-trips', () => {
    Object.assign(globalThis, { localStorage: fakeStorage })
    saveGrid({ on: true, density: 6 })
    expect(loadGrid()).toEqual({ on: true, density: 6 })
  })

  it('falls back to the default for anything it cannot trust', () => {
    Object.assign(globalThis, { localStorage: fakeStorage })
    stored.set('35mm.grid', JSON.stringify({ on: 'yes', density: 7 }))
    expect(loadGrid()).toEqual({ on: false, density: DEFAULT_GRID.density })
    stored.set('35mm.grid', '{not json')
    expect(loadGrid()).toEqual(DEFAULT_GRID)
  })

  it('copes with no storage at all', () => {
    expect(loadGrid()).toEqual(DEFAULT_GRID)
    expect(() => saveGrid({ on: true, density: 3 })).not.toThrow()
  })
})
