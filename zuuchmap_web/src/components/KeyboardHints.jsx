import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, X } from 'lucide-react'

const STORAGE_KEY = 'zm-hotkey-hints-collapsed'

const readCollapsed = () => {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}
const writeCollapsed = (v) => {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch { /* private mode */ }
}

function Key({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-md border border-border/50 bg-surface2 text-[11px] font-medium text-text shadow-[inset_0_-1px_0_rgba(0,0,0,0.25)]">
      {children}
    </kbd>
  )
}

/**
 * Discreet legend for the queue's shortcuts, pinned bottom-right. Collapses to
 * a single keyboard glyph and remembers that choice per browser — an admin who
 * has learned the keys should not be told about them every morning.
 *
 * `hints` is `[{ keys: ['J','K'], label }]`; keys render as keycaps.
 */
export default function KeyboardHints({ hints }) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggle = () => {
    setCollapsed((c) => { writeCollapsed(!c); return !c })
  }

  return (
    <div className="hidden md:block fixed bottom-4 right-4 z-[900] pointer-events-none">
      {collapsed ? (
        <button
          type="button"
          onClick={toggle}
          title={t('admin.hotkeyShow')}
          aria-label={t('admin.hotkeyShow')}
          className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded-full bg-surface border border-border/30 shadow-card text-muted hover:text-primary-text transition-colors"
        >
          <Keyboard size={16} />
        </button>
      ) : (
        <div className="pointer-events-auto bg-surface/95 backdrop-blur border border-border/30 shadow-card rounded-card px-3 py-2 flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
            <Keyboard size={13} className="text-primary-text" /> {t('admin.hotkeyTitle')}
          </span>
          <ul className="flex items-center gap-3">
            {hints.map((h) => (
              <li key={h.label} className="flex items-center gap-1.5 text-xs text-muted">
                <span className="flex items-center gap-0.5">
                  {h.keys.map((k, i) => (
                    <span key={k} className="flex items-center gap-0.5">
                      {i > 0 && <span className="text-muted/60">/</span>}
                      <Key>{k}</Key>
                    </span>
                  ))}
                </span>
                {h.label}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={toggle}
            title={t('admin.hotkeyHide')}
            aria-label={t('admin.hotkeyHide')}
            className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-text transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
