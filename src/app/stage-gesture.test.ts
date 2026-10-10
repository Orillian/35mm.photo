import { describe, expect, it } from 'vitest'
import { isMiddleButton, stageGesture, type StagePress } from './stage-gesture'

const press = (over: Partial<StagePress> = {}): StagePress => ({
  pointerType: 'mouse',
  button: 0,
  onCrop: false,
  spaceHeld: false,
  pannable: false,
  cropping: false,
  pointers: 1,
  ...over,
})

describe('the middle mouse button', () => {
  it('pans, whatever the tool and whether or not the picture overflows', () => {
    expect(stageGesture(press({ button: 1 }))).toBe('pan')
    expect(stageGesture(press({ button: 1, pannable: true }))).toBe('pan')
    expect(stageGesture(press({ button: 1, cropping: true }))).toBe('pan')
  })

  it('pans from the crop overlay too, where the left button is the overlay’s', () => {
    expect(stageGesture(press({ button: 1, onCrop: true, cropping: true }))).toBe('pan')
    expect(stageGesture(press({ button: 0, onCrop: true, cropping: true }))).toBe('ignore')
  })

  it('is recognised only on a mouse', () => {
    expect(isMiddleButton({ pointerType: 'mouse', button: 1 })).toBe(true)
    expect(isMiddleButton({ pointerType: 'touch', button: 1 })).toBe(false)
    expect(isMiddleButton({ pointerType: 'mouse', button: 0 })).toBe(false)
  })
})

describe('the rest of the stage', () => {
  it('pans with the left button only once the picture overflows', () => {
    expect(stageGesture(press())).toBe('none')
    expect(stageGesture(press({ pannable: true }))).toBe('pan')
  })

  it('ignores the right button', () => {
    expect(stageGesture(press({ button: 2 }))).toBe('ignore')
    expect(stageGesture(press({ button: 2, pannable: true }))).toBe('ignore')
  })

  it('lets space take the crop overlay’s mouse for panning', () => {
    expect(stageGesture(press({ onCrop: true, cropping: true, spaceHeld: true, pannable: true }))).toBe('pan')
  })

  it('counts a touch on the crop overlay without taking it, so a second finger can pinch', () => {
    expect(stageGesture(press({ pointerType: 'touch', onCrop: true, cropping: true }))).toBe('crop')
    expect(stageGesture(press({ pointerType: 'touch', onCrop: true, cropping: true, pointers: 2 }))).toBe('pinch')
  })

  it('a lone finger with nowhere to pan may be a swipe; while cropping it pans', () => {
    expect(stageGesture(press({ pointerType: 'touch' }))).toBe('swipe')
    expect(stageGesture(press({ pointerType: 'touch', cropping: true }))).toBe('pan')
    expect(stageGesture(press({ pointerType: 'touch', pannable: true }))).toBe('pan')
  })

  it('two pointers pinch, whatever they are', () => {
    expect(stageGesture(press({ pointerType: 'touch', pointers: 2 }))).toBe('pinch')
    expect(stageGesture(press({ pointerType: 'mouse', pointers: 2 }))).toBe('pinch')
  })
})
