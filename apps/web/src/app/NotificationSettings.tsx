import { useTranslation } from 'react-i18next';
import { NOTIFICATION_TOPICS } from '@zuuchmap/core';
import { useNotificationSettings, useSetTopic } from '@/lib/notifications';
import { askForPush, usePushPermission } from '@/lib/push';
import { Banner } from '@/ui/Banner';
import { Switch } from '@/ui/Switch';

/** I6: the four switches. Silencing a topic stops its push and e-mail; the centre still records. */
export function NotificationSettings() {
  const { t } = useTranslation();
  const settings = useNotificationSettings();
  const set = useSetTopic();
  const permission = usePushPermission();
  const topics = settings.data?.topics;
  return (
    <section aria-label={t('notif.settingsTitle')} className="flex flex-col gap-2">
      <h2 className="text-label text-text-primary">{t('notif.settingsTitle')}</h2>
      {permission === 'denied' && <Banner tone="warning" title={t('push.blockedTitle')} body={t('push.blockedBody')} />}
      {permission === 'default' && <Banner tone="info" title={t('prov.home.notifOffTitle')} action={{ label: t('prov.home.turnOn'), onClick: () => void askForPush('post', { force: true }) }} />}
      <ul className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-surface">
        {NOTIFICATION_TOPICS.map((topic) => (
          <li key={topic} className="flex min-h-14 items-center gap-3 border-b border-border-subtle px-4 py-1 last:border-b-0">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-body text-text-primary">{t(`notif.topic.${topic}`)}</span>
              <span className="text-caption text-text-secondary">{t(`notif.topic.${topic}Hint`)}</span>
            </span>
            <Switch label={t(`notif.topic.${topic}`)} checked={topics?.[topic] ?? true} disabled={!topics} onChange={(on) => set.mutate({ topic, on })} />
          </li>
        ))}
      </ul>
    </section>
  );
}
