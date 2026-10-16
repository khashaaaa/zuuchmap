import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatDate } from '@zuuchmap/core';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../design/theme';
import { Icon } from './Icon';
import { useLocale } from './useLocale';

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export interface DateRangeCalendarProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
  /** Booked days: struck through, not selectable, and a range may not span one. */
  isBooked?: (day: Date) => boolean;
  /** Days the owner closed: shaded, still selectable. */
  isBlocked?: (day: Date) => boolean;
  /** Replaces the two legend lines (the provider calendar draws its own). */
  hideLegend?: boolean;
  /** Days before this are disabled. Defaults to today. */
  minDate?: Date;
  /** Month shown first. Defaults to the start day, else today. */
  initialMonth?: Date;
}

const key = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function DateRangeCalendar({ value, onChange, isBooked, isBlocked, hideLegend, minDate, initialMonth }: DateRangeCalendarProps) {
  const { colors, type, radius } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const min = useMemo(() => dayStart(minDate ?? new Date()), [minDate]);
  const first = initialMonth ?? value.start ?? new Date();
  const [month, setMonth] = useState(() => new Date(first.getFullYear(), first.getMonth(), 1));

  const weeks = useMemo(() => {
    const lead = (month.getDay() + 6) % 7; // weeks start Monday
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
    ];
    while (cells.length % 7) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  }, [month]);

  const spansBooked = (a: Date, b: Date) => {
    if (!isBooked) return false;
    for (let d = new Date(a); d <= b; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) if (isBooked(d)) return true;
    return false;
  };

  const pick = (d: Date) => {
    const { start, end } = value;
    if (start && end && key(d) === key(start) && key(d) === key(end)) return; // already a one-day range
    if (!start || end) return onChange({ start: d, end: null });
    if (key(d) === key(start)) return onChange({ start, end: d }); // same day twice: a one-day range
    if (d < start || spansBooked(start, d)) return onChange({ start: d, end: null });
    onChange({ start, end: d });
  };

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const title = formatDate(month, locale).slice(0, 7);
  const today = key(new Date());
  const sk = value.start ? key(value.start) : null;
  const ek = value.end ? key(value.end) : null;

  return (
    <View style={{ gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.bgSurface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => shift(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('kit.calendar.prev')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: -12 }}>
          <Icon name="chevron-left" size={22} color={colors.iconPrimary} />
        </Pressable>
        <Text accessibilityRole="header" style={[type.title, { flex: 1, textAlign: 'center', color: colors.textPrimary }]}>{title}</Text>
        <Pressable onPress={() => shift(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('kit.calendar.next')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: -12 }}>
          <Icon name="chevron-right" size={22} color={colors.iconPrimary} />
        </Pressable>
      </View>

      <View>
        <View style={{ flexDirection: 'row', height: 24 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <Text key={n} style={[type.small, { flex: 1, textAlign: 'center', color: colors.textTertiary }]}>{t(`kit.calendar.wd${n}`)}</Text>
          ))}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: 'row', marginTop: 2 }}>
            {week.map((d, di) => {
              if (!d) return <View key={di} style={{ flex: 1, height: 44 }} />;
              const k = key(d);
              const booked = !!isBooked?.(d);
              const blocked = !booked && !!isBlocked?.(d);
              const past = d < min;
              const disabled = booked || past;
              const isStart = k === sk;
              const isEnd = k === ek;
              const inside = sk !== null && ek !== null && k > sk && k < ek;
              const end = isStart || isEnd;
              const bandLeft = inside || (isEnd && sk !== ek);
              const bandRight = inside || (isStart && ek !== null && sk !== ek);
              const state = booked ? t('kit.status.busy') : end ? (isStart ? t('booking.startDate') : t('booking.endDate')) : '';
              return (
                <Pressable
                  key={di}
                  disabled={disabled}
                  onPress={() => pick(d)}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDate(d, locale)}${state ? `, ${state}` : ''}`}
                  accessibilityState={{ disabled, selected: end || inside }}
                  style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' }}>
                    <View style={{ flex: 1, backgroundColor: bandLeft ? colors.actionPrimaryTint : 'transparent' }} />
                    <View style={{ flex: 1, backgroundColor: bandRight ? colors.actionPrimaryTint : 'transparent' }} />
                  </View>
                  <View
                    style={{
                      width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: end ? colors.actionSecondary : blocked ? colors.bgSurfaceSunken : 'transparent',
                      borderWidth: (k === today || blocked) && !end ? 1 : 0, borderColor: colors.borderStrong, borderStyle: blocked && !end ? 'dashed' : 'solid',
                    }}
                  >
                    <Text
                      style={[
                        end ? type.labelStrong : type.label,
                        {
                          color: end ? colors.actionOnSecondary : booked ? colors.textSecondary : past ? colors.textDisabled : colors.textPrimary,
                          textDecorationLine: booked ? 'line-through' : 'none',
                        },
                      ]}
                    >
                      {String(d.getDate())}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {hideLegend ? null : (
        <View style={{ gap: 4 }}>
          <Text style={[type.small, { color: colors.textSecondary }]}>{t('kit.calendar.legendBooked')}</Text>
          <Text style={[type.small, { color: colors.textSecondary }]}>{t('kit.calendar.legendPick')}</Text>
        </View>
      )}
    </View>
  );
}
