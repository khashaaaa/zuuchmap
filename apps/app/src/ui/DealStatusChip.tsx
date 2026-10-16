import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Booking } from '@zuuchmap/core';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';

/** A booking's status word (`deal.status.*`); a request the provider never answered because an overlapping one won reads OVERLAP. */
export function DealStatusChip({ status, closedReason }: { status: Booking['status']; closedReason?: Booking['closed_reason'] }) {
  const { colors, type } = useAppTheme();
  const { t } = useTranslation();
  const word = closedReason === 'OVERLAP' ? 'OVERLAP' : status;
  const tone = {
    PENDING: [colors.statusWarningTint, colors.statusWarning, 'clock'],
    ACCEPTED: [colors.statusSuccessTint, colors.statusSuccess, 'circle-check'],
    DECLINED: [colors.statusDangerTint, colors.statusDanger, 'circle-alert'],
    CANCELLED: [colors.bgSurfaceSunken, colors.textSecondary, 'x'],
    EXPIRED: [colors.bgSurfaceSunken, colors.textSecondary, 'clock'],
    OVERLAP: [colors.bgSurfaceSunken, colors.textSecondary, 'x'],
  }[word];
  const [bg, fg, icon] = tone;
  const label = t(`deal.status.${word}`);
  return (
    <View accessible accessibilityLabel={label} style={{ alignSelf: 'flex-start', height: 24, paddingHorizontal: 8, gap: 4, flexDirection: 'row', alignItems: 'center', borderRadius: 6, backgroundColor: bg }}>
      <Icon name={icon} size={14} color={fg} />
      <Text style={[type.overline, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}
