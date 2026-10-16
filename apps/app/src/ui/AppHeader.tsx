import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Avatar } from './Avatar';
import { CountBadge } from './CountBadge';
import { IconButton } from './IconButton';

export const APP_HEADER_HEIGHT = 56;

/** Pin-Z mark; `brand/mark` is ink on light, signal orange on dark. */
export function BrandMark({ size = 26 }: { size?: number }) {
  const { colors } = useAppTheme();
  return (
    <Svg width={size} height={size} viewBox="3 2 26 28" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path
        fillRule="evenodd"
        fill={colors.brandMark}
        d="M16 3.3125C10.1813 3.3125 5.5 7.99375 5.5 13.8125C5.5 21.4688 16 28.6875 16 28.6875C16 28.6875 26.5 21.4688 26.5 13.8125C26.5 7.99375 21.8188 3.3125 16 3.3125ZM11.1875 9H20.8125V11.625L15.3438 16H20.8125V18.625H11.1875V16L16.6562 11.625H11.1875V9Z"
      />
    </Svg>
  );
}

export interface HeaderAction {
  icon: string;
  label: string;
  onPress: () => void;
  /** Unread count over the glyph (the bell). */
  badge?: number;
}

export type AppHeaderProps = { topInset?: boolean } & (
  | { variant: 'root'; title: string; action?: HeaderAction }
  | { variant: 'pushed'; title: string; subtitle?: string; onBack: () => void; action?: HeaderAction }
  | { variant: 'brand'; action?: HeaderAction; /** A second button left of `action` (the bell beside "+"). */ extra?: HeaderAction }
  | { variant: 'chat'; name: string; avatarUri?: string | null; replyHours?: number; /** Already-worded line under the name; wins over `replyHours`. */ replyText?: string; onBack: () => void; action?: HeaderAction });

/** 56 px bar below the status bar inset. */
export function AppHeader(props: AppHeaderProps) {
  const { colors, type } = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const act = props.action;
  const button = (a: HeaderAction) => (
    <View>
      <IconButton icon={a.icon} label={a.badge ? `${a.label}, ${a.badge}` : a.label} variant="ghost" onPress={a.onPress} />
      {a.badge ? <View pointerEvents="none" style={{ position: 'absolute', top: 4, right: 2 }}><CountBadge count={a.badge} /></View> : null}
    </View>
  );
  const actionBtn = act ? button(act) : <View style={{ width: 48 }} />;
  const back = (onBack: () => void) => <IconButton icon="arrow-left" label={t('common.back')} variant="ghost" onPress={onBack} />;

  let body;
  let pad = { paddingLeft: 0, paddingRight: 4 };
  switch (props.variant) {
    case 'root':
      pad = { paddingLeft: 20, paddingRight: 4 };
      body = (
        <>
          <Text accessibilityRole="header" style={[type.h2, { flex: 1, color: colors.textPrimary }]} numberOfLines={1}>{props.title}</Text>
          {act ? actionBtn : null}
        </>
      );
      break;
    case 'pushed':
      body = (
        <>
          {back(props.onBack)}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text accessibilityRole="header" style={[type.title, { color: colors.textPrimary }]} numberOfLines={1}>{props.title}</Text>
            {props.subtitle ? <Text style={[type.label, { color: colors.textSecondary }]} numberOfLines={1}>{props.subtitle}</Text> : null}
          </View>
          {actionBtn}
        </>
      );
      break;
    case 'brand':
      pad = { paddingLeft: 16, paddingRight: 8 };
      body = (
        <>
          <BrandMark />
          <Text accessibilityRole="header" style={[type.h3, { flex: 1, color: colors.textPrimary }]}>ZuuchMap</Text>
          {props.extra ? button(props.extra) : null}
          {act ? actionBtn : null}
        </>
      );
      break;
    case 'chat':
      pad = { paddingLeft: 4, paddingRight: 8 };
      body = (
        <>
          {back(props.onBack)}
          <Avatar size="medium" name={props.name} uri={props.avatarUri} />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyBold, { color: colors.textPrimary }]} numberOfLines={1}>{props.name}</Text>
            {props.replyText || props.replyHours ? <Text style={[type.small, { color: colors.textSecondary }]} numberOfLines={1}>{props.replyText ?? t('ui.repliesIn', { hours: props.replyHours })}</Text> : null}
          </View>
          {act ? actionBtn : null}
        </>
      );
      break;
  }
  return (
    <View style={{ paddingTop: props.topInset === false ? 0 : insets.top, backgroundColor: colors.bgCanvas }}>
      <View style={[{ height: APP_HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 8 }, pad]}>{body}</View>
    </View>
  );
}
