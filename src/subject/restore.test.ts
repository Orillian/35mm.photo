import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A subject mask that was found, closed and reopened must come back found.
 * The detector is a worker and the store is IndexedDB, neither of which is
 * here, so both ends are stood in for: what is under test is the plumbing
 * between them — memory first, disk second, the model last.
 */

const store = new Map<string, { data: Uint8ClampedArray; size: number }>()

vi.mock('../storage/indexeddb', () => ({
  subjectKey: (f: string, m: string) => `${f}@${m}`,
  loadSubject: vi.fn(async (frameId: string, model: string) => {
    const hit = store.get(`${frameId}@${model}`)
    return hit ? { key: `${frameId}@${model}`, frameId, model, ...hit, bytes: 0, usedAt: 0 } : null
  }),
  saveSubject: vi.fn(async (r: { frameId: string; model: string; data: Uint8ClampedArray; size: number }) => {
    store.set(`${r.frameId}@${r.model}`, { data: r.data, size: r.size })
  }),
}))

const { cachedSubject, forgetSubjects, foundSubjects, rememberSubject, restoreSubjects } = await import('./detect')
const { createMask } = await import('../editor/edit-stack/masks')
type SubjectMask = import('../editor/edit-stack/types').SubjectMask

const subject = () => createMask('subject', 1.5) as SubjectMask

const map = () => ({ data: new Uint8ClampedArray(4).fill(200), size: 2 })

beforeEach(() => {
  store.clear()
  forgetSubjects()
})

describe('remembering a subject', () => {
  it('writes through to disk', () => {
    rememberSubject('photo', 'model@1', map())
    expect(store.has('photo@model@1')).toBe(true)
  })

  it('can be asked not to, for a map that just came from there', () => {
    rememberSubject('photo', 'model@1', map(), false)
    expect(store.size).toBe(0)
  })
})

describe('reopening a photo', () => {
  it('brings a found mask back from disk after memory has let it go', async () => {
    const mask = subject()
    rememberSubject('photo', mask.model, map())
    forgetSubjects('photo') // what closing the photo does
    expect(cachedSubject('photo', mask.model)).toBeNull()

    const { restored, missing } = await restoreSubjects([mask], 'photo')
    expect(restored).toBe(1)
    expect(missing).toEqual([])
    expect(cachedSubject('photo', mask.model)?.data[0]).toBe(200)
  })

  it('names the masks that were never found, and only those', async () => {
    const found = subject()
    const never = { ...subject(), model: 'other@9' }
    rememberSubject('photo', found.model, map())
    forgetSubjects('photo')

    const { restored, missing } = await restoreSubjects([found, never, createMask('radial', 1.5)], 'photo')
    expect(restored).toBe(1)
    expect(missing.map((m) => (m as SubjectMask).model)).toEqual(['other@9'])
  })

  /**
   * A project file puts its maps in memory *before* the photo opens. Counting
   * those as nothing-to-do left the caller with no reason to prime the
   * refinement, and the open sat on "Applying edits" until it timed out.
   */
  it('counts a map already in memory as restored, so the caller primes it', async () => {
    const mask = subject()
    rememberSubject('photo', mask.model, map(), false)
    const { restored, missing } = await restoreSubjects([mask], 'photo')
    expect(restored).toBe(1)
    expect(missing).toEqual([])
  })

  it('does not touch the disk for a map still in memory', async () => {
    const { loadSubject } = await import('../storage/indexeddb')
    const mask = subject()
    rememberSubject('photo', mask.model, map())
    vi.mocked(loadSubject).mockClear()
    await restoreSubjects([mask], 'photo')
    expect(loadSubject).not.toHaveBeenCalled()
  })
})

describe('the maps a project file carries', () => {
  it('takes what is in memory or on disk, once per model, and skips what was never found', async () => {
    const inMemory = subject()
    const onDisk = { ...subject(), model: 'disk@1' }
    const again = { ...subject(), model: 'disk@1' }
    const never = { ...subject(), model: 'never@1' }
    rememberSubject('photo', inMemory.model, map(), false)
    store.set(`photo@disk@1`, { data: new Uint8ClampedArray(4).fill(9), size: 2 })

    const found = await foundSubjects([inMemory, onDisk, again, never, createMask('radial', 1.5)], 'photo')
    expect(found.map((f) => f.model)).toEqual([inMemory.model, 'disk@1'])
    expect(found[1].map.data[0]).toBe(9)
  })

  it('never runs the detector — saving must not start a model', async () => {
    const found = await foundSubjects([subject()], 'photo')
    expect(found).toEqual([])
  })
})
