/**
 * One short chime for in-app realtime events. The element is created lazily
 * on first play so a page that never gets a notification never fetches the
 * file. Plays whether or not the tab is visible — a background tab is exactly
 * when the sound does its job — but a browser that blocks autoplay before the
 * first gesture rejects `play()`, and that rejection is swallowed.
 */
const SOUND_KEY = 'zm_sound'
let audio = null

export function isNotifySoundEnabled() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off' } catch { return true }
}

export function setNotifySoundEnabled(on) {
  try {
    if (on) localStorage.removeItem(SOUND_KEY)
    else localStorage.setItem(SOUND_KEY, 'off')
  } catch { /* private mode */ }
}

export function playNotifySound() {
  if (!isNotifySoundEnabled()) return
  if (typeof Audio === 'undefined') return
  try {
    if (!audio) {
      audio = new Audio('/notify.wav')
      audio.preload = 'auto'
      audio.volume = 0.6
    }
    audio.currentTime = 0
    const p = audio.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch { /* no audio device, or jsdom */ }
}
