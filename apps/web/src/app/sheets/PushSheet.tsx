import { useTranslation } from 'react-i18next';
import { useFormat } from '@/lib/useFormat';
import { postponeAsk, requestPush, usePushAsk, type PushReason } from '@/lib/push';
import { BottomSheet } from '@/ui/BottomSheet';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';

const SEARCH_REASON = 'savedSearch.hint';

/**
 * The rationale in front of the browser's own prompt. Opened by `askForPush` after a listing, a
 * booking request or a saved search; mounted once in the shell. "Later" keeps it away for a week.
 */
export function PushSheet() {
  const { t } = useTranslation();
  const { locale } = useFormat();
  const { reason, name, hide } = usePushAsk();
  if (!reason) return null;
  const copy: Record<PushReason, { title: string; body: string; enable: string }> = {
    post: { title: t('push.promptTitle'), body: t('push.reasonPost'), enable: t('push.promptEnable') },
    booking: { title: t('deal.sent.notifyTitle'), body: t('deal.sent.notifyBody', { name }), enable: t('deal.sent.notifyOn') },
    search: { title: t('push.promptTitle'), body: t(SEARCH_REASON), enable: t('push.promptEnable') },
  };
  const c = copy[reason];
  const later = () => {
    postponeAsk();
    hide();
  };
  const enable = () => {
    hide();
    void requestPush(locale);
  };
  return (
    <BottomSheet open onClose={later} title={c.title} primary={{ label: c.enable, onClick: enable }}>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-pill bg-bg-surface-sunken text-icon-secondary"><Icon name="bell" size={28} /></span>
        <p className="text-body text-text-secondary">{c.body}</p>
      </div>
      <Button variant="outline" onClick={later}>{t('push.promptLater')}</Button>
    </BottomSheet>
  );
}
