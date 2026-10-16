import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';

/** Paid placement. Always carries the word. */
export function FeaturedMark() {
  const { colors, type } = useAppTheme();
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityLabel={t('kit.featured')}
      style={{ alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: 8, gap: 4, flexDirection: 'row', alignItems: 'center', borderRadius: 9999, backgroundColor: colors.actionPrimary }}
    >
      <Icon name="star" size={12} color={colors.actionOnPrimary} fill={colors.actionOnPrimary} />
      <Text style={[type.overline, { color: colors.actionOnPrimary }]} maxFontSizeMultiplier={1.3}>{t('kit.featured')}</Text>
    </View>
  );
}
