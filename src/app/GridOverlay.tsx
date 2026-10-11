import { gridLines } from '../editor/edit-stack/grid'

/**
 * The grid, drawn over the picture (not the mat) and under every tool's
 * overlay. Takes no pointer, so brushing or dragging through it is unaffected.
 */
export function GridOverlay({
  width,
  height,
  left,
  top,
  density,
}: {
  width: number
  height: number
  left: number
  top: number
  density: number
}) {
  const { xs, ys } = gridLines(density, width, height)
  return (
    <svg className="grid-overlay" width={width} height={height} style={{ left, top }} aria-hidden>
      {xs.map((x) => (
        <line key={`x${x}`} className="grid-overlay__line" x1={x} x2={x} y1={0} y2={height} />
      ))}
      {ys.map((y) => (
        <line key={`y${y}`} className="grid-overlay__line" x1={0} x2={width} y1={y} y2={y} />
      ))}
    </svg>
  )
}
