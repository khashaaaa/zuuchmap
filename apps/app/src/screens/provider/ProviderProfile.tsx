import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LOCALES, formatDate, type Locale } from '@zuuchmap/core';
import appJson from '../../../app.json';
import { themedStyles, useAppTheme, type ThemeMode } from '../../design/theme';
import { signOut as endSession } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { displayName } from '../../lib/deal';
import { NOTIFICATION_KEYS, useNotifUnread } from '../../lib/notifications';
import { setLocale } from '../../lib/locale';
import { unregisterDevice } from '../../lib/push';
import { PROVIDER_KEYS, useProfile, useProviderHome } from '../../lib/provider';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { CountBadge } from '../../ui/CountBadge';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 32, gap: 16 },
  card: { gap: 4, padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { ...t.type.title, color: t.colors.textPrimary },
  cap: { ...t.type.caption, color: t.colors.textSecondary },
  label: { ...t.type.overline, color: t.colors.textSecondary },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { ...t.type.bodyMedium, color: t.colors.textPrimary },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 14, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface },
  statNum: { ...t.type.h2, color: t.colors.textPrimary, fontVariant: ['tabular-nums'] },
}));

const LOCALE_NAMES: Record<Locale, string> = { mn: 'Монгол', en: 'English', zh: '中文', ru: 'Русский' };

/** R4: the provider's account tab. */
export function ProviderProfile() {
  const s = useStyles();
  const { colors, mode, setMode } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const profile = useProfile();
  const home = useProviderHome();
  const [confirm, setConfirm] = useState(false);
  const unread = useNotifUnread().data ?? 0;
  const person = [profile.data?.parent_name, profile.data?.given_name].filter(Boolean).join(' ');
  const c = home.data?.company ?? null;
  const name = c?.name || person || `+976 ${user?.phone_number ?? ''}`;
  const plan = home.data?.plan;
  const rating = home.data?.rating.average;

  const signOut = async () => {
    setConfirm(false);
    // The engine stops pushing to this phone before the session is dropped.
    await unregisterDevice();
    await endSession();
    for (const k of [...NOTIFICATION_KEYS, ...PROVIDER_KEYS, 'my-company', 'bookings', 'conversations', 'conversation', 'messages', 'badges', 'seller', 'reviews', 'like-ids', 'likes', 'saved-searches']) qc.removeQueries({ queryKey: [k] });
    toast.show({ message: t('customer.signin.signedOut'), kind: 'info' });
  };

  const row = (icon: string, label: string, onPress?: () => void, right?: ReactNode, sub?: string) => (
    <Pressable accessibilityRole="button" disabled={!onPress} style={[s.row, !onPress ? { opacity: 0.5 } : null]} onPress={onPress}>
      <Icon name={icon} size={22} color={colors.iconPrimary} />
      <View style={{ flex: 1 }}>
        <Text style={s.rowText}>{label}</Text>
        {sub ? <Text style={s.cap}>{sub}</Text> : null}
      </View>
      {right}
      {onPress ? <Icon name="chevron-right" size={20} color={colors.iconSecondary} /> : null}
    </Pressable>
  );

  return (
    <View style={s.screen}>
      <AppHeader variant="root" title={t('profile.title')} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.card}>
          <View style={s.who}>
            <Avatar size="large" kind={c ? 'company' : 'initials'} name={name} uri={c?.logo ?? profile.data?.profile_picture} />
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{name}</Text>
              {profile.data ? <Text style={s.cap} numberOfLines={1}>{t('prov.account.since', { name: displayName(profile.data, person), date: formatDate(profile.data.date_created, locale).slice(0, 7) })}</Text> : null}
            </View>
          </View>
        </View>

        <View style={s.stats}>
          <View style={s.stat}><Text style={s.statNum}>{home.data?.listings.total ?? 0}</Text><Text style={s.cap}>{t('prov.account.totalListings')}</Text></View>
          <View style={s.stat}><Text style={s.statNum}>{plan?.active_posts ?? home.data?.listings.live ?? 0}</Text><Text style={s.cap}>{t('prov.account.activeListings')}</Text></View>
          <View style={s.stat}><Text style={s.statNum}>{rating != null ? rating.toFixed(1) : '—'}</Text><Text style={s.cap}>{t('prov.account.rating')}</Text></View>
        </View>

        <View style={s.card}>
          {row('calendar', t('prov.account.requests'), () => nav.navigate('BookingRequests'), <CountBadge count={home.data?.pending_requests.count ?? 0} />)}
          {row('star', t('prov.account.replyReviews'), () => user && nav.navigate('Reviews', { id: user.id, name }), <CountBadge count={home.data?.unanswered_reviews ?? 0} />)}
          {row('trending-up', t('prov.account.performance'), () => nav.navigate('BookingValue'))}
          {row(
            'badge-check',
            t('prov.account.plan'),
            () => nav.navigate('Billing'),
            undefined,
            plan ? [t('prov.account.planLine', { plan: plan.name === 'PROVIDER' ? t('prov.listings.planProvider') : t('prov.listings.planFree'), used: plan.active_posts, limit: plan.post_limit }), plan.expires_at ? t('prov.account.planUntil', { date: formatDate(plan.expires_at, locale) }) : null].filter(Boolean).join(' · ') : undefined,
          )}
          {row('bell', t('notif.title'), () => nav.navigate('Notifications'), <CountBadge count={unread} />)}
          {row('settings', t('prov.account.settings'), () => nav.navigate('NotificationSettings'), undefined, t('prov.account.settingsHint'))}
          {row('building-2', c ? t('prov.account.company') : t('prov.account.noCompany'), () => nav.navigate('Company'), undefined, c?.name)}
          {row('help-circle', t('legal.helpRow'), () => nav.navigate('Help'))}
          {row('shield-check', t('legal.privacyTermsRow'), () => nav.navigate('Privacy'))}
          {row('user-x', t('account.delete.title'), () => nav.navigate('DeleteAccount'))}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={s.label}>{t('customer.profile.language')}</Text>
          <View style={s.wrap}>
            {LOCALES.map((l) => <Chip key={l} label={LOCALE_NAMES[l]} selected={locale === l} onPress={() => void setLocale(l)} />)}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text style={s.label}>{t('customer.profile.theme')}</Text>
          <SegmentedControl<ThemeMode>
            value={mode}
            onChange={setMode}
            segments={[{ value: 'light', label: t('kit.theme.light') }, { value: 'dark', label: t('kit.theme.dark') }, { value: 'system', label: t('kit.theme.system') }]}
          />
        </View>
        <View style={s.card}>
          <View style={s.row}>
            <Icon name="info" size={22} color={colors.iconPrimary} />
            <Text style={[s.rowText, { flex: 1 }]}>{t('customer.profile.version')}</Text>
            <Text style={s.cap}>{appJson.expo.version}</Text>
          </View>
        </View>
        <Button label={t('nav.logout')} variant="outline" icon="log-out" fullWidth onPress={() => setConfirm(true)} />
      </ScrollView>
      <Modal
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={t('nav.logout')}
        body={t('nav.logoutConfirmMessage')}
        icon="log-out"
        iconTone="warning"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('nav.logout')}
        destructive={false}
        onConfirm={() => void signOut()}
      />
    </View>
  );
}
