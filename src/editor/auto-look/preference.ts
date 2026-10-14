/** Whether a photo is looked at on opening. On unless switched off. */
const KEY = '35mm.autoLook'

export function loadAutoLookOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export function saveAutoLookOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // The choice holds for this session.
  }
}
