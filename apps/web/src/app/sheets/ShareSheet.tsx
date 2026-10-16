import { useTranslation } from 'react-i18next';
import { useToast } from '@/lib/toast';
import { BottomSheet } from '@/ui/BottomSheet';
import { Icon } from '@/ui/Icon';

interface Props { open: boolean; onClose: () => void; url: string; title: string }

/** B7. */
export function ShareSheet({ open, onClose, url, title }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const row = 'flex min-h-14 w-full items-center gap-3 rounded-md px-2 text-left text-body-bold text-text-primary focus-visible:outline-none focus-visible:shadow-focus';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('customer.share.copied'));
    } catch {
      toast.error(t('errors.unknown'));
    }
    onClose();
  };
  const share = async () => {
    try {
      await navigator.share({ title, url });
    } catch {
      /* dismissed */
    }
    onClose();
  };
  return (
    <BottomSheet open={open} onClose={onClose} title={t('customer.share.title')}>
      <p className="text-caption text-text-secondary">{t('customer.share.body')}</p>
      <p className="truncate rounded-md bg-bg-surface-sunken px-3 py-2 text-caption text-text-secondary">{url}</p>
      <button type="button" className={row} onClick={() => void copy()}>
        <Icon name="copy" size={22} />{t('customer.share.copyLink')}
      </button>
      {typeof navigator.share === 'function' && (
        <button type="button" className={row} onClick={() => void share()}>
          <Icon name="share-2" size={22} />{t('customer.share.other')}
        </button>
      )}
    </BottomSheet>
  );
}
