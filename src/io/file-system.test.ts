import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveBlob, writeToHandle } from './file-system'

/**
 * The save dialog and the download are browser affairs, stood in for here.
 * What is under test is what happens when a write goes wrong halfway: the
 * stream must be abandoned rather than closed, so no empty file is left with
 * the right name and nothing in it — which is how a project once came back as
 * zero bytes.
 */

function fakeFs(write: () => Promise<void>) {
  const writable = { write: vi.fn(write), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) }
  const handle = {
    name: 'x.35mm',
    createWritable: vi.fn(async () => writable),
    requestPermission: vi.fn(async () => 'granted'),
  }
  const anchor = { click: vi.fn(), remove: vi.fn(), style: {}, href: '', download: '' }
  Object.assign(globalThis, {
    window: { showSaveFilePicker: vi.fn(async () => handle) },
    document: { createElement: vi.fn(() => anchor), body: { append: vi.fn() } },
  })
  return { writable, handle, anchor }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
  delete (globalThis as { document?: unknown }).document
})

const blob = new Blob(['hello'])

describe('saveBlob', () => {
  it('writes through the dialog and hands the chosen file back for later saves', async () => {
    const { writable, handle } = fakeFs(async () => {})
    const onHandle = vi.fn()
    expect(await saveBlob(blob, 'x.35mm', 'application/octet-stream', '35mm', { onHandle })).toBe('saved')
    expect(writable.close).toHaveBeenCalled()
    expect(onHandle).toHaveBeenCalledWith(handle)
  })

  it('abandons a failed write and falls back to a download, remembering nothing', async () => {
    const { writable, anchor } = fakeFs(async () => {
      throw new Error('disk full')
    })
    const onHandle = vi.fn()
    expect(await saveBlob(blob, 'x.35mm', 'application/octet-stream', '35mm', { onHandle })).toBe('downloaded')
    expect(writable.abort).toHaveBeenCalled()
    expect(writable.close).not.toHaveBeenCalled()
    expect(onHandle).not.toHaveBeenCalled()
    expect(anchor.click).toHaveBeenCalled()
  })

  it('reports a cancelled dialog as cancelled, not as a download', async () => {
    fakeFs(async () => {})
    ;(globalThis as { window: { showSaveFilePicker: unknown } }).window.showSaveFilePicker = async () => {
      throw new DOMException('cancelled', 'AbortError')
    }
    expect(await saveBlob(blob, 'x.35mm', 'application/octet-stream', '35mm')).toBe('cancelled')
  })
})

describe('writeToHandle', () => {
  it('abandons a failed write so the file is not truncated', async () => {
    const { writable, handle } = fakeFs(async () => {
      throw new Error('gone')
    })
    expect(await writeToHandle(handle as unknown as FileSystemFileHandle, blob)).toBe(false)
    expect(writable.abort).toHaveBeenCalled()
    expect(writable.close).not.toHaveBeenCalled()
  })

  it('refuses without permission, touching nothing', async () => {
    const { writable, handle } = fakeFs(async () => {})
    handle.requestPermission.mockResolvedValue('denied')
    expect(await writeToHandle(handle as unknown as FileSystemFileHandle, blob)).toBe(false)
    expect(handle.createWritable).not.toHaveBeenCalled()
    expect(writable.write).not.toHaveBeenCalled()
  })
})
