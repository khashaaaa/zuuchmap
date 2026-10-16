import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { PROVINCE_CODES, normalizeWebsiteUrl, validateEmail, type Company as CompanyData, type CompanyWriteRequest } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { api, ApiError, errorText } from '../../lib/api';
import { placeLabel } from '../../lib/browse';
import { invalidateProvider, useMyCompany } from '../../lib/provider';
import type { Nav } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Avatar } from '../../ui/Avatar';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { KeyboardAvoider, useKeepFocusedVisible } from '../../ui/KeyboardAvoider';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 24, gap: 16 },
  h: { ...t.type.h3, color: t.colors.textPrimary },
  cap: { ...t.type.caption, color: t.colors.textSecondary },
  group: { ...t.type.overline, color: t.colors.textSecondary, paddingTop: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { ...t.type.labelStrong, color: t.colors.textLink },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: t.colors.borderSubtle, backgroundColor: t.colors.bgCanvas },
}));

interface Draft {
  name: string; description: string; website: string; address: string; phone: string; email: string; reg: string; tax: string; area: string[];
}
const fromCompany = (c: CompanyData | null): Draft => ({
  name: c?.name ?? '', description: c?.description ?? '', website: c?.website ?? '', address: c?.address ?? '', phone: c?.phone_number ?? '',
  email: c?.email ?? '', reg: c?.registration_number ?? '', tax: c?.tax_id ?? '', area: c?.service_area ?? [],
});

/** G4 / G5: the company profile, create or edit. No logo upload while photo storage is off. */
export function CompanyScreen() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const qc = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  useKeepFocusedVisible(scroll);
  const q = useMyCompany();
  const company = q.data?.company ?? null;
  const [d, setD] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data && !d) setD(fromCompany(q.data.company));
  }, [q.data, d]);

  const orig = fromCompany(company);
  const set = (patch: Partial<Draft>) => {
    setD((x) => (x ? { ...x, ...patch } : x));
    setErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(patch)) delete n[k];
      return n;
    });
  };

  const save = async () => {
    if (!d) return;
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = t('company.nameRequired');
    if (d.email.trim() && !validateEmail(d.email.trim())) e.email = t('common.invalidEmail');
    if (d.phone.trim() && !/^\d{8}$/.test(d.phone.trim())) e.phone = t('form.phoneDigits');
    if (d.reg.trim() && !/^\d{7}$/.test(d.reg.trim())) e.reg = t('ui.emailInvalid');
    if (d.tax.trim() && !/^\d{7,12}$/.test(d.tax.trim())) e.tax = t('ui.emailInvalid');
    setErrors(e);
    if (Object.keys(e).length) return;
    const body: CompanyWriteRequest = {
      name: d.name.trim(),
      description: d.description.trim() || null,
      website: normalizeWebsiteUrl(d.website) || null,
      address: d.address.trim() || null,
      phone_number: d.phone.trim() || null,
      email: d.email.trim() || null,
      registration_number: d.reg.trim() || null,
      tax_id: d.tax.trim() || null,
      service_area: d.area,
    };
    setBusy(true);
    try {
      await api<CompanyData>('/company', { method: company ? 'PATCH' : 'POST', body });
      toast.show({ message: t(company ? 'prov.company.saved' : 'prov.company.created'), kind: 'success' });
      invalidateProvider(qc);
      for (const k of ['my-company', 'seller', 'profile']) void qc.invalidateQueries({ queryKey: [k] });
      nav.goBack();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'COMPANY_EXISTS') void q.refetch();
      toast.show({ message: errorText(err), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const touchesVerified = !!company?.is_verified && !!d && (d.name.trim() !== orig.name || d.reg.trim() !== orig.reg || d.tax.trim() !== orig.tax);

  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={company ? t('prov.company.title') : t('prov.company.create')} onBack={() => nav.goBack()} />
      {q.isLoading || (q.data && !d) ? (
        <View style={{ padding: 16, gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /></View>
      ) : q.isError || !d ? (
        <EmptyState icon="wifi-off" title={t('deal.mine.errorTitle')} body={errorText(q.error)} actionLabel={t('deal.retry')} onAction={() => void q.refetch()} />
      ) : (
        <KeyboardAvoider>
          <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <View style={s.head}>
              <Avatar size="large" kind="company" name={d.name} uri={company?.logo} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.h} numberOfLines={1}>{d.name || t('prov.company.newCompany')}</Text>
                {company?.is_verified ? (
                  <View style={s.badge}>
                    <Icon name="badge-check" size={18} color={colors.iconAccent} />
                    <Text style={s.badgeText}>{t('prov.company.verified')}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            {!company ? <Banner tone="info" title={t('prov.company.createNote')} /> : null}
            {touchesVerified ? <Banner tone="warning" title={t('prov.company.verifyWarning')} /> : null}

            <Text style={s.group}>{t('prov.company.general')}</Text>
            <TextField label={t('prov.company.name')} value={d.name} onChangeText={(v) => set({ name: v })} maxLength={120} error={errors.name} />
            <TextField label={t('prov.company.about')} value={d.description} onChangeText={(v) => set({ description: v })} multiline maxLength={1000} />
            <View style={{ gap: 8 }}>
              <Text style={s.group}>{t('prov.company.serviceArea')}</Text>
              <View style={s.wrap}>
                {PROVINCE_CODES.map((p) => (
                  <Chip key={p} label={placeLabel(t as never, p) ?? p} selected={d.area.includes(p)} onPress={() => set({ area: d.area.includes(p) ? d.area.filter((x) => x !== p) : [...d.area, p] })} />
                ))}
              </View>
            </View>

            <Text style={s.group}>{t('prov.company.contact')}</Text>
            <TextField label={t('prov.company.phone')} value={d.phone} onChangeText={(v) => set({ phone: v.replace(/\D/g, '').slice(0, 8) })} inputMode="tel" error={errors.phone} />
            <TextField label={t('prov.company.website')} value={d.website} onChangeText={(v) => set({ website: v })} inputMode="url" maxLength={200} />
            <TextField label={t('prov.company.email')} value={d.email} onChangeText={(v) => set({ email: v })} inputMode="email" maxLength={320} error={errors.email} />
            <TextField label={t('prov.company.address')} value={d.address} onChangeText={(v) => set({ address: v })} maxLength={300} />

            <Text style={s.group}>{t('prov.company.legal')}</Text>
            <TextField label={`${t('prov.company.regNo')} · ${t('prov.company.optional')}`} value={d.reg} onChangeText={(v) => set({ reg: v.replace(/\D/g, '').slice(0, 7) })} inputMode="numeric" error={errors.reg} />
            <TextField label={`${t('prov.company.taxId')} · ${t('prov.company.optional')}`} value={d.tax} onChangeText={(v) => set({ tax: v.replace(/\D/g, '').slice(0, 12) })} inputMode="numeric" error={errors.tax} />
            <Text style={s.cap}>{t('prov.company.logoUnavailable')}</Text>
          </ScrollView>
          <View style={[s.footer, { paddingBottom: 16 + insets.bottom }]}>
            <Button label={t('prov.company.save')} fullWidth loading={busy} onPress={() => void save()} />
          </View>
        </KeyboardAvoider>
      )}
    </View>
  );
}
