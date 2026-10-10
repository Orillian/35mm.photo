import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The store, driven the way the panels drive it, with everything that needs a
 * browser stood in for: decoding, IndexedDB, the save dialog and the workers.
 * What is under test is the plumbing those panels rely on — opening a project
 * file, saving and overwriting it, adding strokes — which is exactly the kind
 * of thing that has broken quietly before.
 */

const shared = vi.hoisted(() => {
  const records = new Map<string, unknown>()
  const saves: { blob: Blob; name: string; mime: string }[] = []
  const fakeHandle = (name: string) => ({ name, writes: [] as Blob[] }) as unknown as FileSystemFileHandle
  return { records, saves, fakeHandle, writeOk: { value: true } }
})

vi.mock('../../storage/indexeddb', async (orig) => {
  const real = await orig<typeof import('../../storage/indexeddb')>()
  return {
    ...real,
    saveEdits: vi.fn(async (r: { key: string }) => void shared.records.set(r.key, r)),
    loadEdits: vi.fn(async (k: string) => shared.records.get(k) ?? null),
    saveHandle: vi.fn(async () => {}),
    saveThumb: vi.fn(async () => {}),
    recentEdits: vi.fn(async () => []),
  }
})

const bitmap = (width: number, height: number) => ({ width, height, close() {} })

vi.mock('../../io/develop', () => ({
  developFor: vi.fn(async (file: File) => ({
    meta: {
      name: file.name,
      ext: file.name.split('.').pop()?.toLowerCase() ?? '',
      isRaw: false,
      width: 40,
      height: 30,
      orientation: 1,
      bytes: file.size,
    },
    source: bitmap(40, 30),
    preview: bitmap(40, 30),
    sourceIsPreview: false,
  })),
  developFullSource: vi.fn(),
}))

vi.mock('../../io/decode', async (orig) => ({
  ...(await orig<typeof import('../../io/decode')>()),
  makeThumbnail: vi.fn(async () => null),
  previewBitmap: vi.fn(async (b: unknown) => b),
}))

vi.mock('../../upscale/inline', () => ({ prepareUpscale: vi.fn(), upscaleSignature: () => '' }))
vi.mock('../../io/batch-export', () => ({
  canBatchExport: () => false,
  pickExportDirectory: vi.fn(),
  runBatchExport: vi.fn(),
}))
vi.mock('../../lens/resolve', async (orig) => ({
  ...(await orig<typeof import('../../lens/resolve')>()),
  resolveLens: vi.fn(async () => null),
}))
vi.mock('../../retouch/retouch', async (orig) => ({
  ...(await orig<typeof import('../../retouch/retouch')>()),
  planStroke: vi.fn(async () => ({ mode: 'heal', dx: 0.01, dy: 0 })),
  prepareFillModel: vi.fn(),
}))
// The guide is cut from the pixels on a canvas, which is not here; what matters
// is whether the open asks for it at all.
vi.mock('../../subject/detect', async (orig) => ({
  ...(await orig<typeof import('../../subject/detect')>()),
  primeSubjects: vi.fn(),
  isModelCached: vi.fn(async () => false),
}))
vi.mock('../../io/file-system', async (orig) => ({
  ...(await orig<typeof import('../../io/file-system')>()),
  saveBlob: vi.fn(
    async (
      blob: Blob,
      name: string,
      mime: string,
      _ext: string,
      options?: { onHandle?: (h: FileSystemFileHandle) => void },
    ) => {
      shared.saves.push({ blob, name, mime })
      options?.onHandle?.(shared.fakeHandle(name))
      return 'saved' as const
    },
  ),
  writeToHandle: vi.fn(async (handle: FileSystemFileHandle, blob: Blob) => {
    if (!shared.writeOk.value) return false
    ;(handle as unknown as { writes: Blob[] }).writes.push(blob)
    return true
  }),
}))

const { useEditor } = await import('./store')
const { defaultEdits } = await import('./defaults')
const { createMask } = await import('./masks')
const { buildProject, parseProject } = await import('../../io/project')
const { cachedSubject, forgetSubjects, primeSubjects } = await import('../../subject/detect')
const { saveBlob, writeToHandle } = await import('../../io/file-system')
const { planStroke, DEFAULT_STRENGTH } = await import('../../retouch/retouch')
const db = await import('../../storage/indexeddb')
type EditState = import('./types').EditState
type Mask = import('./types').Mask
type SubjectMask = import('./types').SubjectMask

const initial = useEditor.getState()
let serial = 0

/** A fresh photo each time, so no test meets another's cached edits. */
function photoFile(name = `frame-${++serial}.jpg`) {
  return new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7])], name, { type: 'image/jpeg', lastModified: 1000 + serial })
}

function projectFile(source: File, edits: Partial<EditState>, subjects: Parameters<typeof buildProject>[2] = []) {
  const blob = buildProject(source, { ...defaultEdits(), ...edits } as EditState, subjects)
  return new File([blob], source.name.replace(/\.\w+$/, '.35mm'))
}

const lastToast = () => useEditor.getState().toasts.at(-1)?.message

beforeEach(() => {
  useEditor.setState(initial, true)
  shared.records.clear()
  shared.saves.length = 0
  shared.writeOk.value = true
  forgetSubjects()
  vi.mocked(saveBlob).mockClear()
  vi.mocked(writeToHandle).mockClear()
  vi.mocked(primeSubjects).mockClear()
  vi.mocked(planStroke).mockClear()
})

describe('opening a .35mm project', () => {
  it('opens the photo inside it, with the edits it was saved with', async () => {
    const source = photoFile()
    await useEditor.getState().openFiles([{ file: projectFile(source, { exposure: 0.5 }) }])

    const s = useEditor.getState()
    expect(s.frames.map((f) => f.meta.name)).toEqual([source.name])
    expect(s.photo?.file.name).toBe(source.name)
    expect(s.photo?.file.lastModified).toBe(source.lastModified)
    expect(s.edits.exposure).toBe(0.5)
    expect(s.frames[0].editCount).toBeGreaterThan(0)
  })

  it('brings the subject maps along and primes them, so the masks can draw', async () => {
    const source = photoFile()
    const mask = createMask('subject', 1.5) as SubjectMask
    const map = { data: new Uint8ClampedArray(4).fill(180), size: 2 }
    await useEditor.getState().openFiles([
      { file: projectFile(source, { masks: [mask] }, [{ model: mask.model, map }]) },
    ])

    const key = db.fileKey(source)
    expect(cachedSubject(key, mask.model)?.data[0]).toBe(180)
    // This is the one that hung "Applying edits": a map that arrived in memory
    // ahead of the open was never primed, so it never refined, so it never settled.
    expect(primeSubjects).toHaveBeenCalled()
  })

  it('repairs what an older or hand-edited file may carry', async () => {
    const source = photoFile()
    const parent = createMask('radial', 1.5)
    const orphan = { ...createMask('linear', 1.5), within: 'no-such-mask' } as Mask
    const child = { ...createMask('colour', 1.5), within: parent.id } as Mask
    const retouch = [
      { id: 'a', enabled: true, mode: 'blend', points: [0.5, 0.5], size: 0.02, feather: 50, dx: 0, dy: 0 },
      { id: 'b', enabled: true, mode: 'smudge', points: [0.5, 0.5], size: 0.02, feather: 50, dx: 0, dy: 0 },
    ] as unknown as EditState['retouch']
    await useEditor.getState().openFiles([
      { file: projectFile(source, { masks: [parent, orphan, child], retouch }) },
    ])

    const { edits } = useEditor.getState()
    expect(edits.masks.map((m) => m.within)).toEqual([undefined, undefined, parent.id])
    expect(edits.retouch.map((s) => s.id)).toEqual(['a'])
    expect(edits.retouch[0].strength).toBe(DEFAULT_STRENGTH)
  })

  it('a project opened without a handle names no file — there is none to write to', async () => {
    const source = photoFile()
    await useEditor.getState().openFiles([{ file: projectFile(source, { exposure: 0.5 }) }])
    expect(useEditor.getState().frames[0].savedAs).toBeUndefined()
  })

  it('refuses something that is not a project, and says so', async () => {
    await useEditor.getState().openFiles([{ file: new File(['nope'], 'broken.35mm') }])
    expect(useEditor.getState().frames).toEqual([])
    expect(lastToast()).toMatch(/not a 35mm project/)
  })
})

describe('saving', () => {
  async function openPlain(handle?: FileSystemFileHandle) {
    const source = photoFile()
    await useEditor.getState().openFiles([{ file: source, handle }])
    useEditor.getState().update({ exposure: 0.25 }, 'test')
    return source
  }

  it('⌘S with nothing saved yet asks where, and writes a project that opens again', async () => {
    const source = await openPlain()
    await useEditor.getState().saveWork('quick')

    expect(shared.saves.map((s) => s.name)).toEqual([source.name.replace('.jpg', '.35mm')])
    const back = await parseProject(new File([shared.saves[0].blob], 'x.35mm'))
    expect(back.photo.name).toBe(source.name)
    expect(back.edits.exposure).toBe(0.25)
    expect(useEditor.getState().frames[0].unsaved).toBe(false)
    // The top bar names the file ⌘S now writes to.
    expect(useEditor.getState().frames[0].savedAs).toBe(source.name.replace('.jpg', '.35mm'))
  })

  it('⌘S after that overwrites the same file without asking', async () => {
    await openPlain()
    await useEditor.getState().saveWork('quick')
    useEditor.getState().update({ exposure: 1 }, 'test')
    await useEditor.getState().saveWork('quick')

    expect(saveBlob).toHaveBeenCalledTimes(1)
    expect(writeToHandle).toHaveBeenCalledTimes(1)
    const [handle, blob] = vi.mocked(writeToHandle).mock.calls[0]
    expect((handle as unknown as { name: string }).name).toMatch(/\.35mm$/)
    const back = await parseProject(new File([blob], 'x.35mm'))
    expect(back.edits.exposure).toBe(1)
    expect(lastToast()).toMatch(/^Saved .*\.35mm$/)
  })

  it('asks again when the file can no longer be written to', async () => {
    await openPlain()
    await useEditor.getState().saveWork('quick')
    shared.writeOk.value = false
    await useEditor.getState().saveWork('quick')
    expect(saveBlob).toHaveBeenCalledTimes(2)
    // The dialog's new file is the one named, not the one that could not be written.
    expect(useEditor.getState().frames[0].savedAs).toMatch(/\.35mm$/)
  })

  it('follows the format last chosen: a JSON save makes ⌘S rewrite the JSON', async () => {
    await openPlain()
    await useEditor.getState().saveWork('json')
    expect(shared.saves[0].name).toMatch(/\.35mm\.json$/)
    expect(shared.saves[0].mime).toBe('application/json')
    expect(useEditor.getState().frames[0].savedAs).toMatch(/\.35mm\.json$/)

    await useEditor.getState().saveWork('quick')
    const [, blob] = vi.mocked(writeToHandle).mock.calls[0]
    expect(blob.type).toBe('application/json')
    expect(JSON.parse(await blob.text()).edits.exposure).toBe(0.25)
  })

  it('a project opened from disk is what ⌘S writes back to', async () => {
    const source = photoFile()
    const handle = shared.fakeHandle('opened.35mm')
    await useEditor.getState().openFiles([{ file: projectFile(source, { exposure: 0.5 }), handle }])
    await useEditor.getState().saveWork('quick')

    expect(saveBlob).not.toHaveBeenCalled()
    expect(vi.mocked(writeToHandle).mock.calls[0][0]).toBe(handle)
    expect(useEditor.getState().frames[0].savedAs).toBe('opened.35mm')
  })

  it('the explicit menu choices always ask where', async () => {
    await openPlain()
    await useEditor.getState().saveWork('project')
    await useEditor.getState().saveWork('project')
    expect(saveBlob).toHaveBeenCalledTimes(2)
    expect(writeToHandle).not.toHaveBeenCalled()
  })
})

describe('retouch strokes', () => {
  const stroke = { points: [0.5, 0.5, 0.52, 0.5], size: 0.02, feather: 50 }

  it('a heal stroke is planned — somewhere to copy from is found first', async () => {
    await useEditor.getState().openFiles([{ file: photoFile() }])
    await useEditor.getState().addRetouchStroke(stroke)
    expect(planStroke).toHaveBeenCalledTimes(1)
    const [added] = useEditor.getState().edits.retouch
    expect(added.mode).toBe('heal')
    expect(added.dx).toBeCloseTo(0.01, 6)
  })

  it.each(['blend', 'blur'] as const)('a %s stroke needs no plan and keeps the brush strength', async (mode) => {
    await useEditor.getState().openFiles([{ file: photoFile() }])
    useEditor.getState().setRetouchBrush({ mode, strength: 70 })
    await useEditor.getState().addRetouchStroke(stroke)
    expect(planStroke).not.toHaveBeenCalled()
    const [added] = useEditor.getState().edits.retouch
    expect(added).toMatchObject({ mode, strength: 70, dx: 0, dy: 0, enabled: true })
    expect(useEditor.getState().retouchPlanning).toBe(false)
  })
})

describe('masks limited to another', () => {
  it('removing the parent frees the child', async () => {
    await useEditor.getState().openFiles([{ file: photoFile() }])
    const s = useEditor.getState()
    s.addMask('radial')
    s.addMask('linear')
    const [parent, child] = useEditor.getState().edits.masks
    useEditor.getState().updateMask(child.id, { within: parent.id })
    expect(useEditor.getState().edits.masks[1].within).toBe(parent.id)

    useEditor.getState().removeMask(parent.id)
    const { masks } = useEditor.getState().edits
    expect(masks.map((m) => m.id)).toEqual([child.id])
    expect(masks[0].within).toBeUndefined()
  })
})
