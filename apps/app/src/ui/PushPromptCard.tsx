import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Button } from './Button';
import { Icon } from './Icon';

export interface PushPromptCardProps {
  title: string;
  body: string;
  /** Defaults to `push.promptEnable`. */
  enableLabel?: string;
  onEnable: () => void;
  onLater: () => void;
}

/** The rationale shown before the system permission dialog. Never rendered at sign-in. */
export function PushPromptCard({ title, body, enableLabel, onEnable, onLater }: PushPromptCardProps) {
  const { colors, type, radius } = useAppTheme();
  const { t } = useTranslation();
  return (
    <View style={{ gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.bgSurface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.statusInfoTint }}>
          <Icon name="bell" size={20} color={colors.statusInfo} />
        </View>
        <Text accessibilityRole="header" style={[type.title, { flex: 1, color: colors.textPrimary }]}>{title}</Text>
      </View>
      <Text style={[type.caption, { color: colors.textSecondary }]}>{body}</Text>
      <Button label={enableLabel ?? t('push.promptEnable')} fullWidth onPress={onEnable} />
      <Button label={t('push.promptLater')} variant="outline" fullWidth onPress={onLater} />
    </View>
  );
}
