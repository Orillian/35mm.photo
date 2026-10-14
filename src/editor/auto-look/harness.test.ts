import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { imageStats } from './stats'
import { buildAutoLook } from './rules'
import { chooseScene, sceneFromClasses, sceneFromStats } from './scene'
import { CLASS_LABEL } from './scene-classes'

/**
 * The rules against real photographs. Skipped unless AUTO_LOOK_HARNESS names a
 * directory written by scripts/auto-look-harness.py, which decodes a list of
 * photos and runs the two models over them, so this can push the real pixels
 * and probabilities through the real code and print what it would decide:
 *
 *   python3 scripts/auto-look-harness.py photos.txt /tmp/harness
 *   AUTO_LOOK_HARNESS=/tmp/harness npx vitest run harness --reporter=basic
 *
 * Judge the calls against the contact sheet it writes beside the dump.
 */
const OUT = process.env.AUTO_LOOK_HARNESS ?? ''

describe.skipIf(!OUT)('auto look over real photographs', () => {
  it('prints what it would decide', () => {
  const manifest = JSON.parse(readFileSync(`${OUT}/manifest.json`, 'utf8')) as {
    key: string; file: string; dir: string; width: number; height: number; iso: number | null; top: number[]; topP: number[]
  }[]
  const rows: string[] = []
  for (const m of manifest) {
    const rgba = new Uint8ClampedArray(readFileSync(`${OUT}/${m.key}.rgba`).buffer)
    const probs = new Float32Array(new Uint8Array(readFileSync(`${OUT}/${m.key}.probs`)).buffer)
    const mask = new Uint8ClampedArray(readFileSync(`${OUT}/${m.key}.mask`).buffer)
    const stats = imageStats(rgba, m.width, m.height, { data: mask, size: 320 })
    const fromStats = sceneFromStats(stats, { iso: m.iso ?? undefined })
    const fromModel = sceneFromClasses(probs)
    const scene = chooseScene(fromStats, fromModel)
    const look = buildAutoLook(stats, scene, { iso: m.iso ?? undefined })
    const top = m.top.slice(0, 3).map((i, k) => `${CLASS_LABEL[i] ?? '#' + i}:${(m.topP[k] * 100).toFixed(0)}`).join(' ')
    rows.push([
      m.key, m.file.padEnd(14).slice(0, 14),
      `stats=${fromStats ? `${fromStats.scene}:${fromStats.confidence.toFixed(2)}` : '-'}`.padEnd(22),
      `model=${fromModel ? `${fromModel.scene}:${fromModel.confidence.toFixed(2)}` : '-'}`.padEnd(22),
      `→ ${scene?.scene ?? '-'}`.padEnd(12),
      `subj=${stats.subject ? `${stats.subject.area.toFixed(2)}/${stats.subject.skin.toFixed(2)}` : '-'} skin=${stats.skin.toFixed(2)} orangeT=${stats.orangeTop.toFixed(2)}/${stats.orangeBottom.toFixed(2)} sky=${stats.skyTop.toFixed(2)} med=${stats.median.toFixed(2)} sat=${stats.saturation.toFixed(2)} warm=${stats.warmth.toFixed(2)}`,
      `| ${look.kind}:${look.name} [${look.lookId}]`, `| ${top}`,
    ].join(' '))
  }
  console.log('\n' + rows.join('\n'))
})
})
