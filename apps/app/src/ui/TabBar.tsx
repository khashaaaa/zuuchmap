import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { motion } from '@zuuchmap/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAppTheme } from '../design/theme';
import { CountBadge } from './CountBadge';
import { Icon } from './Icon';
import { useReduceMotion } from './useReduceMotion';

export type TabPreset = 'customer' | 'provider' | 'admin';

interface TabDef {
  key: string;
  icon: string;
  /** i18n key. */
  label: string;
  /** The provider's centre "+" action. */
  center?: boolean;
}

/** Route names must equal these keys when the bar is used as a navigator's `tabBar`. */
export const TAB_PRESETS: Record<TabPreset, TabDef[]> = {
  customer: [
    { key: 'browse', icon: 'search', label: 'nav.search' },
    { key: 'saved', icon: 'bookmark', label: 'nav.saved' },
    { key: 'messages', icon: 'message-circle', label: 'messages.title' },
    { key: 'profile', icon: 'user', label: 'nav.profile' },
  ],
  provider: [
    { key: 'home', icon: 'home', label: 'nav.home' },
    { key: 'myPosts', icon: 'list', label: 'nav.myListings' },
    { key: 'add', icon: 'plus', label: 'nav.addListing', center: true },
    { key: 'messages', icon: 'message-circle', label: 'messages.title' },
    { key: 'profile', icon: 'user', label: 'nav.profile' },
  ],
  admin: [
    { key: 'browse', icon: 'search', label: 'nav.browse' },
    { key: 'approval', icon: 'shield-check', label: 'admin.pendingPostsShort' },
    { key: 'reports', icon: 'flag', label: 'report.queue' },
    { key: 'profile', icon: 'user', label: 'nav.profile' },
  ],
};

/** Item height; the bar adds 6 above and the safe-area inset below. */
export const TAB_ITEM_HEIGHT = 56;
export const TAB_BAR_PAD_TOP = 6;
/** Sibling labels end 6 px above the item bottom (24 icon + 4 gap + 16 label centred in 56). */
const CENTER_LABEL_BOTTOM = 6;

export interface TabBarItemProps {
  icon: string;
  label: string;
  active?: boolean;
  count?: number;
  onPress?: () => void;
  /** The bar draws one sliding indicator for all items instead. */
  hideIndicator?: boolean;
}

/** 24 px icon, label, 3 px indicator on top when active. Active and default labels share one size. */
export function TabBarItem({ icon, label, active, count, onPress, hideIndicator }: TabBarItemProps) {
  const { colors, type } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={{ flex: 1, height: TAB_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 4 }}
    >
      <View style={{ position: 'absolute', top: 0, width: 24, height: 3, borderRadius: 2, backgroundColor: active && !hideIndicator ? colors.actionPrimary : 'transparent' }} />
      <View>
        <Icon name={icon} size={24} color={active ? colors.iconPrimary : colors.iconSecondary} />
        {count ? (
          <View style={{ position: 'absolute', top: -8, left: 12 }}>
            <CountBadge count={count} />
          </View>
        ) : null}
      </View>
      <Text style={[active ? type.overline : type.micro, { color: active ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export interface TabBarProps {
  preset: TabPreset;
  activeKey: string;
  onSelect: (key: string) => void;
  /** Count badges by tab key. */
  counts?: Record<string, number>;
  /** Provider centre: listings used out of the plan's total, drawn as a small meter. */
  quota?: { used: number; total: number };
}

export function TabBar({ preset, activeKey, onSelect, counts, quota }: TabBarProps) {
  const { colors, type, elevation } = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const tabs = TAB_PRESETS[preset];
  const index = tabs.findIndex((tab) => tab.key === activeKey && !tab.center);
  // One indicator slides between items (all items share the row equally, 8 px padding each side).
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    if (index < 0) return;
    if (reduce) x.setValue(index);
    else Animated.timing(x, { toValue: index, duration: motion.durationNormal, useNativeDriver: true }).start();
  }, [index, reduce, x]);
  const item = (width - 16) / tabs.length;
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row', alignItems: 'flex-end', overflow: 'visible', paddingTop: TAB_BAR_PAD_TOP, paddingHorizontal: 8, paddingBottom: insets.bottom,
        backgroundColor: colors.bgSurface, borderTopWidth: 1, borderTopColor: colors.borderSubtle,
      }}
    >
      {width > 0 && index >= 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: TAB_BAR_PAD_TOP, left: 8 + item / 2 - 12, width: 24, height: 3, borderRadius: 2, backgroundColor: colors.actionPrimary,
            transform: [{ translateX: Animated.multiply(x, item) }],
          }}
        />
      ) : null}
      {tabs.map((tab) => {
        const label = t(tab.label);
        if (!tab.center) {
          return <TabBarItem key={tab.key} icon={tab.icon} label={label} active={tab.key === activeKey} count={counts?.[tab.key]} onPress={() => onSelect(tab.key)} hideIndicator />;
        }
        return (
          <Pressable
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            accessibilityRole="button"
            accessibilityLabel={quota ? `${label}. ${t('kit.notice.quota.body', { used: quota.used, total: quota.total })}` : label}
            style={{ flex: 1, height: TAB_ITEM_HEIGHT }}
          >
            {/* The disc overflows upward so the bar keeps the height of the other presets. */}
            <View
              style={[
                elevation.md,
                { position: 'absolute', alignSelf: 'center', bottom: CENTER_LABEL_BOTTOM + 16 + 4, width: 48, height: 48, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.actionPrimary },
              ]}
            >
              <Icon name={tab.icon} size={24} color={colors.actionOnPrimary} />
            </View>
            {quota ? (
              <View style={{ position: 'absolute', alignSelf: 'center', bottom: CENTER_LABEL_BOTTOM + 16 + 0.5, flexDirection: 'row', gap: 2, width: 34, height: 3 }}>
                {Array.from({ length: quota.total }, (_, i) => (
                  <View key={i} style={{ flex: 1, borderRadius: 1, backgroundColor: i < quota.used ? colors.textPrimary : colors.borderDefault }} />
                ))}
              </View>
            ) : null}
            <Text style={[type.micro, { position: 'absolute', alignSelf: 'center', bottom: CENTER_LABEL_BOTTOM, color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** `<Tab.Navigator tabBar={(p) => <NavigationTabBar {...p} preset="customer" />}>`; route names are the preset keys. */
export function NavigationTabBar({ state, navigation, ...rest }: BottomTabBarProps & Omit<TabBarProps, 'activeKey' | 'onSelect'>) {
  const active = state.routes[state.index]?.name ?? '';
  return (
    <TabBar
      {...rest}
      activeKey={active}
      onSelect={(key) => {
        const route = state.routes.find((r) => r.name === key);
        if (!route) return;
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (key !== active && !event.defaultPrevented) navigation.navigate(route.name, route.params);
      }}
    />
  );
}
