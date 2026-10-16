import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppNotification } from '@zuuchmap/core';
import { notificationLook, useNotificationText, useOpenNotification } from '@/lib/notifications';
import { useFormat } from '@/lib/useFormat';
import { NotificationRow } from '@/ui/NotificationRow';

const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Rows under "Өнөөдөр" (relative age) and "Өмнөх" (the date), the way I3d groups them. */
export function NotificationList({ items, onOpen, grouped = true }: { items: AppNotification[]; onOpen?: () => void; grouped?: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  const text = useNotificationText();
  const open = useOpenNotification();
  const now = new Date();
  const today = items.filter((n) => sameDay(new Date(n.created_at), now));
  const earlier = items.filter((n) => !sameDay(new Date(n.created_at), now));
  const group = (label: string, rows: AppNotification[], relative: boolean) =>
    rows.length > 0 && (
      <section key={label} aria-label={label} className="flex flex-col">
        {grouped && <h2 className="px-4 pb-1 pt-4 text-overline text-text-secondary">{label}</h2>}
        <ul className="flex flex-col divide-y divide-border-subtle">
          {rows.map((n) => (
            <li key={n.id}>
              <NotificationRow
                type={notificationLook(n.kind)}
                text={text(n)}
                at={n.created_at}
                stamp={relative ? undefined : f.date(n.created_at)}
                unread={!n.read_at}
                onClick={() => open(n, onOpen)}
              />
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <>
      {group(t('notif.today'), today, true)}
      {group(t('notif.earlier'), earlier, false)}
    </>
  );
}

/** Fires `onVisible` when it scrolls into view: the next page of a list. */
export function LoadMore({ onVisible }: { onVisible: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  useEffect(() => {
    cb.current = onVisible;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && cb.current(), { rootMargin: '240px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} role="status" className="py-4 text-center text-caption text-text-secondary">{t('ui.loading')}</div>;
}
