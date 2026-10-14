import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, useRenderEdits } from '../editor/edit-stack/store'
import { applyMat3Point, buildUprightTransform, uprightToStored } from '../editor/gpu/transform'
import { storedSize } from '../lens/resolve'
import type { LensUniforms } from '../lens/uniforms'
import { drawnToContent, type Picture } from '../retouch/geometry'
import { averageLinear, sampleWindow } from '../editor/tools/white-picker'

/** Half the side of the window averaged on a click, in preview pixels. */
const SAMPLE_REACH = 3
/** Half the side of the window the loupe shows, and how big each of its pixels is drawn. */
const LOUPE_REACH = 5
const LOUPE_SCALE = 11
const LOUPE_SIDE = (LOUPE_REACH * 2 + 1) * LOUPE_SCALE
/** How far the loupe sits from the pointer, so the pointer never covers it. */
const LOUPE_OFFSET = 18

/**
 * The white picker's click target: the whole picture, with a crosshair and a
 * loupe. The loupe magnifies the *source* pixels under the pointer — the ones
 * the colour pass starts from and the ones a click averages — so what is read
 * is what is shown. A click reads a small window there and hands its mean to
 * the store; the picker then closes, whatever the answer was. Escape leaves
 * without picking.
 *
 * Acts on pointer-down, not click: the stage takes pointer capture on
 * pointer-down to pan, and a capture moves the click to the stage. Stopping
 * the press here keeps it ours.
 */
export function WhitePickerOverlay({
  width,
  height,
  lens,
}: {
  width: number
  height: number
  lens: LensUniforms
}) {
  const photo = useEditor((s) => s.photo)
  const drawn = useRenderEdits()
  const applyWhitePick = useEditor((s) => s.applyWhitePick)
  const setWbPicking = useEditor((s) => s.setWbPicking)

  const [loupe, setLoupe] = useState<{ x: number; y: number } | null>(null)
  const loupeCanvas = useRef<HTMLCanvasElement>(null)
  const frame = useRef<number | null>(null)

  const meta = photo?.meta
  const picture = useMemo<Picture | null>(() => {
    if (!meta) return null
    const [storedWidth, storedHeight] = storedSize(meta)
    return { orientation: meta.orientation, storedWidth, storedHeight }
  }, [meta])
  const toUpright = useMemo(
    () => (meta ? buildUprightTransform(meta.width, meta.height, drawn.crop, drawn.perspective) : null),
    [meta, drawn.crop, drawn.perspective],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWbPicking(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [setWbPicking])

  if (!photo || !meta || !picture || !toUpright || !width || !height) return null

  /** The preview pixel under a pointer position. The preview is the stored pixels at preview size. */
  const pixelUnder = (event: { clientX: number; clientY: number }, rect: DOMRect) => {
    const [du, dv] = applyMat3Point(
      toUpright,
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    )
    const [cu, cv] = drawnToContent(du, dv, lens, picture)
    const [su, sv] = uprightToStored(cu, cv, meta.orientation)
    return { x: su * photo.preview.width, y: sv * photo.preview.height }
  }

  const svgRect = (el: SVGRectElement) => (el.ownerSVGElement ?? el).getBoundingClientRect()

  const onPointerDown = (event: React.PointerEvent<SVGRectElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const source = photo.preview
    const { x, y } = pixelUnder(event, svgRect(event.currentTarget))
    const { x0, y0, side } = sampleWindow(x, y, source.width, source.height, SAMPLE_REACH)

    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(side, side)
        : Object.assign(document.createElement('canvas'), { width: side, height: side })
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!ctx) return
    ctx.drawImage(source, x0, y0, side, side, 0, 0, side, side)
    applyWhitePick(averageLinear(ctx.getImageData(0, 0, side, side).data))
  }

  const onPointerMove = (event: React.PointerEvent<SVGRectElement>) => {
    const rect = svgRect(event.currentTarget)
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    const { x, y } = pixelUnder(event, rect)
    // Once a frame: the pointer reports faster than the screen shows.
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const canvas = loupeCanvas.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const source = photo.preview
        const { x0, y0, side } = sampleWindow(x, y, source.width, source.height, LOUPE_REACH)
        ctx.imageSmoothingEnabled = false
        ctx.clearRect(0, 0, LOUPE_SIDE, LOUPE_SIDE)
        ctx.drawImage(source, x0, y0, side, side, 0, 0, LOUPE_SIDE, LOUPE_SIDE)
      }
      // Beside the pointer, flipping to the other side near an edge.
      const left = px + LOUPE_OFFSET + LOUPE_SIDE > width ? px - LOUPE_OFFSET - LOUPE_SIDE : px + LOUPE_OFFSET
      const top = py + LOUPE_OFFSET + LOUPE_SIDE > height ? py - LOUPE_OFFSET - LOUPE_SIDE : py + LOUPE_OFFSET
      setLoupe({ x: Math.max(0, left), y: Math.max(0, top) })
    })
  }

  return (
    <>
      <svg className="white-picker" width={width} height={height} aria-label="Click something that should be neutral">
        <rect
          className="white-picker__target"
          width={width}
          height={height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setLoupe(null)}
        />
      </svg>
      {loupe && (
        <div className="white-picker__loupe" style={{ left: loupe.x, top: loupe.y }} aria-hidden>
          <canvas ref={loupeCanvas} width={LOUPE_SIDE} height={LOUPE_SIDE} />
          <span className="white-picker__loupe-centre" style={{ width: LOUPE_SCALE, height: LOUPE_SCALE }} />
        </div>
      )}
    </>
  )
}
