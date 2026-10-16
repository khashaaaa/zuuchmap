import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { NOTIFICATION_TOPICS, type NotificationTopic } from '@zuuchmap/core';
import { themedStyles } from '../../design/theme';
import { useNotifSettings, useUpdateNotifSettings } from '../../lib/notifications';
import { openSystemSettings, requestPermission, usePermission } from '../../lib/push';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Switch } from '../../ui/Switch';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 32, gap: 16 },
  card: { paddingHorizontal: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rule: { height: 1, backgroundColor: t.colors.borderSubtle },
  label: { ...t.type.bodyMedium, color: t.colors.textPrimary },
  hint: { ...t.type.caption, color: t.colors.textSecondary },
}));

/** I6: the four topic switches. The centre always records; a switch only silences push and e-mail. */
export function NotificationSettings() {
  const s = useStyles();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const settings = useNotifSettings();
  const update = useUpdateNotifSettings();
  const perm = usePermission();
  const topics = settings.data?.topics;

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('notif.settingsTitle')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        {perm === 'denied' ? (
          <Banner tone="warning" title={t('push.blockedTitle')} body={t('push.blockedBody')} actionLabel={t('push.openSettings')} onAction={openSystemSettings} />
        ) : perm === 'undetermined' ? (
          <View style={{ gap: 8 }}>
            <Text style={s.hint}>{t('push.reasonPost')}</Text>
            <Button label={t('push.promptEnable')} icon="bell" fullWidth onPress={() => void requestPermission()} />
          </View>
        ) : null}
        <View style={s.card}>
          {NOTIFICATION_TOPICS.map((k: NotificationTopic, i) => (
            <View key={k}>
              {i > 0 ? <View style={s.rule} /> : null}
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>{t(`notif.topic.${k}`)}</Text>
                  <Text style={s.hint}>{t(`notif.topic.${k}Hint`)}</Text>
                </View>
                <Switch value={topics?.[k] ?? true} disabled={!topics} label={t(`notif.topic.${k}`)} onValueChange={(on) => update.mutate({ topics: { [k]: on } })} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
