import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { spacing, typography, radius, isTablet, interactions } from '../../design/theme';
import { useAppTheme } from '../../hooks/useAppTheme';
import { ScreenLayout, PressableScale } from '../../components';
import paymentService, { CATALOGUE_KEY, PAYMENTS_KEY } from '../../services/api/paymentService';
import { useProfile, PROFILE_KEY } from '../../hooks/useProfile';
import { formatPrice, formatDate } from '../../utils/displayUtils';
import { showErrorModal } from '../../utils/errorManager';
import { invalidatePostData } from '../../services/queryClient';

const MONTH_CHOICES = [1, 3, 6, 12];
const DAY_CHOICES_FALLBACK = [7, 14, 30];
/** QPay settles in seconds, but a bank app can sit on it — poll for two minutes. */
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120000;

/**
 * Buy plan time.
 *
 * The plan has been enforced server-side all along — quota, expiry, degrade on
 * lapse — but the only way in was an admin toggling a flag after reconciling a
 * bank transfer by hand. This is the till.
 *
 * Nothing here decides whether money moved: the poll reads an answer the engine
 * has already verified with QPay server-to-server.
 */
const BillingScreen = ({ navigation, route }) => {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [months, setMonths] = useState(1);
    const [days, setDays] = useState(7);
    const [invoice, setInvoice] = useState(null);
    const [paid, setPaid] = useState(false);

    // The posts list hands one listing to the till through route params.
    // Placement is bought for a specific listing, so the section only appears
    // when there is one — a picker on a screen about plans would be noise.
    const featuredPostId = route?.params?.postId ?? null;
    const featuredPostTitle = route?.params?.postTitle ?? null;
    const featuredExpiresAt = route?.params?.expiresAt ?? null;

    const { data: catalogue } = useQuery({ queryKey: CATALOGUE_KEY, queryFn: paymentService.catalogue });
    const { data: history = [] } = useQuery({ queryKey: PAYMENTS_KEY, queryFn: paymentService.mine });
    const { data: profile } = useProfile();

    const paidPlan = catalogue?.plans?.find((p) => p.plan === 'PROVIDER');
    const freePlan = catalogue?.plans?.find((p) => p.plan === 'FREE');
    const unitPrice = paidPlan?.monthly_price ?? 0;
    const expiresAt = profile?.plan_expires_at ? new Date(profile.plan_expires_at) : null;
    const planActive = profile?.plan === 'PROVIDER' && expiresAt && expiresAt > new Date();

    const featuredCat = catalogue?.featured;
    const dayChoices = featuredCat?.packs?.length ? featuredCat.packs : DAY_CHOICES_FALLBACK;
    const perDay = featuredCat?.price_per_day ?? 0;
    // What the engine will actually sell: never more days than the listing has
    // left, so the total on screen is the total on the invoice.
    const daysLeft = featuredExpiresAt
        ? Math.floor((new Date(featuredExpiresAt) - Date.now()) / 86400000)
        : null;
    const sellableDays = daysLeft == null ? days : Math.max(0, Math.min(days, daysLeft));

    // The plan codes are enum values, not copy. `ProviderPostList` already
    // renders them through these keys; this screen was showing the bare
    // 'FREE'/'PROVIDER' in an otherwise Mongolian page.
    const planLabel = (plan) =>
        plan === 'PROVIDER' ? t('posts.planProvider')
        : plan === 'FREE' ? t('posts.planFree')
        : (plan ?? '');

    const createFeatured = useMutation({
        mutationFn: () => paymentService.createFeaturedInvoice(featuredPostId, days),
        onSuccess: (data) => {
            setPaid(false);
            setInvoice(data);
        },
        onError: (error) => {
            const code = error?.response?.data?.message;
            showErrorModal(
                t('common.error'),
                paymentService.isNotConfigured(error) ? t('billing.notConfigured')
                    : code === 'POST_EXPIRES_TOO_SOON' ? t('billing.featured.expiresTooSoon')
                    : code === 'POST_NOT_FEATURABLE' ? t('billing.featured.notLive')
                    : t('billing.failed'),
            );
        },
    });

    const create = useMutation({
        mutationFn: () => paymentService.createInvoice('PROVIDER', months),
        onSuccess: (data) => {
            setPaid(false);
            setInvoice(data);
        },
        onError: (error) => {
            showErrorModal(
                t('common.error'),
                paymentService.isNotConfigured(error) ? t('billing.notConfigured') : t('billing.failed')
            );
        },
    });

    // Poll while the QR is on screen. Stops on success, on dismiss, and after
    // two minutes — an interval left running behind a closed sheet is a request
    // every three seconds forever.
    useEffect(() => {
        if (!invoice?.payment_id || paid) return undefined;
        const startedAt = Date.now();
        const timer = setInterval(async () => {
            if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
                clearInterval(timer);
                return;
            }
            try {
                const result = await paymentService.check(invoice.payment_id);
                if (result?.status === 'PAID') {
                    clearInterval(timer);
                    setPaid(true);
                    qc.invalidateQueries({ queryKey: PROFILE_KEY });
                    qc.invalidateQueries({ queryKey: PAYMENTS_KEY });
                    // Placement reorders browse, so every cached list of posts
                    // — and the owner's own list, which draws the star — is
                    // now out of date.
                    invalidatePostData();
                }
            } catch {
                // A failed poll is not a failed payment — the engine's hourly
                // sweep settles an invoice whose confirmation never got here.
            }
        }, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [invoice?.payment_id, paid, qc]);

    const qrSource = invoice?.qr_image
        ? { uri: invoice.qr_image.startsWith('data:') ? invoice.qr_image : `data:image/png;base64,${invoice.qr_image}` }
        : null;

    return (
        <ScreenLayout title={t('billing.title')} onBack={() => navigation.goBack()}>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.card}>
                    <Text style={styles.overline}>{t('billing.currentPlan')}</Text>
                    <Text style={styles.planName}>{planLabel(profile?.plan ?? 'FREE')}</Text>
                    <Text style={styles.meta}>
                        {planActive
                            ? t('billing.expiresOn', { date: formatDate(expiresAt) })
                            : t('billing.postsLimit', { count: freePlan?.posts ?? 3 })}
                    </Text>
                </View>

                {catalogue?.enabled === false ? (
                    /* The ladder is public data — /payments/catalogue returns it
                       whether or not QPay is wired up. Hiding it left a provider
                       unable to find out what the paid tier even costs, under a
                       notice telling them to get in touch with no way to do so. */
                    <View style={styles.card}>
                        <View style={styles.planHead}>
                            <View style={styles.flex}>
                                <Text style={styles.planName}>{planLabel('PROVIDER')}</Text>
                                <Text style={styles.meta}>{t('billing.postsLimit', { count: paidPlan?.posts ?? 25 })}</Text>
                            </View>
                            <Text style={styles.price}>{formatPrice(unitPrice)}</Text>
                        </View>
                        <Text style={styles.meta}>{t('billing.notConfigured')}</Text>
                        <PressableScale
                            style={[styles.cta, { backgroundColor: colors.surfaceElevated }]}
                            onPress={() => navigation.navigate('HelpSupport')}
                            accessibilityRole="button"
                        >
                            <Text style={[styles.ctaText, { color: colors.text.link }]}>
                                {t('profile.helpSupport')}
                            </Text>
                        </PressableScale>
                    </View>
                ) : invoice ? (
                    <View style={styles.card}>
                        {paid ? (
                            <View style={styles.centered}>
                                <Ionicons name="checkmark-circle" size={40} color={colors.success} />
                                <Text style={styles.planName}>{t('billing.paid')}</Text>
                                {/* Two products settle through this screen, and
                                    "you can now post more listings" is only true
                                    of one of them. */}
                                <Text style={styles.meta}>
                                    {invoice?.kind === 'FEATURED'
                                        ? t('billing.featured.paidHint')
                                        : t('billing.paidHint')}
                                </Text>
                                <PressableScale
                                    style={[styles.cta, { backgroundColor: colors.primary }]}
                                    onPress={() => { setInvoice(null); setPaid(false); }}
                                >
                                    <Text style={[styles.ctaText, { color: colors.onPrimary }]}>{t('common.close')}</Text>
                                </PressableScale>
                            </View>
                        ) : (
                            <View style={styles.centered}>
                                <Text style={styles.meta}>{t('billing.scanQr')}</Text>
                                {qrSource && <Image source={qrSource} style={styles.qr} resizeMode="contain" />}
                                <Text style={styles.total}>{formatPrice(invoice.amount)}</Text>

                                {invoice.urls?.length > 0 && (
                                    <>
                                        <Text style={styles.overline}>{t('billing.openBankApp')}</Text>
                                        <View style={styles.bankRow}>
                                            {invoice.urls.map((u) => (
                                                <TouchableOpacity
                                                    key={u.link}
                                                    onPress={() => Linking.openURL(u.link).catch(() => { })}
                                                    hitSlop={interactions.hitSlop}
                                                    activeOpacity={interactions.activeOpacityLight}
                                                    style={styles.bankChip}
                                                    accessibilityRole="button"
                                                >
                                                    <Text style={styles.bankChipText}>{u.name}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </>
                                )}

                                <Text style={styles.meta} accessibilityLiveRegion="polite">
                                    {t('billing.waitingForPayment')}
                                </Text>
                                <TouchableOpacity onPress={() => setInvoice(null)} hitSlop={interactions.hitSlop}>
                                    <Text style={styles.cancelText}>{t('billing.cancel')}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                ) : featuredPostId ? (
                    /* Placement. Sold per listing per day, priced separately
                       from the plan ladder — it buys position in browse, not
                       entitlement on the account, so a FREE provider is as
                       welcome to it as a paid one. */
                    <View style={styles.card}>
                        <View style={styles.planHead}>
                            <View style={styles.flex}>
                                <Text style={styles.planName}>{t('billing.featured.title')}</Text>
                                <Text style={styles.meta} numberOfLines={2}>
                                    {featuredPostTitle ?? t('billing.featured.listing', { id: featuredPostId })}
                                </Text>
                            </View>
                            <Text style={styles.price}>{formatPrice(perDay)}</Text>
                        </View>

                        <Text style={styles.meta}>{t('billing.featured.lead')}</Text>

                        {featuredCat?.enabled === false ? (
                            <Text style={[styles.meta, { marginTop: spacing.md }]}>{t('billing.notConfigured')}</Text>
                        ) : (
                            <>
                                <Text style={styles.overline}>{t('billing.featured.days')}</Text>
                                <View style={styles.monthRow}>
                                    {dayChoices.map((d) => (
                                        <TouchableOpacity
                                            key={d}
                                            onPress={() => setDays(d)}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: days === d }}
                                            activeOpacity={interactions.activeOpacityLight}
                                            style={[styles.monthChip, days === d && { backgroundColor: colors.primary }]}
                                        >
                                            <Text style={[styles.monthChipText, days === d && { color: colors.onPrimary }]}>
                                                {t('billing.featured.daysValue', { count: d })}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* The engine clamps the window to what the
                                    listing has left. Saying so here is the
                                    difference between a clear price and a total
                                    that changes at the QR. */}
                                {daysLeft != null && sellableDays < days && (
                                    <Text style={[styles.meta, { color: colors.warning }]}>
                                        {t('billing.featured.clamped', { count: sellableDays })}
                                    </Text>
                                )}

                                <View style={styles.totalRow}>
                                    <Text style={styles.meta}>{t('billing.total')}</Text>
                                    <Text style={styles.total}>{formatPrice(perDay * sellableDays)}</Text>
                                </View>

                                <PressableScale
                                    style={[
                                        styles.cta,
                                        { backgroundColor: colors.primary },
                                        (createFeatured.isPending || perDay <= 0 || sellableDays < 1) && { opacity: 0.5 },
                                    ]}
                                    onPress={() => !createFeatured.isPending && perDay > 0 && sellableDays >= 1 && createFeatured.mutate()}
                                    accessibilityRole="button"
                                >
                                    <Text style={[styles.ctaText, { color: colors.onPrimary }]}>
                                        {createFeatured.isPending ? t('billing.creating') : t('billing.payWithQpay')}
                                    </Text>
                                </PressableScale>
                            </>
                        )}
                    </View>
                ) : (
                    <View style={styles.card}>
                        <View style={styles.planHead}>
                            <View style={styles.flex}>
                                <Text style={styles.planName}>{planLabel('PROVIDER')}</Text>
                                <Text style={styles.meta}>{t('billing.postsLimit', { count: paidPlan?.posts ?? 25 })}</Text>
                            </View>
                            <Text style={styles.price}>{formatPrice(unitPrice)}</Text>
                        </View>

                        <Text style={styles.overline}>{t('billing.months')}</Text>
                        <View style={styles.monthRow}>
                            {MONTH_CHOICES.map((m) => (
                                <TouchableOpacity
                                    key={m}
                                    onPress={() => setMonths(m)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: months === m }}
                                    activeOpacity={interactions.activeOpacityLight}
                                    style={[
                                        styles.monthChip,
                                        months === m && { backgroundColor: colors.primary },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.monthChipText,
                                            months === m && { color: colors.onPrimary },
                                        ]}
                                    >
                                        {t('billing.monthsValue', { count: m })}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.totalRow}>
                            <Text style={styles.meta}>{t('billing.total')}</Text>
                            <Text style={styles.total}>{formatPrice(unitPrice * months)}</Text>
                        </View>

                        <PressableScale
                            style={[styles.cta, { backgroundColor: colors.primary }, (create.isPending || unitPrice <= 0) && { opacity: 0.5 }]}
                            onPress={() => !create.isPending && unitPrice > 0 && create.mutate()}
                            accessibilityRole="button"
                        >
                            <Text style={[styles.ctaText, { color: colors.onPrimary }]}>
                                {create.isPending ? t('billing.creating') : t('billing.payWithQpay')}
                            </Text>
                        </PressableScale>
                    </View>
                )}

                <Text style={styles.sectionTitle}>{t('billing.history')}</Text>
                {history.length === 0 ? (
                    <Text style={styles.meta}>{t('billing.noHistory')}</Text>
                ) : (
                    history.map((p) => (
                        <View key={p.id} style={styles.historyRow}>
                            <View style={styles.flex}>
                                <Text style={styles.historyPlan}>
                                    {p.kind === 'FEATURED'
                                        ? `${t('billing.featured.title')} · ${t('billing.featured.daysValue', { count: p.days })}`
                                        : `${planLabel(p.plan)} · ${t('billing.monthsValue', { count: p.months })}`}
                                </Text>
                                {p.kind === 'FEATURED' && (
                                    /* Null once the listing is deleted — the receipt outlives it. */
                                    <Text style={styles.meta} numberOfLines={1}>
                                        {p.post?.title ?? t('billing.featured.listingGone')}
                                    </Text>
                                )}
                                <Text style={styles.meta}>
                                    {t('billing.reference')}: {p.reference ?? String(p.id).slice(0, 8)} · {formatDate(p.date_created)}
                                </Text>
                            </View>
                            <View>
                                <Text style={styles.historyAmount}>{formatPrice(p.amount)}</Text>
                                <Text style={[styles.meta, p.status === 'PAID' && { color: colors.success }]}>{p.status}</Text>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>
        </ScreenLayout>
    );
};

const createStyles = (colors) => StyleSheet.create({
    content: {
        padding: spacing.lg,
        gap: spacing.md,
        ...(isTablet ? { maxWidth: 680, alignSelf: 'center', width: '100%' } : {}),
    },
    flex: { flex: 1 },
    card: {
        ...colors.elevation.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        padding: spacing.lg,
        gap: spacing.sm,
    },
    centered: { alignItems: 'center', gap: spacing.sm },
    overline: { ...typography.styles.overline, color: colors.text.tertiary },
    planHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    planName: { ...typography.styles.h3, color: colors.text.primary },
    price: { ...typography.styles.price, color: colors.text.link },
    meta: { ...typography.styles.caption, color: colors.text.secondary },
    monthRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    monthChip: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.button,
        backgroundColor: colors.surfaceElevated,
        minHeight: 42,
        justifyContent: 'center',
    },
    monthChipText: { ...typography.styles.label, color: colors.text.primary },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: spacing.md,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border.light,
    },
    total: { ...typography.styles.h3, color: colors.text.primary },
    cta: {
        minHeight: 48,
        borderRadius: radius.button,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        marginTop: spacing.sm,
        alignSelf: 'stretch',
    },
    ctaText: { ...typography.styles.labelStrong },
    qr: { width: 220, height: 220, borderRadius: radius.card, backgroundColor: '#FFFFFF' },
    bankRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
    bankChip: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.button,
        backgroundColor: colors.surfaceElevated,
        minHeight: 42,
        justifyContent: 'center',
    },
    bankChipText: { ...typography.styles.caption, color: colors.text.primary },
    cancelText: { ...typography.styles.caption, color: colors.text.tertiary, paddingVertical: spacing.sm },
    sectionTitle: { ...typography.styles.title, color: colors.text.primary, marginTop: spacing.md },
    historyRow: {
        flexDirection: 'row',
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        padding: spacing.md,
        ...colors.elevation.sm,
    },
    historyPlan: { ...typography.styles.body, color: colors.text.primary },
    historyAmount: { ...typography.styles.bodyBold, color: colors.text.primary, textAlign: 'right' },
});

export default BillingScreen;
