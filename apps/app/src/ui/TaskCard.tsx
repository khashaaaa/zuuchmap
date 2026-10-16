import { Text, View } from 'react-native';
import { useAppTheme } from '../design/theme';
import { Button } from './Button';
import { Icon } from './Icon';

export type TaskType = 'request' | 'rejected' | 'expiring';


export interface TaskCardProps {
  type: TaskType;
  title: string;
  subtitle?: string;
  actionLabel: string;
  onAction?: () => void;
  /** Overrides the type's glyph (unread chats, reviews). */
  icon?: string;
}

const ICON: Record<TaskType, string> = { request: 'calendar', rejected: 'circle-alert', expiring: 'clock' };

export function TaskCard({ type: kind, title, subtitle, actionLabel, onAction, icon }: TaskCardProps) {
  const { colors, type, elevation, radius } = useAppTheme();
  const [bg, fg] = {
    request: [colors.statusInfoTint, colors.statusInfo],
    rejected: [colors.statusDangerTint, colors.statusDanger],
    expiring: [colors.statusWarningTint, colors.statusWarning],
  }[kind];
  return (
    <View style={[elevation.sm, { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.card, backgroundColor: colors.bgSurface }]}>
      <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
        <Icon name={icon ?? ICON[kind]} size={22} color={fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.bodyBold, { color: colors.textPrimary }]}>{title}</Text>
        {subtitle ? <Text style={[type.caption, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      <Button label={actionLabel} variant="outline" size="medium" onPress={onAction} />
    </View>
  );
}
