import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { formatDate, formatPrice, PLAN_MONTHS, type Payment } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { errorText } from '../../lib/api';
import { useCatalogue, useCreateInvoice, useMyPayments, useResendReceipt } from '../../lib/billing';
import { useMyStats } from '../../lib/provider';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { BottomSheet } from '../../ui/BottomSheet';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { padding: t.spacing.screenPadding, gap: 16, paddingBottom: 40 },
  card: { gap: 8, padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { ...t.type.labelStrong, color: t.colors.textPrimary },
  cap: { ...t.type.small, color: t.colors.textSecondary },
  section: { ...t.type.labelStrong, color: t.colors.textSecondary },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, borderWidth: 1, borderColor: t.colors.borderSubtle },
  planOn: { borderWidth: 2, borderColor: t.colors.borderSelected },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: t.colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  dotOn: { borderColor: t.colors.borderSelected },
  dotFill: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.textPrimary },
  title: { ...t.type.title, color: t.colors.textPrimary },
  badge: { ...t.type.badge, color: t.colors.textSecondary, backgroundColor: t.colors.bgSurfaceSunken, paddingHorizontal: 6, paddingVertical: 2, borderRadius: t.radius.sm, overflow: 'hidden' },
  price: { ...t.type.title, color: t.colors.textPrimary, fontVariant: ['tabular-nums'] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  total: { ...t.type.h2, color: t.colors.textPrimary, fontVariant: ['tabular-nums'] },
  month: { ...t.type.overline, color: t.colors.textSecondary, paddingHorizontal: 4 },
  pay: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  payTitle: { ...t.type.labelStrong, color: t.colors.textPrimary },
  payAmount: { ...t.type.labelStrong, color: t.colors.textPrimary, fontVariant: ['tabular-nums'] },
  sep: { height: 1, backgroundColor: t.colors.borderSubtle, marginHorizontal: 14 },
}));

const STATUS_COLOR = (c: ReturnType<typeof useAppTheme>['colors']) => ({
  PAID: { bg: c.statusSuccessTint, fg: c.statusSuccess },
  PENDING: { bg: c.statusInfoTint, fg: c.statusInfo },
  EXPIRED: { bg: c.bgSurfaceSunken, fg: c.textSecondary },
  CANCELLED: { bg: c.bgSurfaceSunken, fg: c.textSecondary },
});

/** Figma P8: by month, newest first; tapping a paid row e-mails its receipt again. */
function History() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const toast = useToast();
  const q = useMyPayments();
  const resend = useResendReceipt();
  const tone = STATUS_COLOR(colors);
  const groups = useMemo(() => {
    const out: Array<{ key: string; rows: Payment[] }> = [];
    for (const p of q.data ?? []) {
      const key = formatDate(p.date_created, locale).slice(0, 7);
      const g = out.at(-1);
      if (g && g.key === key) g.rows.push(p);
      else out.push({ key, rows: [p] });
    }
    return out;
  }, [q.data, locale]);
  if (q.data && q.data.length === 0) return <EmptyState icon="credit-card" title={t('billing.noHistory')} />;
  return (
    <View style={{ gap: 12 }}>
      {groups.map((g) => (
        <View key={g.key} style={{ gap: 6 }}>
          <Text style={s.month}>{t('prov.value.month', { year: g.key.slice(0, 4), month: Number(g.key.slice(5, 7)) })}</Text>
          <View style={[s.card, { padding: 0, gap: 0 }]}>
            {g.rows.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <View style={s.sep} /> : null}
                <Pressable
                  accessibilityRole="button"
                  style={s.pay}
                  onPress={() => {
                    if (p.status !== 'PAID' || p.amount === 0) return;
                    resend.mutate(p.id, { onSuccess: () => toast.show({ message: t('billing.receiptSent'), kind: 'success' }), onError: (e) => toast.show({ message: errorText(e), kind: 'error' }) });
                  }}
                >
                  <Icon name={p.kind === 'PLAN' ? 'sparkles' : 'star'} size={20} color={colors.iconSecondary} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.payTitle} numberOfLines={1}>
                      {p.kind === 'PLAN' ? t('billing.rowPlan', { count: p.months }) : t('billing.rowFeatured', { title: p.post_title ?? t('billing.featured.listingGone'), count: p.days ?? 0 })}
                    </Text>
                    <Text style={s.cap} numberOfLines={1}>
                      {[formatDate(p.date_created, locale).slice(5), p.provider === 'MANUAL' ? t('billing.manual') : 'QPay', p.reference ? `№${p.reference}` : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={s.payAmount}>{formatPrice(p.amount, 'TOTAL', locale) ?? '0₮'}</Text>
                    <Text style={[s.badge, { backgroundColor: tone[p.status].bg, color: tone[p.status].fg }]}>{t(`billing.status.${p.status}`)}</Text>
                  </View>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ))}
      {groups.length > 0 ? <Text style={s.cap}>{t('billing.historyNote')}</Text> : null}
    </View>
  );
}

/** Figma P5: online payment is off; call instead. */
export function UnavailableSheet({ visible, phone, onClose }: { visible: boolean; phone: string; onClose: () => void }) {
  const s = useStyles();
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('billing.featured.title')}>
      <View style={{ gap: 12 }}>
        <Text style={s.cap}>{t('billing.notConfigured')}</Text>
        <Button label={t('billing.callSupport', { phone })} icon="phone" fullWidth onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)} />
        <Button label={t('billing.cancel')} variant="outline" fullWidth onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

/** Figma P3d (phone layout) and P8: the plan, its length, QPay; the history. */
export function Billing() {
  const s = useStyles();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const catalogue = useCatalogue();
  const stats = useMyStats();
  const create = useCreateInvoice();
  const [months, setMonths] = useState<number>(PLAN_MONTHS[0]);
  const [unavailable, setUnavailable] = useState(false);
  const plan = stats.data?.plan;
  const provider = catalogue.data?.plans.find((p) => p.plan === 'PROVIDER');
  const free = catalogue.data?.plans.find((p) => p.plan === 'FREE');
  const price = provider?.monthly_price ?? null;
  const current = plan?.name ?? 'FREE';
  const name = (p: string) => t(p === 'PROVIDER' ? 'billing.planProvider' : 'billing.planFree');

  const pay = () => {
    if (!catalogue.data?.enabled || price === null) {
      setUnavailable(true);
      return;
    }
    create.mutate({ kind: 'PLAN', plan: 'PROVIDER', months }, {
      onSuccess: (inv) => nav.navigate('Payment', { id: inv.payment.id }),
      onError: (e) => toast.show({ message: errorText(e), kind: 'error' }),
    });
  };

  const card = (key: 'FREE' | 'PROVIDER', posts: number, monthly: number | null) => {
    const on = key === 'PROVIDER';
    return (
      <View style={[s.plan, on && s.planOn]}>
        <View style={[s.dot, on && s.dotOn]}>{on ? <View style={s.dotFill} /> : null}</View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.title}>{name(key)}</Text>
            {current === key ? <Text style={s.badge}>{t('billing.current')}</Text> : null}
          </View>
          <Text style={s.cap}>{t('billing.postsLimit', { count: posts })}</Text>
        </View>
        <Text style={s.price}>{monthly === null ? '—' : formatPrice(monthly, 'TOTAL', locale) ?? '0₮'}<Text style={s.cap}> {t('billing.perMonth')}</Text></Text>
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('billing.title')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.cap}>{t('billing.subtitle')}</Text>
        {plan ? (
          <View style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.label}>{t('billing.currentPlanLine', { plan: name(current) })}</Text>
              <Text style={s.cap}>{t('billing.usage', { used: plan.active_posts, total: plan.post_limit })}</Text>
            </View>
            {plan.expires_at ? <Text style={s.cap}>{t('billing.expiresOn', { date: formatDate(plan.expires_at, locale) })}</Text> : null}
          </View>
        ) : null}
        <Text style={s.section}>{t('billing.choosePlan')}</Text>
        {card('FREE', free?.posts ?? 0, 0)}
        {card('PROVIDER', provider?.posts ?? 0, price)}
        <Text style={s.section}>{t('billing.months')}</Text>
        <View style={s.wrap}>
          {PLAN_MONTHS.map((m) => <Chip key={m} label={t('billing.monthsValue', { count: m })} selected={months === m} onPress={() => setMonths(m)} />)}
        </View>
        <View style={s.card}>
          <View style={s.rowBetween}>
            <Text style={s.cap}>{t('billing.totalMonths', { count: months })}</Text>
            <Text style={s.total}>{price === null ? '—' : formatPrice(price * months, 'TOTAL', locale)}</Text>
          </View>
          <Button label={t('billing.payWithQpay')} fullWidth loading={create.isPending} onPress={pay} />
        </View>
        <Pressable accessibilityRole="button" style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]} onPress={() => nav.navigate('Tabs', { screen: 'myPosts' })}>
          <Icon name="star" size={20} color={undefined} />
          <View style={{ flex: 1 }}>
            <Text style={s.label}>{t('billing.featured.title')}</Text>
            <Text style={s.cap}>{t('billing.featuredCardHint')}</Text>
          </View>
          <Icon name="chevron-right" size={20} />
        </Pressable>
        <Text style={[s.section, { paddingTop: 8 }]}>{t('billing.history')}</Text>
        <History />
      </ScrollView>
      <UnavailableSheet visible={unavailable} phone={catalogue.data?.support_phone ?? ''} onClose={() => setUnavailable(false)} />
    </View>
  );
}
