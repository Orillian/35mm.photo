/**
 * The grid overlay: a lattice of square cells over the picture, for lining
 * things up. A viewing aid, not an edit — it reaches no export and lives with
 * the other viewport preferences in localStorage, like the crop guide.
 */

export interface GridSettings {
  on: boolean
  /** Cells across the picture's width. Cells are square, so the rows follow. */
  density: number
}

export const GRID_DENSITIES = [2, 3, 4, 6, 8, 12] as const

export const DEFAULT_GRID: GridSettings = { on: false, density: 4 }

/**
 * Where the lines fall, in pixels of a `width` × `height` picture. Square
 * cells, `density` of them across; down the side as many as fit, so the last
 * row may be cut short rather than the cells being stretched to fit.
 */
export function gridLines(density: number, width: number, height: number): { xs: number[]; ys: number[] } {
  const n = Math.max(1, Math.round(density))
  if (!(width > 0) || !(height > 0)) return { xs: [], ys: [] }
  const cell = width / n
  const xs: number[] = []
  for (let i = 1; i < n; i++) xs.push(i * cell)
  const ys: number[] = []
  for (let y = cell; y < height - 0.5; y += cell) ys.push(y)
  return { xs, ys }
}

const KEY = '35mm.grid'

export function loadGrid(): GridSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GridSettings>
      const density = (GRID_DENSITIES as readonly number[]).includes(parsed.density as number)
        ? (parsed.density as number)
        : DEFAULT_GRID.density
      return { on: parsed.on === true, density }
    }
  } catch {
    // Fall through to the default.
  }
  return { ...DEFAULT_GRID }
}

export function saveGrid(grid: GridSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(grid))
  } catch {
    // The choice holds for this session.
  }
}
