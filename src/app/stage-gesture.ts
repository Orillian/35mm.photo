/**
 * What a pointer going down on the stage starts.
 *
 * Pulled out of the viewport so the rule lives in one place and can be tested
 * — every overlay used to decide for itself what a button meant, and the
 * middle button fell between them: not a paint, not a drag, not a pan. Now it
 * is one thing everywhere: **the middle mouse button pans**, whatever tool is
 * open, on the crop overlay too, and whether or not the picture overflows —
 * the hand you reach for while a brush or a handle has the left button.
 */

export interface StagePress {
  pointerType: string
  /** 0 left, 1 middle, 2 right. Meaningless for touch and pen. */
  button: number
  /** Landed on the crop overlay, which owns a mouse there unless space is held. */
  onCrop: boolean
  spaceHeld: boolean
  /** The picture overflows the stage, with nothing in the way of scrolling it. */
  pannable: boolean
  cropping: boolean
  /** Pointers down, counting this one. */
  pointers: number
}

export type StageGesture =
  /** Not the stage's: left to an overlay, or a button nothing here uses. */
  | 'ignore'
  | 'pinch'
  /** A touch on the crop overlay: counted, so a second finger can pinch, but not taken. */
  | 'crop'
  | 'pan'
  /** A lone finger with nowhere to pan: may turn out to be a flick to the next photo. */
  | 'swipe'
  | 'none'

export function isMiddleButton(p: { pointerType: string; button: number }): boolean {
  return p.pointerType === 'mouse' && p.button === 1
}

export function stageGesture(p: StagePress): StageGesture {
  const mouse = p.pointerType === 'mouse'
  const middle = isMiddleButton(p)
  const cropOwnsIt = p.onCrop && !p.spaceHeld

  // A mouse on the crop overlay is the overlay's — except the middle button,
  // which the overlay never uses, so it pans from there as from anywhere.
  if (cropOwnsIt && mouse && !middle) return 'ignore'
  if (mouse && p.button !== 0 && !middle) return 'ignore'

  if (p.pointers === 2) return 'pinch'
  if (cropOwnsIt && !middle) return 'crop'

  // While cropping, a lone finger outside the frame pans the view — on a
  // phone, the one way to reach a handle the zoom has pushed off screen.
  const canPan = p.pannable || p.cropping || middle
  if (p.pointers === 1 && canPan) return 'pan'
  // Only a lone finger on a picture that has nowhere to pan can be a swipe.
  if (p.pointers === 1 && !mouse) return 'swipe'
  return 'none'
}
