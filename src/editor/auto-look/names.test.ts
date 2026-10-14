import { describe, expect, it } from 'vitest'
import { nameFor } from './names'

const t = { warm: false, cool: false, dark: false, bright: false, flat: false, mono: false }

describe('nameFor', () => {
  it('leads with the scene when there is one', () => {
    expect(nameFor(t, 'sunset', { exposure: 0.5 })).toBe('Golden Hour Lift')
    expect(nameFor(t, 'night', { shadows: 12 })).toBe('Night Balance')
  })

  it('otherwise describes the light, then what was done', () => {
    expect(nameFor({ ...t, warm: true }, null, { exposure: 0.6 })).toBe('Warm Lift')
    expect(nameFor({ ...t, cool: true }, null, { contrast: 18 })).toBe('Cool Crisp')
    expect(nameFor({ ...t, dark: true }, null, { vibrance: 20 })).toBe('Low Bloom')
    expect(nameFor({ ...t, flat: true }, null, { exposure: -0.5 })).toBe('Soft Dusk')
    expect(nameFor(t, null, {})).toBe('Clear Balance')
  })

  it('says mono when the look is', () => {
    expect(nameFor({ ...t, mono: true, bright: true }, null, { exposure: 1 })).toBe('High Mono')
  })
})
