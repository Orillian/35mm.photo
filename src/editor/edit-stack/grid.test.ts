import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_GRID, gridLines, loadGrid, saveGrid } from './grid'

describe('gridLines', () => {
  it('puts density − 1 lines across, evenly', () => {
    expect(gridLines(4, 400, 300).xs).toEqual([100, 200, 300])
    expect(gridLines(2, 400, 300).xs).toEqual([200])
  })

  it('keeps the cells square, so the rows follow the width', () => {
    const { ys } = gridLines(4, 400, 300)
    expect(ys).toEqual([100, 200])
    // A tall frame gets more rows than columns.
    expect(gridLines(3, 300, 900).ys).toEqual([100, 200, 300, 400, 500, 600, 700, 800])
  })

  it('draws no line along the bottom edge itself', () => {
    expect(gridLines(4, 400, 200).ys).toEqual([100])
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
