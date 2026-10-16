import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/ui/EmptyState';

/** A signed-in-only page opened as a guest. */
export function NeedSignIn() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  return <EmptyState icon="user" title={t('auth.loginRequired')} action={{ label: t('auth.title'), onClick: () => void nav('/login', { state: { from: loc.pathname } }) }} className="py-24" />;
}
