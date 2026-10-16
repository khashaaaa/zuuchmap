import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/lib/auth';
import { useDocTitle } from '@/lib/meta';
import { useMarkRead, useNotifications, useNotificationUnread } from '@/lib/notifications';
import { AppHeader } from '@/ui/AppHeader';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { NeedSignIn } from './NeedSignIn';
import { LoadMore, NotificationList } from './NotificationList';

/** I3 / I3d: every notification, newest first, "Өнөөдөр" then "Өмнөх". Tap = read + go to the target. */
export default function Notifications() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const token = useAuthStore((s) => s.token);
  const q = useNotifications();
  const unread = useNotificationUnread();
  const mark = useMarkRead();
  useDocTitle(t('notif.title'));
  if (!token) return <NeedSignIn />;

  const items = q.data?.pages.flat() ?? [];
  const markAll = () => mark.mutate(null);
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <AppHeader
        variant="pushed"
        title={t('notif.title')}
        onBack={() => void nav(-1)}
        action={unread > 0 ? { icon: 'check-check', label: t('notif.markAllRead'), onClick: markAll } : undefined}
        className="md:hidden"
      />
      <div className="hidden items-center gap-3 px-6 pt-8 md:flex">
        <h1 className="min-w-0 flex-1 text-h1 text-text-primary">{t('notif.title')}</h1>
        {unread > 0 && <Button variant="outline" size="medium" icon="check-check" onClick={markAll}>{t('notif.markAllRead')}</Button>}
      </div>
      <div className="pb-10 md:px-6 md:pt-3">
        <div className="overflow-hidden bg-bg-surface md:rounded-xl md:border md:border-border-subtle">
          {q.isPending ? (
            <p role="status" className="py-16 text-center text-caption text-text-secondary">{t('ui.loading')}</p>
          ) : q.isError ? (
            <EmptyState icon="circle-alert" title={t('errors.unknown')} action={{ label: t('common.retry'), onClick: () => void q.refetch() }} />
          ) : items.length === 0 ? (
            <EmptyState icon="bell" title={t('notif.empty')} body={t('notif.emptyBody')} className="py-16" />
          ) : (
            <>
              <NotificationList items={items} />
              {q.hasNextPage && <LoadMore key={items.length} onVisible={() => !q.isFetchingNextPage && void q.fetchNextPage()} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
