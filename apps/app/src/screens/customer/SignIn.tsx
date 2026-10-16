import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { themedStyles, useAppTheme } from '../../design/theme';
import { useStats } from '../../lib/queries';
import type { Nav } from '../../nav';
import { AppHeader, BrandMark } from '../../ui/AppHeader';
import { KeyboardAvoider } from '../../ui/KeyboardAvoider';
import { useToast } from '../../ui/Toast';
import { SignInFlow } from './SignInFlow';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  body: { flex: 1, paddingHorizontal: t.spacing.screenPadding, paddingBottom: 16 },
  h: { ...t.type.h1, color: t.colors.textPrimary },
  sub: { ...t.type.lead, color: t.colors.textSecondary },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: t.colors.bgSurfaceSunken },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.statusSuccess },
  pillText: { ...t.type.labelStrong, color: t.colors.textSecondary },
}));

/** N1 → N2 → N3 / N6 as a pushed screen; the same flow lives in the C4 sheet. */
export function SignIn() {
  const s = useStyles();
  const { type } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const stats = useStats();
  const insets = useSafeAreaInsets();
  void type;
  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('auth.title')} onBack={() => nav.goBack()} />
      <KeyboardAvoider>
        <View style={[s.body, { paddingBottom: 16 + insets.bottom }]}>
          <SignInFlow
            fill
            onDone={() => {
              toast.show({ message: t('customer.signin.signedIn'), kind: 'success' });
              if (nav.canGoBack()) nav.goBack();
              else nav.navigate('Tabs', { screen: 'browse' });
            }}
            header={
              <View style={{ gap: 12 }}>
                <BrandMark size={48} />
                <Text style={s.h} accessibilityRole="header">{t('auth.phoneTitle')}</Text>
                <Text style={s.sub}>{t('auth.phoneSubtitle')}</Text>
                {stats.data ? (
                  <View style={s.pill}>
                    <View style={s.dot} />
                    <Text style={s.pillText}>{t('auth.liveStats', { listings: stats.data.total, provinces: stats.data.provinces })}</Text>
                  </View>
                ) : null}
              </View>
            }
          />
        </View>
      </KeyboardAvoider>
    </View>
  );
}
