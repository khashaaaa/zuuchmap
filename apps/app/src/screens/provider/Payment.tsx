import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDate, formatPrice, INVOICE_TTL_MINUTES, type PaymentInvoice, type QPayLink } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { api, errorText } from '../../lib/api';
import { useCatalogue, useCreateInvoice, usePaymentStatus } from '../../lib/billing';
import type { Nav, RootStackParamList } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { useLocale } from '../../ui/useLocale';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { padding: t.spacing.screenPadding, gap: 16, alignItems: 'center', paddingBottom: 40 },
  amount: { ...t.type.display, color: t.colors.textPrimary, fontVariant: ['tabular-nums'] },
  what: { ...t.type.body, color: t.colors.textSecondary, textAlign: 'center' },
  qr: { width: 220, height: 220, borderRadius: t.radius.md, backgroundColor: '#FFFFFF' },
  scan: { ...t.type.labelStrong, color: t.colors.textPrimary },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waitingText: { ...t.type.label, color: t.colors.textLink },
  banksTitle: { ...t.type.labelStrong, color: t.colors.textPrimary, alignSelf: 'flex-start' },
  banks: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch' },
  bank: { width: '33.33%', minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 4 },
  bankLogo: { width: 36, height: 36, borderRadius: t.radius.sm },
  bankText: { ...t.type.small, color: t.colors.textPrimary, textAlign: 'center' },
  note: { ...t.type.small, color: t.colors.textSecondary, textAlign: 'center' },
  done: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.statusSuccessTint },
  h: { ...t.type.h2, color: t.colors.textPrimary, textAlign: 'center' },
  pill: { ...t.type.labelStrong, color: t.colors.textPrimary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: t.radius.md, backgroundColor: t.colors.bgSurfaceSunken, overflow: 'hidden' },
}));

/** One bank app; its logo falls back to a card glyph when QPay's image fails. */
function Bank({ u }: { u: QPayLink }) {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const [broken, setBroken] = useState(!u.logo);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={u.description || u.name}
      style={s.bank}
      onPress={() => Linking.openURL(u.link).catch(() => toast.show({ message: t('billing.failed'), kind: 'error' }))}
    >
      {broken ? <Icon name="credit-card" size={24} color={colors.iconSecondary} /> : <Image source={{ uri: u.logo }} style={s.bankLogo} onError={() => setBroken(true)} />}
      <Text style={s.bankText} numberOfLines={2}>{u.description || u.name}</Text>
    </Pressable>
  );
}

/**
 * Figma P3 (QR and bank apps), P6 (expired, open a fresh one), P4 (placement live) and P7 (plan
 * active). The engine is polled while the invoice is open.
 */
export function Payment() {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Payment'>>();
  const toast = useToast();
  const [id, setId] = useState(params.id);
  const invoice = useQuery({ queryKey: ['payments', 'invoice', id], queryFn: () => api<PaymentInvoice>(`/payments/${id}`) });
  const status = usePaymentStatus(id);
  const catalogue = useCatalogue();
  const create = useCreateInvoice();
  const payment = status.data ?? invoice.data?.payment;
  const amount = payment ? formatPrice(payment.amount, 'TOTAL', locale) : null;

  const renew = () => {
    if (!payment) return;
    const body = payment.kind === 'PLAN'
      ? { kind: 'PLAN' as const, plan: 'PROVIDER' as const, months: payment.months }
      : { kind: 'FEATURED' as const, post_id: payment.post_id ?? 0, days: payment.days ?? 7 };
    create.mutate(body, { onSuccess: (inv) => setId(inv.payment.id), onError: (e) => toast.show({ message: errorText(e), kind: 'error' }) });
  };

  if (invoice.isError) {
    return (
      <View style={s.screen}>
        <AppHeader variant="pushed" title={t('billing.payWithQpay')} onBack={() => nav.goBack()} />
        <EmptyState icon="wifi-off" title={t('billing.failed')} body={errorText(invoice.error)} actionLabel={t('deal.retry')} onAction={() => void invoice.refetch()} />
      </View>
    );
  }
  if (!payment || !invoice.data) {
    return (
      <View style={s.screen}>
        <AppHeader variant="pushed" title={t('billing.payWithQpay')} onBack={() => nav.goBack()} />
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.iconSecondary} />
      </View>
    );
  }

  if (payment.status === 'PAID') {
    const plan = payment.kind === 'PLAN';
    const posts = catalogue.data?.plans.find((p) => p.plan === 'PROVIDER')?.posts ?? 0;
    return (
      <View style={s.screen}>
        <AppHeader variant="pushed" title={t('billing.paid')} onBack={() => nav.goBack()} />
        <ScrollView contentContainerStyle={[s.content, { paddingTop: 32 }]}>
          <View style={s.done}><Icon name="circle-check" size={36} color={colors.statusSuccess} /></View>
          <Text style={s.h}>{plan ? t('billing.planActiveTitle') : t('billing.paid')}</Text>
          <Text style={s.what}>{plan ? t('billing.planActiveBody', { count: posts }) : t('billing.featured.paidHint')}</Text>
          {payment.granted_until ? (
            <Text style={s.pill}>
              {plan
                ? t('billing.untilAmount', { date: formatDate(payment.granted_until, locale), amount: amount ?? '' })
                : t('billing.featuredUntil', { date: formatDate(payment.granted_until, locale) })}
            </Text>
          ) : null}
          <Button
            label={plan ? t('billing.publishDrafts') : t('billing.toListings')}
            fullWidth
            onPress={() => nav.navigate('Tabs', { screen: 'myPosts' })}
          />
          <Button label={t('billing.history')} variant="outline" fullWidth onPress={() => nav.replace('Billing')} />
        </ScrollView>
      </View>
    );
  }

  const expired = payment.status === 'EXPIRED' || payment.status === 'CANCELLED';
  const what = payment.kind === 'PLAN'
    ? t('billing.rowPlan', { count: payment.months })
    : `${t('billing.featured.title')} — ${t('billing.featured.daysValue', { count: payment.days ?? 0 })}`;
  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={t('billing.payWithQpay')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.amount}>{amount}</Text>
        <Text style={s.what}>{what}</Text>
        {expired ? (
          <View style={{ alignSelf: 'stretch' }}><Banner tone="warning" title={t('billing.expiredTitle')} body={t('billing.expiredBody')} /></View>
        ) : (
          <>
            {invoice.data.qr_image ? <Image accessibilityLabel={t('billing.scanQr')} source={{ uri: `data:image/png;base64,${invoice.data.qr_image}` }} style={s.qr} /> : null}
            <Text style={s.scan}>{t('billing.scanQr')}</Text>
            <View style={s.waiting} accessibilityLiveRegion="polite">
              <Icon name="clock" size={16} color={colors.textLink} />
              <Text style={s.waitingText}>{t('billing.waitingForPayment')}</Text>
            </View>
            {invoice.data.urls.length > 0 ? (
              <>
                <Text style={s.banksTitle}>{t('billing.openBankApp')}</Text>
                <View style={s.banks}>{invoice.data.urls.map((u) => <Bank key={u.link} u={u} />)}</View>
              </>
            ) : null}
          </>
        )}
        <Text style={s.note}>{t('billing.invoiceNote', { minutes: INVOICE_TTL_MINUTES })}</Text>
        {expired ? (
          <Button label={t('billing.payWithQpay')} fullWidth loading={create.isPending} onPress={renew} />
        ) : (
          <>
            <Button label={t('billing.check')} variant="outline" icon="refresh-cw" fullWidth loading={status.isFetching} onPress={() => void status.refetch()} />
            <Button label={t('billing.cancel')} variant="outline" fullWidth onPress={() => nav.goBack()} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
