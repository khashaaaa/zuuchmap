import { useState } from 'react'
import { Menu, Globe, Sun, Moon, Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '@/i18n/index'
import { useThemeStore, useNotificationStore } from '@/store'
import { formatDate } from '@/lib/utils'

export default function AppHeader({ onMenuClick }) {
  const { i18n, t } = useTranslation()
  const [langOpen, setLangOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0]
  const { theme, toggleTheme } = useThemeStore()
  const { notifications, unreadCount, markAllRead } = useNotificationStore()

  function changeLang(code) {
    i18n.changeLanguage(code)
    setLangOpen(false)
  }

  return (
    <header className="flex items-center h-14 px-4 border-b border-border/20 shadow-card bg-surface shrink-0 relative">
      <button
        onClick={onMenuClick}
        aria-label={t('nav.menu')}
        className="md:hidden p-2 rounded-btn hover:bg-surface2 transition-colors mr-2"
      >
        <Menu size={20} />
      </button>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <div className="relative">
          <button
            onClick={() => { setNotifOpen((o) => !o); setLangOpen(false) }}
            title={t('notifications.title')}
            aria-label={t('notifications.title')}
            className="relative min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-btn text-muted hover:text-text hover:bg-surface2 transition-colors"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center bg-primary text-on-primary text-[9px] font-bold rounded-full">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-72 max-w-[calc(100vw-2rem)] bg-surface border border-border/50 rounded-card shadow-lg z-50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                  <span className="text-sm font-medium text-text">{t('notifications.title')}</span>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                      {t('notifications.markAllRead')}
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted">{t('notifications.empty')}</div>
                ) : (
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`px-3 py-3 border-b border-border/50 last:border-0 ${n.read ? '' : 'bg-primary/5'}`}
                      >
                        <p className="text-sm text-text">{n.message}</p>
                        <p className="text-xs text-muted mt-0.5">{formatDate(n.ts)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <button
          onClick={toggleTheme}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-btn text-muted hover:text-text hover:bg-surface2 transition-colors"
          title={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="relative">
          <button
            onClick={() => { setLangOpen((o) => !o); setNotifOpen(false) }}
            className="min-h-[44px] flex items-center gap-2 px-3 py-1.5 rounded-btn text-sm text-muted hover:text-text hover:bg-surface2 transition-colors"
          >
            <Globe size={15} />
            <span className="inline-flex items-center gap-1">
              <span>{current.flag}</span>
              <span className="hidden sm:inline">{current.label}</span>
            </span>
          </button>
          {langOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-40 bg-surface border border-border/50 rounded-card shadow-lg z-50 overflow-hidden">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => changeLang(lang.code)}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors hover:bg-surface2 ${lang.code === i18n.language ? 'text-primary font-medium' : 'text-text'}`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
