import { Image, Text, View, type ImageSourcePropType } from 'react-native';
import { useAppTheme } from '../design/theme';
import { Button, type ButtonVariant } from './Button';
import { Icon } from './Icon';

export interface EmptyStateProps {
  title: string;
  body?: string;
  /** Icon disc (default). */
  icon?: string;
  /** Art tile 200x138 instead of the disc; one image serves both themes. */
  art?: ImageSourcePropType;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: Extract<ButtonVariant, 'outline' | 'secondary'>;
}

export function EmptyState({ title, body, icon = 'search', art, actionLabel, onAction, actionVariant = 'outline' }: EmptyStateProps) {
  const { colors, type, radius } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 32, paddingHorizontal: 24 }}>
      {art ? (
        <Image source={art} accessibilityIgnoresInvertColors style={{ width: 200, height: 138, borderRadius: radius.card }} resizeMode="cover" />
      ) : (
        <View style={{ width: 64, height: 64, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgSurfaceSunken }}>
          <Icon name={icon} size={28} color={colors.iconSecondary} />
        </View>
      )}
      <Text accessibilityRole="header" style={[type.title, { color: colors.textPrimary, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.caption, { color: colors.textSecondary, textAlign: 'center', alignSelf: 'stretch' }]}>{body}</Text> : null}
      {actionLabel ? <Button label={actionLabel} size="medium" variant={actionVariant} onPress={onAction} style={{ marginTop: 4, alignSelf: 'center' }} /> : null}
    </View>
  );
}
