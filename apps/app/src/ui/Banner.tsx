import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';

export type BannerTone = 'info' | 'warning' | 'offline' | 'danger';

export interface BannerProps {
  tone: BannerTone;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const GLYPH: Record<BannerTone, string> = { info: 'info', warning: 'alert-triangle', offline: 'wifi-off', danger: 'circle-alert' };

export function Banner({ tone, title, body, actionLabel, onAction }: BannerProps) {
  const { colors, type, radius } = useAppTheme();
  const bg = { info: colors.statusInfoTint, warning: colors.statusWarningTint, offline: colors.bgSurfaceSunken, danger: colors.statusDangerTint }[tone];
  const fg = { info: colors.statusInfo, warning: colors.statusWarning, offline: colors.iconPrimary, danger: colors.statusDanger }[tone];
  return (
    <View
      accessibilityRole={tone === 'offline' ? 'text' : 'alert'}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: bg }}
    >
      <View style={{ paddingTop: 0 }}>
        <Icon name={GLYPH[tone]} size={20} color={fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.labelStrong, { color: colors.textPrimary }]}>{title}</Text>
        {body ? <Text style={[type.caption, { color: colors.textSecondary }]}>{body}</Text> : null}
      </View>
      {actionLabel ? (
        <Pressable
          onPress={onAction}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={{ minHeight: 24, justifyContent: 'center' }}
        >
          <Text style={[type.labelStrong, { color: colors.textLink }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface NoticeSlotProps {
  offline?: boolean;
  /** A listing was rejected: `detail` names the field. */
  rejected?: { detail?: string; onEdit: () => void } | null;
  quota?: { used: number; total: number; onRenew: () => void } | null;
  notificationsOff?: { onEnable: () => void } | null;
}

/** One notice per screen. Priority: offline, rejected, quota, notifications off. Renders nothing when none applies. */
export function NoticeSlot({ offline, rejected, quota, notificationsOff }: NoticeSlotProps) {
  const { t } = useTranslation();
  if (offline) return <Banner tone="offline" title={t('kit.notice.offline.title')} body={t('kit.notice.offline.body')} />;
  if (rejected) return <Banner tone="danger" title={t('kit.notice.rejected.title')} body={rejected.detail} actionLabel={t('common.edit')} onAction={rejected.onEdit} />;
  if (quota) {
    return (
      <Banner
        tone="warning"
        title={t('kit.notice.quota.title')}
        body={t('kit.notice.quota.body', { used: quota.used, total: quota.total })}
        actionLabel={t('kit.notice.quota.action')}
        onAction={quota.onRenew}
      />
    );
  }
  if (notificationsOff) return <Banner tone="info" title={t('kit.notice.pushOff.title')} actionLabel={t('kit.notice.pushOff.action')} onAction={notificationsOff.onEnable} />;
  return null;
}
