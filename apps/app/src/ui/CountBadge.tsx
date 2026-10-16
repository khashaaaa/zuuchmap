import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';

/** Unread / request count. Caps at 99+. The ring is the surface colour so it separates from what it sits on. */
export function CountBadge({ count }: { count: number }) {
  const { colors, type } = useAppTheme();
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <View
      accessible
      accessibilityLabel={t('ui.unread', { count })}
      style={{
        minWidth: 20, height: 20, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
        borderRadius: 9999, backgroundColor: colors.statusDangerFill, borderWidth: 2, borderColor: colors.bgSurface,
      }}
    >
      <Text style={[type.badge, { color: colors.textOnColor }]}>{count > 99 ? '99+' : String(count)}</Text>
    </View>
  );
}
