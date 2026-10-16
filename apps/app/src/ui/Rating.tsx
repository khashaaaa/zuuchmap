import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';

/** Five stars in the warning tone, always with the number. */
export function Rating({ value }: { value: number }) {
  const { colors, type } = useAppTheme();
  const { t } = useTranslation();
  const shown = value.toFixed(1);
  const full = Math.round(value);
  return (
    <View accessible accessibilityLabel={t('kit.rating', { value: shown })} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={16} color={i <= full ? colors.statusWarning : colors.borderStrong} fill={i <= full ? colors.statusWarning : undefined} />
      ))}
      <View style={{ width: 4 }} />
      <Text style={[type.labelStrong, { color: colors.textPrimary }]}>{shown}</Text>
    </View>
  );
}
