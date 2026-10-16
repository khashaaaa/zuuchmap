import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMarkRead, useNotifications, useNotificationUnread } from '@/lib/notifications';
import { usePresence } from '@/lib/usePresence';
import { EmptyState } from '@/ui/EmptyState';
import { NotificationList } from './NotificationList';

const SHOWN = 5;

/** I10d: the bell's dropdown on desktop: the latest few, "Бүгдийг уншсан", and a link to the page. */
export function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const q = useNotifications(open);
  const { mounted, closing } = usePresence(open);
  const unread = useNotificationUnread();
  const mark = useMarkRead();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      // The bell toggles the panel itself; a press on it must not close-then-reopen.
      if (e.target instanceof Element && (ref.current?.contains(e.target) || e.target.closest('[data-notif-bell]'))) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, onClose]);

  if (!mounted) return null;
  const items = (q.data?.pages[0] ?? []).slice(0, SHOWN);
  return (
    <div
      ref={ref}
      role="dialog"
      data-closing={closing ? '' : undefined}
      aria-label={t('notif.title')}
      className="zm-pop-in fixed right-6 top-[84px] z-40 hidden w-[400px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-lg md:flex"
    >
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <h2 className="min-w-0 flex-1 text-title text-text-primary">{t('notif.title')}</h2>
        {unread > 0 && (
          <button type="button" onClick={() => mark.mutate(null)} className="inline-flex h-8 items-center rounded-md text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus">
            {t('notif.markAllRead')}
          </button>
        )}
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {q.isPending ? (
          <p role="status" className="py-10 text-center text-caption text-text-secondary">{t('ui.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState icon="bell" title={t('notif.empty')} body={t('notif.emptyBody')} />
        ) : (
          <NotificationList items={items} onOpen={onClose} grouped={false} />
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          onClose();
          void nav('/notifications');
        }}
        className="h-12 border-t border-border-subtle text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus"
      >
        {t('notif.seeAll')}
      </button>
    </div>
  );
}
