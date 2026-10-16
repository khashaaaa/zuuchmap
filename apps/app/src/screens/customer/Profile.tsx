import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LOCALES, type Locale, type User } from '@zuuchmap/core';
import appJson from '../../../app.json';
import { themedStyles, useAppTheme, type ThemeMode } from '../../design/theme';
import { api, signOut as endSession } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { NOTIFICATION_KEYS, useNotifUnread } from '../../lib/notifications';
import { setLocale } from '../../lib/locale';
import { unregisterDevice } from '../../lib/push';
import { displayName } from '../../lib/deal';
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
import { useRequireAuth } from './SignInFlow';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 32, gap: 16 },
  card: { gap: 12, padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { ...t.type.title, color: t.colors.textPrimary },
  cap: { ...t.type.caption, color: t.colors.textSecondary },
  h: { ...t.type.title, color: t.colors.textPrimary },
  label: { ...t.type.overline, color: t.colors.textSecondary },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { ...t.type.bodyMedium, color: t.colors.textPrimary, flex: 1 },
}));

/** Endonyms: a language is named in itself, whatever the UI language is. */
const LOCALE_NAMES: Record<Locale, string> = { mn: 'Монгол', en: 'English', zh: '中文', ru: 'Русский' };

function Group({ label, children }: { label: string; children: ReactNode }) {
  const s = useStyles();
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

export function Profile() {
  const s = useStyles();
  const { colors, mode, setMode } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const toast = useToast();
  const requireAuth = useRequireAuth();
  const { token, user } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const unread = useNotifUnread().data ?? 0;
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<User>('/user/profile'), enabled: !!token, staleTime: 5 * 60_000 });
  const name = [profile.data?.parent_name, profile.data?.given_name].filter(Boolean).join(' ');

  const signOut = async () => {
    setConfirm(false);
    // The engine stops pushing to this phone before the session is dropped.
    await unregisterDevice();
    await endSession();
    qc.removeQueries({ queryKey: ['like-ids'] });
    qc.removeQueries({ queryKey: ['likes'] });
    qc.removeQueries({ queryKey: ['saved-searches'] });
    qc.removeQueries({ queryKey: ['profile'] });
    for (const k of [...NOTIFICATION_KEYS, 'bookings', 'conversations', 'conversation', 'messages', 'badges', 'seller', 'reviews']) qc.removeQueries({ queryKey: [k] });
    toast.show({ message: t('customer.signin.signedOut'), kind: 'info' });
  };

  return (
    <View style={s.screen}>
      <AppHeader variant="root" title={t('profile.title')} />
      <ScrollView contentContainerStyle={s.content}>
        {token && user ? (
          <View style={s.card}>
            <View style={s.who}>
              <Avatar size="large" name={name || user.phone_number} uri={profile.data?.profile_picture} />
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{name || `+976 ${user.phone_number}`}</Text>
                {name ? <Text style={s.cap}>{`+976 ${user.phone_number}`}</Text> : null}
              </View>
            </View>
          </View>
        ) : (
          <View style={s.card}>
            <Text style={s.h}>{t('profile.guestTitle')}</Text>
            <Text style={s.cap}>{t('profile.guestSubtitle')}</Text>
            <Button label={t('auth.title')} onPress={() => nav.navigate('SignIn')} />
          </View>
        )}

        <Group label={t('customer.profile.language')}>
          <View style={s.wrap}>
            {LOCALES.map((l) => (
              <Chip key={l} label={LOCALE_NAMES[l]} selected={locale === l} onPress={() => void setLocale(l)} />
            ))}
          </View>
        </Group>

        <Group label={t('customer.profile.theme')}>
          <SegmentedControl<ThemeMode>
            value={mode}
            onChange={setMode}
            segments={[
              { value: 'light', label: t('kit.theme.light') },
              { value: 'dark', label: t('kit.theme.dark') },
              { value: 'system', label: t('kit.theme.system') },
            ]}
          />
        </Group>

        <View style={s.card}>
          {token ? (
            <>
              <Pressable accessibilityRole="button" style={s.row} onPress={() => nav.navigate('Notifications')}>
                <Icon name="bell" size={22} color={colors.iconPrimary} />
                <Text style={s.rowText}>{t('notif.title')}</Text>
                <CountBadge count={unread} />
                <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
              </Pressable>
              <Pressable accessibilityRole="button" style={s.row} onPress={() => nav.navigate('NotificationSettings')}>
                <Icon name="settings" size={22} color={colors.iconPrimary} />
                <Text style={s.rowText}>{t('notif.settingsTitle')}</Text>
                <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
              </Pressable>
            </>
          ) : null}
          {token ? (
            <Pressable accessibilityRole="button" style={s.row} onPress={() => nav.navigate('MyBookings')}>
              <Icon name="calendar" size={22} color={colors.iconPrimary} />
              <Text style={s.rowText}>{t('deal.mine.title')}</Text>
              <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
            </Pressable>
          ) : null}
          {token && user?.type === 'PROVIDER' ? (
            <>
              <Pressable accessibilityRole="button" style={s.row} onPress={() => nav.navigate('BookingRequests')}>
                <Icon name="briefcase" size={22} color={colors.iconPrimary} />
                <Text style={s.rowText}>{t('deal.received.title')}</Text>
                <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
              </Pressable>
              <Pressable accessibilityRole="button" style={s.row} onPress={() => nav.navigate('Reviews', { id: user.id, name: displayName(profile.data, name) })}>
                <Icon name="star" size={22} color={colors.iconPrimary} />
                <Text style={s.rowText}>{t('review.title')}</Text>
                <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
              </Pressable>
            </>
          ) : null}
          <Pressable accessibilityRole="button" style={s.row} onPress={() => requireAuth('become', () => nav.navigate('BecomeProvider'))}>
            <Icon name="plus" size={22} color={colors.iconPrimary} />
            <Text style={s.rowText}>{t('customer.landing.addListing')}</Text>
            <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
          </Pressable>
          {__DEV__ ? (
            <Pressable accessibilityRole="button" style={s.row} onPress={() => nav.navigate('Kit')}>
              <Icon name="layout-grid" size={22} color={colors.iconPrimary} />
              <Text style={s.rowText}>Kit</Text>
              <Icon name="chevron-right" size={20} color={colors.iconSecondary} />
            </Pressable>
          ) : null}
          <View style={s.row}>
            <Icon name="info" size={22} color={colors.iconPrimary} />
            <Text style={s.rowText}>{t('customer.profile.version')}</Text>
            <Text style={s.cap}>{appJson.expo.version}</Text>
          </View>
        </View>

        {token ? <Button label={t('nav.logout')} variant="outline" icon="log-out" fullWidth onPress={() => setConfirm(true)} /> : null}
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
