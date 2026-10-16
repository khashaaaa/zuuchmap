import { Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPriceParts } from '@zuuchmap/core';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Button } from './Button';
import { useLocale } from './useLocale';

/** Visible bar height without the safe-area inset (12 + 48 + 12 + hairline). Add `insets.bottom` and pad scroll content by the sum. */
export const LISTING_ACTION_BAR_HEIGHT = 73;

export interface ListingActionBarProps {
  mode: 'book' | 'call' | 'sos';
  price?: { amount: number | string; unit?: string | null } | null;
  onBook?: () => void;
  onCall?: () => void;
  onMessage?: () => void;
  /** The viewer already has a PENDING request: the book button opens it instead. */
  pending?: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
}

/** Docks absolutely at the bottom of its screen. */
export function ListingActionBar({ mode, price, onBook, onCall, onMessage, pending, onLayout }: ListingActionBarProps) {
  const { colors, type } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const parts = price ? formatPriceParts(price.amount, price.unit, locale) : null;
  return (
    <View
      onLayout={onLayout}
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        paddingTop: 12, paddingHorizontal: 16, paddingBottom: 12 + insets.bottom,
        backgroundColor: colors.bgSurface, borderTopWidth: 1, borderTopColor: colors.borderSubtle,
      }}
    >
      {mode === 'sos' ? (
        <Button label={t('kit.action.sos')} variant="danger" icon="phone" fullWidth onPress={onCall} style={{ flex: 1 }} />
      ) : (
        <>
          {parts ? (
            <View style={{ flexGrow: 1, flexShrink: 1 }}>
              <Text style={[type.price, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>{parts.amount}</Text>
              {parts.unit ? <Text style={[type.small, { color: colors.textSecondary }]} numberOfLines={1}>{`/ ${parts.unit}`}</Text> : null}
            </View>
          ) : null}
          {/* Large text moves the buttons under the price rather than squeezing their labels away. */}
          <View style={{ flexGrow: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <Button label={t('messages.title')} variant="outline" icon="message-circle" onPress={onMessage} />
          <Button
            label={mode === 'book' ? (pending ? t('deal.sent.pendingCta') : t('kit.action.book')) : t('kit.action.call')}
            variant={mode === 'book' && pending ? 'outline' : 'primary'}
            icon={mode === 'call' ? 'phone' : undefined}
            onPress={mode === 'book' ? onBook : onCall}
          />
          </View>
        </>
      )}
    </View>
  );
}
