import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { themedStyles, useAppTheme } from '../../design/theme';
import { useCategories } from '../../lib/queries';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  body: { flex: 1, justifyContent: 'space-between', paddingHorizontal: t.spacing.screenPadding, paddingBottom: 20 },
  hero: { width: 128, height: 128, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bgSurfaceSunken },
  h: { ...t.type.h1, color: t.colors.textPrimary },
  sub: { ...t.type.lead, color: t.colors.textSecondary },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  perkText: { ...t.type.bodyBold, color: t.colors.textPrimary, flex: 1 },
  note: { flexDirection: 'row', gap: 8 },
  noteText: { ...t.type.small, color: t.colors.textSecondary, flex: 1 },
}));

/** N4: the "+" entry for a signed-in customer; the primary button opens the wizard, and the first listing makes the account a provider. */
export function BecomeProvider() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const cats = useCategories();
  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('customer.become.title')} onBack={() => nav.goBack()} />
      <View style={s.body}>
        <View style={{ gap: 16 }}>
          <View style={s.hero}><Icon name="briefcase" size={56} color={colors.iconAccent} /></View>
          <Text style={s.h} accessibilityRole="header">{t('customer.become.title')}</Text>
          <Text style={s.sub}>{t('customer.become.subtitle')}</Text>
          {[t('customer.become.perk1', { count: cats.data?.length ?? 0 }), t('customer.become.perk2'), t('customer.become.perk3')].map((p) => (
            <View key={p} style={s.perk}>
              <Icon name="circle-check" size={24} color={colors.iconAccent} />
              <Text style={s.perkText}>{p}</Text>
            </View>
          ))}
          <View style={s.note}>
            <Icon name="info" size={16} color={colors.iconSecondary} />
            <Text style={s.noteText}>{t('customer.become.note')}</Text>
          </View>
        </View>
        <View style={{ gap: 8, alignItems: 'center' }}>
          <Button label={t('customer.become.title')} fullWidth onPress={() => nav.replace('Wizard')} />
          <Button label={t('customer.become.later')} variant="outline" size="medium" onPress={() => nav.goBack()} style={{ borderColor: 'transparent' }} />
        </View>
      </View>
    </View>
  );
}
