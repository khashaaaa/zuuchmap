import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';

export type NotificationType = 'booking' | 'approved' | 'rejected' | 'expiring' | 'savedSearch' | 'review' | 'report' | 'message';

export const NOTIFICATION_TYPES: readonly NotificationType[] = ['booking', 'approved', 'rejected', 'expiring', 'savedSearch', 'review', 'report', 'message'];

const ICON: Record<NotificationType, string> = {
  booking: 'calendar', approved: 'circle-check', rejected: 'circle-alert', expiring: 'clock',
  savedSearch: 'search', review: 'star', report: 'flag', message: 'message-circle',
};

export interface NotificationRowProps {
  type: NotificationType;
  text: string;
  /** Ready-made stamp, e.g. from formatRelativeAge or formatNotificationStamp. */
  time: string;
  unread?: boolean;
  onPress?: () => void;
}

export function NotificationRow({ type: kind, text, time, unread, onPress }: NotificationRowProps) {
  const { colors, type } = useAppTheme();
  const tone = {
    booking: [colors.statusInfoTint, colors.statusInfo], approved: [colors.statusSuccessTint, colors.statusSuccess],
    rejected: [colors.statusDangerTint, colors.statusDanger], expiring: [colors.statusWarningTint, colors.statusWarning],
    savedSearch: [colors.statusInfoTint, colors.statusInfo], review: [colors.statusInfoTint, colors.statusInfo],
    report: [colors.bgSurfaceSunken, colors.iconSecondary], message: [colors.statusInfoTint, colors.statusInfo],
  }[kind];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${text}, ${time}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, minHeight: 72, backgroundColor: pressed ? colors.bgSurfaceSunken : colors.bgSurface })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: tone[0] }}>
        <Icon name={ICON[kind]} size={20} color={tone[1]} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[unread ? type.bodyMedium : type.body, { color: unread ? colors.textPrimary : colors.textSecondary }]}>{text}</Text>
        <Text style={[type.small, { color: colors.textTertiary }]}>{time}</Text>
      </View>
      {unread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.statusInfo }} /> : null}
    </Pressable>
  );
}
