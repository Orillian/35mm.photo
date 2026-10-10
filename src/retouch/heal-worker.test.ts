import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The worker's message dispatch, run on the main thread with a stand-in for
 * `self`. The arithmetic behind each request has its own tests in heal.test.ts;
 * this is about the envelope — that every kind of request gets an answer with
 * its id on it, including the ones added after the first.
 */

type Message = { id: number; ok: boolean; patch?: { width: number; height: number } | null; plan?: unknown; error?: string }

const posted: Message[] = []
let receive: ((event: { data: unknown }) => void) | null = null

beforeAll(async () => {
  Object.assign(globalThis, {
    self: {
      addEventListener: (_: string, fn: (event: { data: unknown }) => void) => {
        receive = fn
      },
      postMessage: (message: Message) => {
        posted.push(message)
      },
    },
  })
  await import('./heal-worker')
})

function field(width: number, height: number) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < rgba.length; i += 4) {
    const v = 100 + ((i / 4) % 7) * 10
    rgba[i] = v
    rgba[i + 1] = v
    rgba[i + 2] = v
    rgba[i + 3] = 255
  }
  return rgba
}

function send(data: Record<string, unknown>): Message {
  posted.length = 0
  receive!({ data })
  expect(posted).toHaveLength(1)
  return posted[0]
}

const brush = { points: [20, 20], radius: 6, feather: 0.5 }

describe('heal worker', () => {
  it('answers a heal with a patch the size of the brush', () => {
    const reply = send({ kind: 'heal', id: 1, rgba: field(40, 40), width: 40, height: 40, brush, dx: 10, dy: 0 })
    expect(reply).toMatchObject({ id: 1, ok: true })
    expect(reply.patch?.width).toBeGreaterThan(0)
  })

  it('answers a blend the same way', () => {
    const reply = send({ kind: 'smooth', id: 2, strength: 60, rgba: field(40, 40), width: 40, height: 40, brush })
    expect(reply).toMatchObject({ id: 2, ok: true })
    expect(reply.patch?.width).toBeGreaterThan(0)
    expect(reply.patch?.height).toBeGreaterThan(0)
  })

  it('answers a plan', () => {
    const reply = send({ kind: 'plan', id: 3, rgba: field(60, 60), width: 60, height: 60, brush })
    expect(reply).toMatchObject({ id: 3, ok: true })
    expect(reply).toHaveProperty('plan')
  })

  it('reports a bad request under its id rather than staying silent', () => {
    const reply = send({ kind: 'heal', id: 4, rgba: null, width: 40, height: 40, brush, dx: 0, dy: 0 })
    expect(reply.id).toBe(4)
    expect(reply.ok).toBe(false)
    expect(typeof reply.error).toBe('string')
  })
})
