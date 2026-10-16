import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocTitle } from '@/lib/meta';
import { EmptyState } from '@/ui/EmptyState';

export default function NotFound() {
  const { t } = useTranslation();
  const nav = useNavigate();
  useDocTitle(t('posts.notFound'));
  return <EmptyState icon="search" title={t('posts.notFound')} action={{ label: t('customer.detail.backToSearch'), onClick: () => void nav('/browse') }} className="py-20" />;
}
