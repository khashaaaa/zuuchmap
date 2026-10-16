import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { askForPush } from '@/lib/push';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';

interface Props {
  id: number;
  title: string;
  rentable: boolean;
  days: number;
  onAnother: () => void;
}

/** F6: the listing is with the admin. */
export function Sent({ id, title, rentable, days, onAnother }: Props) {
  const { t } = useTranslation();
  const nav = useNavigate();
  // F6 is the moment a provider has a reason to want the answer pushed.
  useEffect(() => void askForPush('post'), []);
  const steps = [
    { icon: 'circle-check', tone: 'text-status-success', label: t('prov.wizard.sent'), hint: '' },
    { icon: 'clock', tone: 'text-status-warning', label: t('prov.wizard.checking'), hint: t('prov.wizard.checkingTime') },
    { icon: 'sparkles', tone: 'text-icon-secondary', label: t('prov.wizard.publishes'), hint: t('prov.wizard.activeDays', { days }) },
  ];
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-5 px-6 pb-16 pt-16 text-center">
      <span className="inline-flex size-20 items-center justify-center rounded-pill bg-status-success-tint text-status-success"><Icon name="check" size={36} /></span>
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-text-primary">{t('prov.wizard.sentTitle')}</h1>
        <p className="text-body-bold text-text-primary">{title}</p>
        <p className="text-body text-text-secondary">{t('prov.wizard.sentBody')}</p>
      </div>
      <ol className="flex w-full flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface p-4 text-left">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            <Icon name={s.icon} size={20} className={s.tone} />
            <span className="flex-1 text-body text-text-primary">{s.label}</span>
            {s.hint && <span className="text-caption text-text-secondary">{s.hint}</span>}
          </li>
        ))}
      </ol>
      {rentable && (
        <div className="flex w-full flex-col gap-2 text-left">
          <p className="text-caption text-text-secondary">{t('prov.wizard.sentBlockHint')}</p>
          <Button variant="outline" icon="calendar-x" onClick={() => void nav(`/provider/block?post=${id}`)}>{t('prov.wizard.blockDays')}</Button>
        </div>
      )}
      <div className="flex w-full flex-col gap-3">
        <Button onClick={() => void nav('/provider/listings', { replace: true })}>{t('prov.wizard.toMyListings')}</Button>
        <Button variant="outline" onClick={onAnother}>{t('prov.wizard.addAnother')}</Button>
      </div>
    </div>
  );
}
