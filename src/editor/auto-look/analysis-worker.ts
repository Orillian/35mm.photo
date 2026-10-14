/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web/wasm'
import { imageStats, type ImageStats, type SubjectCoverage } from './stats'
import { softmax } from './scene'

/**
 * The auto look's measurements, off the main thread: the statistics of a
 * small copy of the photo, and — when asked — what a small ImageNet classifier
 * makes of it. Statistics come back in a few milliseconds; the classifier
 * takes longer the first time, when its model is fetched, and the caller
 * shows what it has meanwhile.
 */

interface MeasureRequest {
  kind: 'measure'
  id: number
  rgba: Uint8ClampedArray
  width: number
  height: number
  /** The subject's coverage, in the same orientation as the pixels, or null. */
  subject: SubjectCoverage | null
}

interface ClassifyRequest {
  kind: 'classify'
  id: number
  modelUrl: string
  /** A 224 × 224 centre crop, RGBA. */
  rgba: Uint8ClampedArray
}

type Request = MeasureRequest | ClassifyRequest

export const CLASSIFIER_SIZE = 224

/** ImageNet statistics, which is what the classifier was trained against. */
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

let session: Promise<ort.InferenceSession> | null = null

function load(modelUrl: string): Promise<ort.InferenceSession> {
  if (!session) {
    // See subject-worker.ts for why: the wasm entry keeps the runtime on our
    // own origin, where the service worker can cache it, and a thread count
    // of one avoids a failed probe on hosts that cannot send COOP/COEP.
    ort.env.wasm.numThreads = 1
    ort.env.logLevel = 'error'
    const attempt = ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })
    attempt.catch(() => {
      if (session === attempt) session = null
    })
    session = attempt
  }
  return session
}

self.addEventListener('message', async (event: MessageEvent<Request>) => {
  const { id } = event.data
  try {
    if (event.data.kind === 'measure') {
      const { rgba, width, height, subject } = event.data
      const stats: ImageStats = imageStats(rgba, width, height, subject)
      self.postMessage({ id, ok: true, stats }, [stats.luma.buffer])
      return
    }

    const { modelUrl, rgba } = event.data
    const model = await load(modelUrl)
    const size = CLASSIFIER_SIZE
    const plane = size * size
    const input = new Float32Array(3 * plane)
    for (let i = 0; i < plane; i++) {
      for (let c = 0; c < 3; c++) input[c * plane + i] = (rgba[i * 4 + c] / 255 - MEAN[c]) / STD[c]
    }
    const outputs = await model.run({
      [model.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, size, size]),
    })
    const logits = outputs[model.outputNames[0]].data as Float32Array
    if (!logits || logits.length < 1000) throw new Error('the classifier returned nothing')
    const probs = softmax(logits)
    self.postMessage({ id, ok: true, probs }, [probs.buffer])
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : 'analysis failed' })
  }
})
