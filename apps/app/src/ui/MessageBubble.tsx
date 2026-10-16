import { Text, View } from 'react-native';
import { formatTime } from '@zuuchmap/core';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';
import { useLocale } from './useLocale';

export type MessageStatus = 'sending' | 'sent' | 'read';

export interface MessageBubbleProps {
  direction: 'in' | 'out';
  text: string;
  /** ISO string or Date; rendered HH:MM. */
  time: string | number | Date;
  /** Out only. */
  status?: MessageStatus;
}

export function MessageBubble({ direction, text, time, status = 'sent' }: MessageBubbleProps) {
  const { colors, type } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const out = direction === 'out';
  const fg = out ? colors.actionOnSecondary : colors.textPrimary;
  const stamp = formatTime(time, locale);
  const statusLabel = { sending: t('messages.sending'), sent: t('kit.bubble.sent'), read: t('kit.bubble.read') }[status];
  return (
    <View
      accessible
      accessibilityLabel={`${text}, ${stamp}${out ? `, ${statusLabel}` : ''}`}
      style={{
        maxWidth: '75%', alignSelf: out ? 'flex-end' : 'flex-start', gap: 4, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 8,
        backgroundColor: out ? colors.actionSecondary : colors.bgSurfaceSunken,
        borderRadius: 16, borderBottomLeftRadius: out ? 16 : 4, borderBottomRightRadius: out ? 4 : 16,
      }}
    >
      <Text style={[type.body, { color: fg }]}>{text}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 4 }}>
        <Text style={[type.small, { color: out ? fg : colors.textSecondary, opacity: out ? 0.7 : 1 }]}>{stamp}</Text>
        {out ? (
          <View style={{ flexDirection: 'row', opacity: status === 'read' ? 1 : 0.7 }}>
            {status === 'sending' ? <Icon name="clock" size={14} color={fg} /> : status === 'sent' ? <Icon name="check" size={14} color={fg} /> : <Icon name="check-check" size={14} color={fg} />}
          </View>
        ) : null}
      </View>
    </View>
  );
}
