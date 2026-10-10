import { describe, expect, it } from 'vitest'
import { defaultEdits } from '../editor/edit-stack/defaults'
import { buildProject, isProjectFile, parseProject } from './project'

describe('.35mm projects', () => {
  const bytes = new Uint8Array([1, 2, 3, 250, 0, 7])
  const source = new File([bytes], 'frame.jpg', { type: 'image/jpeg', lastModified: 1234 })

  it('round-trips the photo byte for byte, with its identity and edits', async () => {
    const edits = { ...defaultEdits(), exposure: 0.5 }
    const { photo, edits: back } = await parseProject(
      new File([buildProject(source, edits)], 'frame.35mm'),
    )
    expect(photo.name).toBe('frame.jpg')
    expect(photo.lastModified).toBe(1234)
    expect(photo.size).toBe(bytes.length)
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(bytes)
    expect(back.exposure).toBe(0.5)
  })

  it('carries subject maps through, and keeps the photo intact beside them', async () => {
    const data = new Uint8ClampedArray([0, 255, 128, 64])
    const { photo, subjects } = await parseProject(
      new File(
        [buildProject(source, defaultEdits(), [{ model: 'm@1', map: { data, size: 2 } }])],
        'f.35mm',
      ),
    )
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(bytes)
    expect(subjects).toHaveLength(1)
    expect(subjects[0].model).toBe('m@1')
    expect(subjects[0].map.size).toBe(2)
    expect(Array.from(subjects[0].map.data)).toEqual([0, 255, 128, 64])
  })

  it('rejects files that are not projects, and truncated ones', async () => {
    await expect(parseProject(new File(['nope nope nope'], 'x.35mm'))).rejects.toThrow()
    const whole = buildProject(source, defaultEdits())
    await expect(parseProject(new File([whole.slice(0, whole.size - 2)], 'x.35mm'))).rejects.toThrow(
      /incomplete/,
    )
  })

  it('recognises the extension', () => {
    expect(isProjectFile('A.35MM')).toBe(true)
    expect(isProjectFile('a.35mm.json')).toBe(false)
  })
})
