import { useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { themedStyles, useAppTheme } from '../../design/theme';
import { errorText } from '../../lib/api';
import { clearAuth } from '../../lib/auth';
import { useCatalogue, useDeleteAccount } from '../../lib/billing';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

const SUPPORT_EMAIL = 'support@zuuchmap.com';
/** When the privacy policy and terms took effect (Figma L2, L6). */
const EFFECTIVE = '2026.08.22';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { padding: t.spacing.screenPadding, gap: 16, paddingBottom: 40 },
  card: { borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 64 },
  sep: { height: 1, backgroundColor: t.colors.borderSubtle, marginLeft: 16 },
  cap: { ...t.type.small, color: t.colors.textSecondary },
  value: { ...t.type.labelStrong, color: t.colors.textPrimary },
  action: { ...t.type.labelStrong, color: t.colors.textLink },
  h: { ...t.type.h3, color: t.colors.textPrimary },
  q: { ...t.type.labelStrong, color: t.colors.textPrimary, flex: 1 },
  a: { ...t.type.body, color: t.colors.textSecondary, paddingHorizontal: 16, paddingBottom: 16 },
  body: { ...t.type.body, color: t.colors.textSecondary },
  lead: { ...t.type.body, color: t.colors.textPrimary },
  link: { ...t.type.labelStrong, color: t.colors.textLink, paddingVertical: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemText: { ...t.type.body, color: t.colors.textPrimary },
}));

function Page({ title, children }: { title: string; children: ReactNode }) {
  const s = useStyles();
  const nav = useNavigation<Nav>();
  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={title} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content}>{children}</ScrollView>
    </View>
  );
}

/** Figma L1. */
export function Help() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const phone = useCatalogue().data?.support_phone ?? '+976 8008-8253';
  const [open, setOpen] = useState(0);
  const contact = (icon: string, label: string, value: string, url?: string, action?: string) => (
    <View style={s.row}>
      <Icon name={icon} size={20} color={colors.iconSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={s.cap}>{label}</Text>
        <Text style={s.value}>{value}</Text>
      </View>
      {url && action ? <Pressable accessibilityRole="link" hitSlop={8} onPress={() => void Linking.openURL(url)}><Text style={s.action}>{action}</Text></Pressable> : null}
    </View>
  );
  return (
    <Page title={t('legal.help.title')}>
      <View style={s.card}>
        {contact('phone', t('legal.help.phone'), phone, `tel:${phone.replace(/[^\d+]/g, '')}`, t('legal.help.call'))}
        <View style={s.sep} />
        {contact('mail', t('legal.help.email'), SUPPORT_EMAIL, `mailto:${SUPPORT_EMAIL}`, t('legal.help.write'))}
        <View style={s.sep} />
        {contact('clock', t('legal.help.hours'), t('legal.help.hoursValue'))}
      </View>
      <Text style={s.h} accessibilityRole="header">{t('legal.help.faq')}</Text>
      <View style={s.card}>
        {[1, 2, 3, 4].map((n) => (
          <View key={n}>
            {n > 1 ? <View style={s.sep} /> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === n }} style={s.row} onPress={() => setOpen(open === n ? 0 : n)}>
              <Text style={s.q}>{t(`legal.help.q${String(n)}`)}</Text>
              <Icon name="chevron-down" size={18} color={colors.iconSecondary} />
            </Pressable>
            {open === n ? <Text style={s.a}>{t(`legal.help.a${String(n)}`)}</Text> : null}
          </View>
        ))}
      </View>
      <View>
        <Text accessibilityRole="link" style={s.link} onPress={() => nav.navigate('Privacy')}>{t('legal.privacy.title')}</Text>
        <Text accessibilityRole="link" style={s.link} onPress={() => nav.navigate('Terms')}>{t('legal.terms.title')}</Text>
      </View>
    </Page>
  );
}

function Document({ ns }: { ns: 'privacy' | 'terms' }) {
  const s = useStyles();
  const { t } = useTranslation();
  return (
    <Page title={t(`legal.${ns}.title`)}>
      <Text style={s.cap}>{t('legal.effective', { date: EFFECTIVE })}</Text>
      <Text style={s.lead}>{t(`legal.${ns}.intro`)}</Text>
      {[1, 2, 3, 4].map((n) => (
        <View key={n} style={{ gap: 6 }}>
          <Text style={s.h} accessibilityRole="header">{t(`legal.${ns}.h${String(n)}`)}</Text>
          <Text style={s.body}>{t(`legal.${ns}.p${String(n)}`)}</Text>
        </View>
      ))}
      <Text style={s.body}>{t('legal.contact')}</Text>
    </Page>
  );
}

/** Figma L2. */
export const Privacy = () => <Document ns="privacy" />;
/** Figma L6. */
export const Terms = () => <Document ns="terms" />;

/** Figma L3/L4: what goes, then a confirmation; the phone is signed out afterwards. */
export function DeleteAccount() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const toast = useToast();
  const del = useDeleteAccount();
  const [confirm, setConfirm] = useState(false);
  return (
    <Page title={t('account.delete.title')}>
      <Banner tone="danger" title={t('account.delete.warning')} body={t('account.delete.warningBody')} />
      <Text style={s.h} accessibilityRole="header">{t('account.delete.what')}</Text>
      <View style={{ gap: 10 }}>
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={s.item}>
            <Icon name="x" size={16} color={colors.statusDanger} />
            <Text style={s.itemText}>{t(`account.delete.item${String(n)}`)}</Text>
          </View>
        ))}
      </View>
      <Text style={s.cap}>{t('account.delete.reverify')}</Text>
      <Button label={t('account.delete.action')} variant="danger" fullWidth loading={del.isPending} onPress={() => setConfirm(true)} />
      <Button label={t('account.delete.back')} variant="outline" fullWidth onPress={() => nav.goBack()} />
      <Modal
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={t('account.delete.confirmTitle')}
        body={t('account.delete.confirmBody')}
        icon="trash-2"
        cancelLabel={t('account.delete.cancel')}
        confirmLabel={t('account.delete.confirm')}
        onConfirm={() => {
          setConfirm(false);
          del.mutate(undefined, {
            onSuccess: () => {
              void clearAuth();
              qc.clear();
              toast.show({ message: t('account.delete.done'), kind: 'success' });
              nav.reset({ index: 0, routes: [{ name: 'Tabs' }] });
            },
            onError: (e) => toast.show({ message: errorText(e), kind: 'error' }),
          });
        }}
      />
    </Page>
  );
}
