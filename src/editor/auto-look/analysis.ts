import type { Orientation } from '../../io/exif'
import type { ImageStats, SubjectCoverage } from './stats'
import { sceneFromClasses, type SceneGuess } from './scene'
import { uprightToStored } from '../gpu/transform'
import { DETECT_VERSION, subjectFor } from '../../subject/detect'

/**
 * Main-thread side of the analysis: a small upright copy of the photo is cut
 * on a canvas and handed to the worker, which measures it and — separately,
 * since it may have to fetch its model first — classifies it.
 */

/** Long edge of the copy the statistics are read from. */
export const ANALYSIS_EDGE = 256
export const CLASSIFIER_SIZE = 224

export function sceneModelUrl(): string {
  return new URL('models/mobilenetv2-12-int8.onnx', new URL(import.meta.env.BASE_URL, self.location.href)).href
}

/** Whether the classifier has been fetched already, so running it costs no download. */
export async function isSceneModelCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  try {
    return Boolean(await caches.match(sceneModelUrl()))
  } catch {
    return false
  }
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }

let worker: Worker | null = null
let next = 1
const pending = new Map<number, Pending>()

function call<T>(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
  if (!worker) {
    const w = new Worker(new URL('./analysis-worker.ts', import.meta.url), { type: 'module' })
    w.addEventListener('message', (event: MessageEvent) => {
      const { id, ok, error, ...rest } = event.data
      const job = pending.get(id)
      if (!job) return
      pending.delete(id)
      if (ok) job.resolve(rest)
      else job.reject(new Error(error))
    })
    w.addEventListener('error', () => {
      for (const job of pending.values()) job.reject(new Error('the analysis worker stopped'))
      pending.clear()
      worker?.terminate()
      worker = null
    })
    worker = w
  }
  const id = next++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    worker!.postMessage({ ...message, id }, transfer)
  })
}

function canvasOf(width: number, height: number) {
  return typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height })
}

function context(canvas: OffscreenCanvas | HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) throw new Error('this browser has no 2D canvas')
  return ctx
}

/**
 * The photo upright, at `longEdge`, as RGBA. The preview is the pixels as
 * stored, before the EXIF turn; the "top half" the rules look at is the top
 * of the picture as seen, so the turn is applied here.
 */
export function uprightCopy(
  source: ImageBitmap,
  orientation: Orientation,
  longEdge: number,
): { rgba: Uint8ClampedArray; width: number; height: number } {
  const swap = orientation >= 5
  const sw = source.width
  const sh = source.height
  const scale = longEdge / Math.max(sw, sh)
  const dw = Math.max(1, Math.round(sw * scale))
  const dh = Math.max(1, Math.round(sh * scale))
  const width = swap ? dh : dw
  const height = swap ? dw : dh

  const canvas = canvasOf(width, height)
  const ctx = context(canvas)
  ctx.save()
  // The standard EXIF cases, as a transform of the drawing surface.
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, width, 0); break
    case 3: ctx.transform(-1, 0, 0, -1, width, height); break
    case 4: ctx.transform(1, 0, 0, -1, 0, height); break
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break
    case 6: ctx.transform(0, 1, -1, 0, width, 0); break
    case 7: ctx.transform(0, -1, -1, 0, width, height); break
    case 8: ctx.transform(0, -1, 1, 0, 0, height); break
    default: break
  }
  ctx.drawImage(source, 0, 0, dw, dh)
  ctx.restore()
  return { rgba: ctx.getImageData(0, 0, width, height).data, width, height }
}

/** A square centre crop of an upright copy, at the classifier's size. */
export function centreSquare(
  copy: { rgba: Uint8ClampedArray; width: number; height: number },
  size: number,
): Uint8ClampedArray {
  const canvas = canvasOf(size, size)
  const ctx = context(canvas)
  const side = Math.min(copy.width, copy.height)
  const sx = Math.floor((copy.width - side) / 2)
  const sy = Math.floor((copy.height - side) / 2)
  const image = new ImageData(copy.rgba.slice(), copy.width, copy.height)
  const stage = canvasOf(copy.width, copy.height)
  context(stage).putImageData(image, 0, 0)
  ctx.drawImage(stage, sx, sy, side, side, 0, 0, size, size)
  return ctx.getImageData(0, 0, size, size).data
}

/**
 * The statistics of the photo, in a few milliseconds — with the subject's
 * coverage folded in when a map is given, which is what tells a portrait from
 * a beige wall.
 */
export async function measure(
  source: ImageBitmap,
  orientation: Orientation,
  subject: SubjectCoverage | null = null,
): Promise<ImageStats> {
  const copy = uprightCopy(source, orientation, ANALYSIS_EDGE)
  const transfer: Transferable[] = [copy.rgba.buffer]
  const map = subject ? uprightMap(subject, orientation) : null
  if (map) transfer.push(map.data.buffer)
  const { stats } = await call<{ stats: ImageStats }>(
    { kind: 'measure', rgba: copy.rgba, width: copy.width, height: copy.height, subject: map },
    transfer,
  )
  return stats
}

/**
 * The detector's map is cut from the pixels as stored, before the EXIF turn;
 * the statistics are read upright. Resample the map so the two line up — a
 * copy, since the original is the session's cache for the subject masks.
 */
export function uprightMap(subject: SubjectCoverage, orientation: Orientation): SubjectCoverage {
  const { size } = subject
  if (orientation === 1) return { data: subject.data.slice(), size }
  const data = new Uint8ClampedArray(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [su, sv] = uprightToStored((x + 0.5) / size, (y + 0.5) / size, orientation)
      const sx = Math.min(size - 1, Math.max(0, Math.floor(su * size)))
      const sy = Math.min(size - 1, Math.max(0, Math.floor(sv * size)))
      data[y * size + x] = subject.data[sy * size + sx]
    }
  }
  return { data, size }
}

/**
 * Where the subject is, from the detector the masks use — and cached for them,
 * so a subject mask added later finds it already found. Null where the
 * detector cannot run; the rules manage without it.
 */
export async function locateSubject(frameId: string, source: ImageBitmap): Promise<SubjectCoverage | null> {
  try {
    const map = await subjectFor(frameId, DETECT_VERSION, source)
    return { data: map.data, size: map.size }
  } catch (err) {
    console.warn('[35mm] the subject detector could not run for the auto look', err)
    return null
  }
}

/**
 * What the classifier makes of the photo, or null where it cannot run — no
 * model yet and no network, say. Never throws: the rules work without it.
 */
export async function classify(source: ImageBitmap, orientation: Orientation): Promise<SceneGuess | null> {
  try {
    const copy = uprightCopy(source, orientation, ANALYSIS_EDGE)
    const square = centreSquare(copy, CLASSIFIER_SIZE)
    const { probs } = await call<{ probs: Float32Array }>(
      { kind: 'classify', modelUrl: sceneModelUrl(), rgba: square },
      [square.buffer],
    )
    return sceneFromClasses(probs)
  } catch (err) {
    console.warn('[35mm] the scene classifier could not run', err)
    return null
  }
}

export function disposeAnalysis(): void {
  worker?.terminate()
  worker = null
  pending.clear()
}
