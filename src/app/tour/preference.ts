/**
 * Whether this browser has been shown the tour.
 *
 * Kept as the version seen rather than a flag, so a tour that gains a chapter
 * worth showing can be bumped and shown once more; a tweak to the copy should
 * not bump it. Seen counts as seen whether it was finished or skipped.
 */
const KEY = '35mm.tour'
export const TOUR_VERSION = 1

export function tourSeen(): boolean {
  try {
    const stored = Number(localStorage.getItem(KEY))
    return Number.isFinite(stored) && stored >= TOUR_VERSION
  } catch {
    // No storage to remember it in means it would come back on every visit,
    // which is worse than never offering it. It is still under Help.
    return true
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(KEY, String(TOUR_VERSION))
  } catch {
    // Seen for this session.
  }
}
