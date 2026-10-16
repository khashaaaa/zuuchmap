import { Pressable, Text, View } from 'react-native';
import { formatInboxStamp } from '@zuuchmap/core';
import { useAppTheme } from '../design/theme';
import { Avatar } from './Avatar';
import { CountBadge } from './CountBadge';
import { useLocale } from './useLocale';

export interface InboxRowProps {
  name: string;
  avatarUri?: string | null;
  /** Listing the thread is about. */
  listing?: string;
  preview: string;
  /** ISO string or Date: time today, date when older. */
  time: string | number | Date;
  unread?: number;
  onPress?: () => void;
}

export function InboxRow({ name, avatarUri, listing, preview, time, unread = 0, onPress }: InboxRowProps) {
  const { colors, type } = useAppTheme();
  const locale = useLocale();
  const isUnread = unread > 0;
  const stamp = formatInboxStamp(time, locale);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${stamp}, ${preview}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 80, backgroundColor: pressed ? colors.bgSurfaceSunken : colors.bgSurface })}
    >
      <Avatar size="large" name={name} uri={avatarUri} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[isUnread ? type.bodyBold : type.bodyMedium, { flex: 1, color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
          <Text style={[type.small, { color: isUnread ? colors.textPrimary : colors.textTertiary }]}>{stamp}</Text>
        </View>
        {listing ? <Text style={[type.small, { color: colors.textTertiary }]} numberOfLines={1}>{listing}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[type.caption, { flex: 1, color: isUnread ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>{preview}</Text>
          <CountBadge count={unread} />
        </View>
      </View>
    </Pressable>
  );
}
