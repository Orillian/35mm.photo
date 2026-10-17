/**
 * What the first-run tour says, one chapter per step.
 *
 * Kept apart from the component so the copy can be read, and checked, without
 * React: every picture a step names has to be in `public/tour/`, and every
 * on-device model has to be introduced somewhere.
 */

export type TourVisual =
  | 'welcome'
  | 'looks'
  | 'auto'
  | 'subject'
  | 'heal'
  | 'upscale'
  | 'crop'
  | 'raw'
  | 'toolkit'
  | 'batch'
  | 'start'

export interface TourStep {
  id: TourVisual
  /** The small line over the title: where in the app this lives. */
  kicker: string
  title: string
  body: string
  points: string[]
  /** The on-device model behind it, for the steps that are AI. */
  ai?: { model: string; size: string; runs: string }
  /** The key that gets there, when there is one. */
  keys?: { keys: string[]; label: string }[]
  /** Files under `public/tour/` the visual draws. */
  images: string[]
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    kicker: 'Welcome to 35mm',
    title: 'A real photo editor, right in this tab',
    body:
      'Camera raw, film looks, AI masks and a healing brush — developed, graded and exported ' +
      'in your browser. A minute here shows you what it can do; skip whenever you like.',
    points: [
      'Your photos never leave this machine — there is no server to send them to',
      'Every edit stays a setting, so it stays adjustable, and the original is never touched',
      'No account, nothing to install, and once loaded it works offline',
    ],
    images: ['screenshot.webp'],
  },
  {
    id: 'looks',
    kicker: 'Looks',
    title: 'Thirty-two looks, previewed on your photo',
    body:
      'Not a strip of somebody else’s sample image: every swatch is rendered from the photo you ' +
      'have open, through the same pipeline that exports it. What you pick is what you get.',
    points: [
      'Slide film, reportage, colour negative, cine and monochrome',
      'An exotic shelf: infrared, cross-processing, solarisation',
      'Drop in your own .cube LUTs and Lightroom .xmp or .lrtemplate presets',
    ],
    keys: [{ keys: ['[', ']'], label: 'cycle looks' }],
    images: ['looks.webp', 'canyon.webp'],
  },
  {
    id: 'auto',
    kicker: 'Auto look',
    title: 'A look built for each photo as it opens',
    body:
      'As a photo opens, 35mm reads its light, finds its subject and asks a small scene ' +
      'classifier what it is of. The look it builds for that picture waits at the top of Looks.',
    points: [
      'Knows food, street, interiors, landscapes, snow, beaches and portraits — and what to leave alone',
      'Sunsets and night are read from the picture itself',
      'An offer, not an edit, until you click it — and every value stays editable',
    ],
    ai: { model: 'MobileNetV2', size: '3.7 MB', runs: 'on your CPU' },
    images: ['canyon.webp'],
  },
  {
    id: 'subject',
    kicker: 'Masks',
    title: 'Mask the subject in one click',
    body:
      'An AI model finds what the photograph is of, then a guided filter re-cuts its answer along ' +
      'the edges already in the picture — hair and all. Brighten the person, cool the background.',
    points: [
      'Radial, linear, luminance and colour-range masks too',
      'Each mask has its own light, colour and detail controls',
      'Limit one mask by another, or invert it',
    ],
    ai: { model: 'U²-Netp', size: '2.3 MB', runs: 'on your CPU' },
    keys: [{ keys: ['M'], label: 'masks' }],
    images: ['desert.webp'],
  },
  {
    id: 'heal',
    kicker: 'Retouch',
    title: 'Brush it away — sensor dust to a whole canoe',
    body:
      'Paint over what should not be there. 35mm finds a patch that matches and blends it in. ' +
      'When a heal would smear an edge, smart fill hands the stroke to an inpainting model instead.',
    points: [
      'Every heal is scored for whether it will hold',
      'Each spot is listed: switch it off, delete it, or flip heal and fill by hand',
      'Drag across the picture to compare',
    ],
    ai: { model: 'MI-GAN', size: '14.2 MB', runs: 'on your CPU' },
    keys: [{ keys: ['Q'], label: 'retouch' }],
    images: ['canoe-before.webp', 'canoe-after.webp', 'flag-before.webp', 'flag-after.webp'],
  },
  {
    id: 'upscale',
    kicker: 'Upscale',
    title: 'Small photos, made big enough',
    body:
      'Open a photo under 2000 px and 35mm offers to enlarge it ×2 or ×4 with a super-resolution ' +
      'model on your own graphics card. It runs on the crop, so a small corner of a big photo works too.',
    points: [
      'The sharp side really is the model’s work, from a 70 px crop',
      'Tiled with overlap, so the seams never show',
      'The last stage of the stack: ⌘Z takes it back off',
    ],
    ai: { model: 'Real-ESRGAN', size: '4.9 MB', runs: 'on your GPU' },
    images: ['upscale-before.webp', 'upscale-after.webp'],
  },
  {
    id: 'crop',
    kicker: 'Crop',
    title: 'Crop and straighten that stay anchored',
    body:
      'Drag inside the frame to move the photo under it, the handles to reshape it, outside to ' +
      'turn it — or draw along the horizon to level it in one stroke.',
    points: [
      'Guides from thirds to the golden spiral; lock an aspect or turn it on its side',
      'Fix converging verticals in Optics',
      'Masks and heals are pinned to the picture, so re-cropping never knocks them off',
    ],
    keys: [{ keys: ['C'], label: 'crop' }],
    images: ['feature-crop.webp'],
  },
  {
    id: 'raw',
    kicker: 'Camera raw',
    title: 'Raw files, developed in the browser',
    body:
      'LibRaw, compiled to WebAssembly, develops your camera’s raw files with a 16-bit pipeline — ' +
      'and lenses are corrected from the Lensfun database, matched to the camera and lens in the file.',
    points: [
      'RAF, CR3, NEF, ARW, DNG, ORF, RW2 and dozens more',
      'iPhone HEIC opens too, in browsers that cannot do it themselves',
      'White balance basis, demosaic, highlight recovery and noise reduction are yours to set',
    ],
    images: [],
  },
  {
    id: 'toolkit',
    kicker: 'The panels',
    title: 'Everything else a photographer reaches for',
    body:
      'The right rail holds the full set — from exposure to halation — graded on your GPU and ' +
      'shown live, with nothing baked into the pixels until you export.',
    points: [
      'Dynamic range reads around each pixel, so a face in shadow opens without the sky',
      'Every slider resets on a double-click and takes a typed number',
      'An eye on each applied edit switches it off without losing it',
    ],
    keys: [{ keys: ['\\'], label: 'before / after' }],
    images: [],
  },
  {
    id: 'batch',
    kicker: 'Batch and projects',
    title: 'A whole shoot, not just one frame',
    body:
      'Open a folder and the filmstrip fills with it. Edit one photo, sync its settings — by ' +
      'group — across a selection, and export the lot into one folder.',
    points: [
      'Copy and paste settings between photos',
      'A .35mm project keeps the photo and its edits together, to reopen anywhere',
      'Edits alone save as a preset for any photo',
    ],
    keys: [
      { keys: ['⌘', 'C'], label: 'copy settings' },
      { keys: ['⌘', 'V'], label: 'paste' },
    ],
    images: ['canyon.webp', 'desert.webp', 'canoe-after.webp', 'flag-after.webp'],
  },
  {
    id: 'start',
    kicker: 'You’re set',
    title: 'Drop a photo to start',
    body:
      'That is the tour. It will not appear again, but it is always under the help button in the top ' +
      'bar. A few keys worth knowing:',
    points: [],
    keys: [
      { keys: ['⌘', 'O'], label: 'open photos' },
      { keys: ['⌘', 'Z'], label: 'undo' },
      { keys: ['⌘', 'S'], label: 'save' },
      { keys: ['⌘', 'E'], label: 'export' },
      { keys: ['←', '→'], label: 'previous / next photo' },
      { keys: ['F'], label: 'fit to window' },
    ],
    images: [],
  },
]

/** The panel tiles on the toolkit step. */
export const TOOLKIT = [
  { icon: 'light', name: 'Light', detail: 'Exposure to blacks, and dynamic range' },
  { icon: 'curves', name: 'Tone curves', detail: 'RGB and per channel' },
  { icon: 'mixer', name: 'Colour mixer', detail: 'Hue, saturation, luminance × 8' },
  { icon: 'grade', name: 'Colour grading', detail: 'Shadows, mids, highlights' },
  { icon: 'detail', name: 'Detail', detail: 'Texture, clarity, dehaze, noise' },
  { icon: 'lens', name: 'Optics', detail: 'Lens profiles and keystone' },
  { icon: 'grain', name: 'Film', detail: 'Halation, grain, vignette, glow' },
  { icon: 'frame', name: 'Frames', detail: 'A mat, in percent or pixels' },
  { icon: 'histogram', name: 'Histogram', detail: 'Live, with RGB parade' },
  { icon: 'split', name: 'Before / after', detail: 'A split you can drag' },
] as const

/** The tiles on the raw step: the formats people most often arrive with. */
export const RAW_FORMATS = ['RAF', 'CR3', 'NEF', 'ARW', 'DNG', 'ORF', 'RW2', 'PEF', 'SRW', 'CR2', 'HEIC', '3FR']

/** What the auto look's scanner cycles through on its step. */
export const SCENES = ['Landscape', 'Portrait', 'Street', 'Food', 'Snow', 'Sunset', 'Night', 'Beach']

/** A step's index, clamped into the tour. */
export function clampStep(index: number): number {
  if (!Number.isFinite(index)) return 0
  return Math.min(TOUR_STEPS.length - 1, Math.max(0, Math.trunc(index)))
}
