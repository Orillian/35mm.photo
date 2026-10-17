import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useEditor } from '../../editor/edit-stack/store'
import {
  IconCurves,
  IconDetail,
  IconDownload,
  IconFrame,
  IconGrade,
  IconGrain,
  IconHistogram,
  IconLens,
  IconLight,
  IconMixer,
  IconSparkle,
  IconSplit,
} from '../ui/icons'
import { markTourSeen } from './preference'
import { RAW_FORMATS, SCENES, TOOLKIT, TOUR_STEPS, clampStep, type TourStep } from './steps'

const src = (name: string) => `${import.meta.env.BASE_URL}tour/${name}`

/**
 * The first-run tour: one chapter per thing worth knowing, each with a picture
 * of it working.
 *
 * Shown once per browser — the store opens it on a first visit and marks it
 * seen as soon as it is, so closing the tab halfway does not bring it back.
 * Help in the top bar replays it.
 */
export function Tour() {
  const open = useEditor((s) => s.tourOpen)
  const setOpen = useEditor((s) => s.setTourOpen)
  const [index, setIndex] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const step = TOUR_STEPS[index]
  const last = index === TOUR_STEPS.length - 1
  const go = useCallback((to: number) => setIndex(clampStep(to)), [])
  const close = useCallback(() => setOpen(false), [setOpen])

  // Seen as soon as it is shown: skipped, finished or abandoned with the tab,
  // it is not offered again.
  // Rewound on the way out, so a replay starts at the start from its first frame.
  useEffect(() => {
    if (open) markTourSeen()
    else setIndex(0)
  }, [open])

  /*
   * Captured, and stopped there: the arrows step through photos and Escape
   * closes tools in the editor underneath, and neither should happen behind
   * the tour.
   */
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const handled =
        e.key === 'Escape' || e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Enter'
      if (!handled) return
      // Enter on a focused button is that button's click; let it be.
      if (e.key === 'Enter' && e.target instanceof HTMLButtonElement) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') setIndex((i) => clampStep(i - 1))
      else setIndex((i) => (i === TOUR_STEPS.length - 1 ? (close(), i) : clampStep(i + 1)))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, close])

  // The next chapter's pictures, fetched while this one is being read.
  useEffect(() => {
    if (!open) return
    for (const name of TOUR_STEPS[index + 1]?.images ?? []) new Image().src = src(name)
  }, [open, index])

  if (!open) return null

  return (
    <div className="modal tour" role="dialog" aria-modal="true" aria-label="A tour of 35mm">
      <div className="modal__scrim tour__scrim" />
      <div className="tour__panel" ref={panelRef} tabIndex={-1}>
        <div className="tour__stage" data-step={step.id}>
          {/* Keyed, so every chapter's animation starts from the top. */}
          <Visual key={step.id} step={step} />
        </div>

        <div className="tour__copy">
          <div className="tour__scroll" key={step.id}>
            <span className="tour__kicker">
              {step.ai && <IconSparkle size={13} />}
              {step.kicker}
              <span className="tour__count mono">
                {index + 1} / {TOUR_STEPS.length}
              </span>
            </span>
            <h2 className="tour__title">{step.title}</h2>
            <p className="tour__body">{step.body}</p>

            {step.ai && (
              <div className="tour__ai">
                <IconSparkle size={15} />
                <span>
                  <strong>On-device AI</strong>
                  <small className="mono">
                    {step.ai.model} · {step.ai.size} · {step.ai.runs}
                  </small>
                </span>
                <span className="tour__ai-note">Fetched once, kept, never uploads a pixel</span>
              </div>
            )}

            {step.points.length > 0 && (
              <ul className="tour__points">
                {step.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}

            {step.keys && (
              <ul className={step.id === 'start' ? 'tour__keys tour__keys--grid' : 'tour__keys'}>
                {step.keys.map((k) => (
                  <li key={k.label}>
                    <span className="tour__caps">
                      {k.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </span>
                    <span>{k.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="tour__footer">
            <ol className="tour__progress" aria-label="Chapters">
              {TOUR_STEPS.map((s, i) => (
                <li key={s.id}>
                  <button
                    className="tour__dot"
                    data-done={i < index || undefined}
                    data-current={i === index || undefined}
                    data-ai={s.ai ? true : undefined}
                    onClick={() => go(i)}
                    aria-label={`${i + 1}: ${s.kicker}`}
                    aria-current={i === index ? 'step' : undefined}
                    title={s.kicker}
                  />
                </li>
              ))}
            </ol>
            <div className="tour__actions">
              {!last && (
                <button className="button tour__skip" onClick={close}>
                  Skip tour
                </button>
              )}
              {index > 0 && (
                <button className="button" onClick={() => go(index - 1)}>
                  Back
                </button>
              )}
              <button
                className="button button--accent tour__next"
                onClick={() => (last ? close() : go(index + 1))}
              >
                {index === 0 ? 'Show me' : last ? 'Start editing' : 'Next'}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

function Visual({ step }: { step: TourStep }) {
  switch (step.id) {
    case 'welcome':
      return <WelcomeVisual />
    case 'looks':
      return <LooksVisual />
    case 'auto':
      return <AutoVisual />
    case 'subject':
      return <SubjectVisual />
    case 'heal':
      return <HealVisual />
    case 'upscale':
      return <UpscaleVisual />
    case 'crop':
      return <CropVisual />
    case 'raw':
      return <RawVisual />
    case 'toolkit':
      return <ToolkitVisual />
    case 'batch':
      return <BatchVisual />
    case 'start':
      return <StartVisual />
  }
}

function WelcomeVisual() {
  return (
    <div className="tv tv-welcome">
      <div className="tv-window">
        <div className="tv-window__bar" aria-hidden>
          <i />
          <i />
          <i />
          <span className="mono">35mm.photo</span>
        </div>
        <img src={src('screenshot.webp')} alt="35mm with a photo of the Grand Canyon open" />
      </div>
      {['No upload', 'No account', 'Works offline', 'Open source'].map((label, i) => (
        <span key={label} className={`tv-badge tv-badge--${i}`}>
          <i aria-hidden />
          {label}
        </span>
      ))}
    </div>
  )
}

/** Stand-ins for the shelves of the looks grid, not the looks themselves. */
const LOOK_SHELVES = [
  { name: 'Slide film', filter: 'saturate(1.45) contrast(1.12)' },
  { name: 'Monochrome', filter: 'grayscale(1) contrast(1.2)' },
  { name: 'Colour negative', filter: 'sepia(0.28) saturate(0.95) brightness(1.06) contrast(0.94)' },
  { name: 'Infrared', filter: 'hue-rotate(170deg) saturate(1.3) brightness(1.08)' },
  { name: 'Cine', filter: 'contrast(1.18) saturate(0.78) hue-rotate(-8deg) brightness(0.96)' },
]

function LooksVisual() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % LOOK_SHELVES.length), 1700)
    return () => window.clearInterval(t)
  }, [])
  const shelf = LOOK_SHELVES[i]

  return (
    <div className="tv tv-looks">
      <figure className="tv-looks__photo">
        <img src={src('canyon.webp')} alt="" style={{ filter: shelf.filter }} />
        <figcaption className="tv-chip tv-chip--accent">{shelf.name}</figcaption>
      </figure>
      <div className="tv-looks__rail" aria-hidden>
        <img src={src('looks.webp')} alt="" />
      </div>
    </div>
  )
}

function AutoVisual() {
  return (
    <div className="tv tv-auto">
      <figure className="tv-frame">
        <img src={src('canyon.webp')} alt="" className="tv-auto__photo" />
        <span className="tv-scan" aria-hidden />
        <span className="tv-corners" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="tv-auto__readout mono" aria-hidden>
          <span>analysing light…</span>
          <span>finding the subject…</span>
          <span>asking the classifier…</span>
        </span>
      </figure>
      <ul className="tv-auto__scenes" aria-hidden>
        {SCENES.map((scene) => (
          <li key={scene} data-hit={scene === 'Landscape' || undefined}>
            {scene}
          </li>
        ))}
      </ul>
      <div className="tv-auto__card">
        <span className="tv-auto__swatch" style={{ backgroundImage: `url(${src('canyon.webp')})` }} />
        <span>
          <strong>
            <IconSparkle size={13} /> Auto
          </strong>
          <small>Built for this photo · landscape</small>
        </span>
        <span className="tv-chip">Apply</span>
      </div>
    </div>
  )
}

function SubjectVisual() {
  return (
    <div className="tv tv-subject">
      <figure className="tv-frame">
        <img src={src('desert.webp')} alt="A woman sitting in sand dunes, with a subject mask over her" />
        <span className="tv-scan" aria-hidden />
        <span className="tv-subject__ring" aria-hidden />
        <span className="tv-subject__tag tv-chip tv-chip--accent" aria-hidden>
          <IconSparkle size={12} /> Subject found
        </span>
      </figure>
      <div className="tv-subject__masks" aria-hidden>
        {['Subject', 'Radial', 'Linear', 'Luminance', 'Colour'].map((m, i) => (
          <span key={m} className={i === 0 ? 'tv-chip tv-chip--accent' : 'tv-chip'}>
            + {m}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Before over after, split by a handle. It sweeps on its own until it is
 * touched, then follows the pointer.
 */
function Compare({
  before,
  after,
  beforeLabel,
  afterLabel,
  pixelated,
}: {
  before: string
  after: string
  beforeLabel: string
  afterLabel: string
  pixelated?: boolean
}) {
  const [at, setAt] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const follow = (e: ReactPointerEvent) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setAt(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)))
  }

  return (
    <div
      ref={ref}
      className="tv-compare"
      data-auto={at === null || undefined}
      style={at === null ? undefined : { ['--at' as string]: `${at}%` }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        follow(e)
      }}
      onPointerMove={(e) => {
        if (e.pointerType === 'mouse' || e.buttons) follow(e)
      }}
    >
      <img src={src(after)} alt={afterLabel} draggable={false} />
      <div className="tv-compare__before">
        <img src={src(before)} alt={beforeLabel} draggable={false} data-pixelated={pixelated || undefined} />
      </div>
      <span className="tv-compare__handle" aria-hidden />
      <span className="tv-chip tv-compare__label tv-compare__label--before">{beforeLabel}</span>
      <span className="tv-chip tv-chip--accent tv-compare__label tv-compare__label--after">{afterLabel}</span>
    </div>
  )
}

function HealVisual() {
  const [which, setWhich] = useState<'canoe' | 'flag'>('canoe')
  return (
    <div className="tv tv-heal">
      <Compare
        key={which}
        before={`${which}-before.webp`}
        after={`${which}-after.webp`}
        beforeLabel="Before"
        afterLabel={which === 'canoe' ? 'Healed' : 'Smart fill'}
      />
      <div className="tv-tabs" role="group" aria-label="Example">
        <button className="tv-tab" data-on={which === 'canoe' || undefined} onClick={() => setWhich('canoe')}>
          A canoe on Lake Louise
        </button>
        <button className="tv-tab" data-on={which === 'flag' || undefined} onClick={() => setWhich('flag')}>
          A flag in the haze
        </button>
      </div>
    </div>
  )
}

function UpscaleVisual() {
  return (
    <div className="tv tv-upscale">
      <Compare
        before="upscale-before.webp"
        after="upscale-after.webp"
        beforeLabel="70 px, stretched"
        afterLabel="×4, Real-ESRGAN"
        pixelated
      />
      <div className="tv-upscale__sizes mono" aria-hidden>
        <span>70 × 35</span>
        <span className="tv-upscale__arrow">→</span>
        <span className="tv-upscale__big">280 × 140</span>
        <span className="tv-chip">WebGPU</span>
      </div>
    </div>
  )
}

function CropVisual() {
  return (
    <div className="tv tv-crop">
      <figure className="tv-frame tv-crop__frame">
        <img src={src('feature-crop.webp')} alt="The crop tool mid-straighten, with handles and a thirds grid" />
        <span className="tv-crop__horizon" aria-hidden />
      </figure>
      <div className="tv-crop__guides" aria-hidden>
        {['Thirds', 'Golden ratio', 'Diagonal', 'Triangle', 'Golden spiral'].map((g, i) => (
          <span key={g} className="tv-chip" style={{ animationDelay: `${i * 0.9}s` }}>
            {g}
          </span>
        ))}
      </div>
    </div>
  )
}

function RawVisual() {
  return (
    <div className="tv tv-raw">
      <div className="tv-raw__grid" aria-hidden>
        {RAW_FORMATS.map((f, i) => (
          <span key={f} className="tv-raw__tile mono" style={{ animationDelay: `${i * 60}ms` }}>
            {f}
          </span>
        ))}
      </div>
      <ol className="tv-raw__flow" aria-label="How a raw is developed">
        <li>
          <strong>Your raw</strong>
          <small>straight off the card</small>
        </li>
        <li>
          <strong>LibRaw</strong>
          <small>in WebAssembly</small>
        </li>
        <li>
          <strong>16-bit</strong>
          <small>develop and demosaic</small>
        </li>
        <li>
          <strong>Lensfun</strong>
          <small>distortion, fringing, vignette</small>
        </li>
      </ol>
    </div>
  )
}

const TOOL_ICONS = {
  light: IconLight,
  curves: IconCurves,
  mixer: IconMixer,
  grade: IconGrade,
  detail: IconDetail,
  lens: IconLens,
  grain: IconGrain,
  frame: IconFrame,
  histogram: IconHistogram,
  split: IconSplit,
}

function ToolkitVisual() {
  return (
    <div className="tv tv-toolkit">
      <ul className="tv-toolkit__grid">
        {TOOLKIT.map((t, i) => {
          const Icon = TOOL_ICONS[t.icon]
          return (
            <li key={t.name} style={{ animationDelay: `${i * 70}ms` }}>
              <span className="tv-toolkit__icon">
                <Icon size={20} />
              </span>
              <span>
                <strong>{t.name}</strong>
                <small>{t.detail}</small>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function BatchVisual() {
  const photos = ['canyon.webp', 'desert.webp', 'canoe-after.webp', 'flag-after.webp']
  return (
    <div className="tv tv-batch">
      <div className="tv-batch__strip" aria-hidden>
        {photos.map((p, i) => (
          <span key={p} className="tv-batch__thumb" data-source={i === 0 || undefined} style={{ animationDelay: `${0.8 + i * 0.35}s` }}>
            <img src={src(p)} alt="" />
            <span className="tv-batch__tick" style={{ animationDelay: `${0.8 + i * 0.35}s` }}>
              ✓
            </span>
          </span>
        ))}
      </div>
      <div className="tv-batch__row" aria-hidden>
        <span className="tv-chip tv-chip--accent">Sync settings → 3 photos</span>
        <span className="tv-chip">
          <IconDownload size={13} /> Export 4
        </span>
      </div>
      <div className="tv-batch__file" aria-hidden>
        <span className="tv-batch__doc mono">.35mm</span>
        <span>
          <strong>canyon.35mm</strong>
          <small>photo + every edit, reopens anywhere</small>
        </span>
      </div>
    </div>
  )
}

function StartVisual() {
  return (
    <div className="tv tv-start">
      <div className="tv-start__drop">
        <span className="tv-start__arrow" aria-hidden>
          ↓
        </span>
        <strong>Drop a photo anywhere</strong>
        <small className="mono">JPEG · PNG · HEIC · WEBP · AVIF · RAW</small>
      </div>
      <ul className="tv-start__ai" aria-label="On-device models">
        {TOUR_STEPS.filter((s) => s.ai).map((s) => (
          <li key={s.id}>
            <IconSparkle size={13} />
            <span>
              <strong>{s.kicker}</strong>
              <small className="mono">{s.ai!.model}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
