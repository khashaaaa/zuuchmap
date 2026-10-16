import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export function FeaturedMark({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-pill bg-action-primary px-2 text-overline text-action-on-primary', className)}>
      <Icon name="star" size={12} className="fill-current" />
      {t('kit.featured')}
    </span>
  );
}
