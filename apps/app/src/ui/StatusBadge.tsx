import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';

export type Status =
  | 'pending' | 'rejected' | 'expired' | 'available' | 'busy' | 'verified'
  | 'draft' | 'accepted' | 'live' | 'cancelled' | 'completed';

export const STATUSES: readonly Status[] = [
  'pending', 'rejected', 'expired', 'available', 'busy', 'verified', 'draft', 'accepted', 'live', 'cancelled', 'completed',
];

const ICON: Record<Status, string> = {
  pending: 'clock', rejected: 'circle-alert', expired: 'clock', available: 'check', busy: 'calendar', verified: 'badge-check',
  draft: 'pencil', accepted: 'circle-check', live: 'circle-check', cancelled: 'clock', completed: 'check',
};

/** Icon plus word, never colour alone. */
export function StatusBadge({ status }: { status: Status }) {
  const { colors, type } = useAppTheme();
  const { t } = useTranslation();
  const tone = {
    warning: { bg: colors.statusWarningTint, fg: colors.statusWarning },
    danger: { bg: colors.statusDangerTint, fg: colors.statusDanger },
    success: { bg: colors.statusSuccessTint, fg: colors.statusSuccess },
    info: { bg: colors.statusInfoTint, fg: colors.statusInfo },
    neutral: { bg: colors.bgSurfaceSunken, fg: colors.textSecondary },
  };
  const key = ({
    pending: 'warning', rejected: 'danger', expired: 'neutral', available: 'success', busy: 'info', verified: 'info',
    draft: 'neutral', accepted: 'success', live: 'success', cancelled: 'neutral', completed: 'neutral',
  } as const)[status];
  const { bg, fg } = tone[key];
  return (
    <View
      accessible
      accessibilityLabel={t(`kit.status.${status}`)}
      style={{ alignSelf: 'flex-start', height: 24, paddingHorizontal: 8, gap: 4, flexDirection: 'row', alignItems: 'center', borderRadius: 6, backgroundColor: bg }}
    >
      <Icon name={ICON[status]} size={14} color={fg} />
      <Text style={[type.overline, { color: fg }]} numberOfLines={1}>{t(`kit.status.${status}`)}</Text>
    </View>
  );
}
