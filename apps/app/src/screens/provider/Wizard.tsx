import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { Listing } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { api, ApiError, errorText } from '../../lib/api';
import { MAX_PHOTOS, itemFromAsset, newPhotoId, pickPhotos, uploadPhoto, type PhotoItem } from '../../lib/photos';
import { patchUser } from '../../lib/auth';
import { invalidateProvider, useMyStats } from '../../lib/provider';
import { usePushAsk } from '../../lib/push';
import { useCategories, useFamilies } from '../../lib/queries';
import {
  EMPTY_FORM, STEP_COUNT, diffPayload, formFromListing, stepForField, toPayload, validateStep,
  type FieldErrors, type WizardForm,
} from '../../lib/wizard';
import { useAuth } from '../../lib/auth';
import type { Nav, RootStackParamList } from '../../nav';
import { AppHeader } from '../../ui/AppHeader';
import { Banner } from '../../ui/Banner';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { PushPromptCard } from '../../ui/PushPromptCard';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { KeyboardAvoider, useKeepFocusedVisible } from '../../ui/KeyboardAvoider';
import { Modal } from '../../ui/Modal';
import { SkeletonListingRow } from '../../ui/SkeletonListingRow';
import { useToast } from '../../ui/Toast';
import { WizardSteps } from '../../ui/WizardSteps';
import { fieldLabel } from './Home';
import { StepCategory, StepDetails, StepLocation, StepPrice, StepReview } from './StepBodies';

const useStyles = themedStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bgCanvas },
  progress: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 12 },
  content: { paddingHorizontal: t.spacing.screenPadding, paddingBottom: 24, gap: 16 },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: t.spacing.screenPadding, paddingTop: 12, paddingBottom: 12, backgroundColor: t.colors.bgCanvas, borderTopWidth: 1, borderTopColor: t.colors.borderSubtle },
  h: { ...t.type.h2, color: t.colors.textPrimary },
  body: { ...t.type.caption, color: t.colors.textSecondary },
  sheetRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14 },
  label: { ...t.type.bodyMedium, color: t.colors.textPrimary },
  hint: { ...t.type.small, color: t.colors.textSecondary },
  tl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
}));

/** F1-F11, G1, G2: the listing wizard, in create, copy and edit (incl. fix-a-rejection) modes. */
export function Wizard() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const ask = usePushAsk();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Wizard'>>();
  const editId = params?.edit;
  const srcId = editId ?? params?.copyFrom;
  const cats = useCategories();
  const fams = useFamilies();
  const stats = useMyStats();
  const src = useQuery({ queryKey: ['listing', srcId], queryFn: () => api<Listing>(`/posts/${srcId}`), enabled: !!srcId, staleTime: 0 });

  const [form, setForm] = useState<WizardForm | null>(null);
  const [base, setBase] = useState<WizardForm>(EMPTY_FORM);
  const [step, setStep] = useState(params?.step ?? 1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [leave, setLeave] = useState(false);
  const [quota, setQuota] = useState(false);
  const [sent, setSent] = useState<{ id: number; category: string; days?: number } | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [photosOff, setPhotosOff] = useState(false);
  const scroll = useRef<ScrollView>(null);
  useKeepFocusedVisible(scroll);

  const cat = cats.data?.find((c) => c.key === form?.category);
  const draftEdit = !!editId && src.data?.is_draft === true;

  // Seed the form once the data it needs is here.
  useEffect(() => {
    if (form || !cats.data) return;
    if (!srcId) {
      setForm(EMPTY_FORM);
      return;
    }
    if (!src.data) return;
    const c = cats.data.find((x) => x.key === src.data.category);
    const f = formFromListing(src.data, c, !editId);
    setForm(f);
    if (editId) setPhotos((src.data.images ?? []).map((u, i) => ({ id: newPhotoId(), uri: u, key: f.images[i] ?? null, state: 'done' as const, mime: 'image/jpeg', name: 'photo.jpg' })).filter((p) => p.key));
    setBase(f);
    if (params?.step) setStep(params.step);
    else if (editId) setStep(src.data.rejection_field ? stepForField(src.data.rejection_field, c) : 2);
    else setStep(2);
  }, [form, cats.data, srcId, src.data, editId, params?.step]);

  const dirty = useMemo(() => !!form && JSON.stringify(form) !== JSON.stringify(base), [form, base]);
  const set = useCallback((patch: Partial<WizardForm>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setErrors((e) => {
      const keys = Object.keys(patch);
      if (keys.length === 0) return e;
      const next = { ...e };
      for (const k of keys) delete next[k === 'price' ? 'price_amount' : k];
      if ('attrs' in patch) for (const k of Object.keys(e)) if (cat?.fields.some((f) => f.key === k)) delete next[k];
      return next;
    });
  }, [cat]);

  // The form carries the keys of finished uploads, cover first.
  useEffect(() => {
    const keys = photos.filter((p) => p.state === 'done' && p.key).map((p) => p.key as string);
    setForm((f) => (f && JSON.stringify(f.images) !== JSON.stringify(keys) ? { ...f, images: keys } : f));
  }, [photos]);

  const patchPhoto = (id: string, patch: Partial<PhotoItem>) => setPhotos((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const startUpload = (item: PhotoItem) => {
    patchPhoto(item.id, { state: 'uploading' });
    uploadPhoto(item)
      .then((key) => patchPhoto(item.id, { key, state: 'done' }))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === 'PHOTO_STORAGE_UNAVAILABLE') {
          setPhotosOff(true);
          setPhotos((cur) => cur.filter((p) => p.id !== item.id));
          toast.show({ message: t('prov.wizard.photosUnavailable'), kind: 'info' });
        } else patchPhoto(item.id, { state: 'failed' });
      });
  };
  const addPhotos = async (source: 'library' | 'camera') => {
    setPhotoSheet(false);
    await new Promise((r) => setTimeout(r, 250));
    const assets = await pickPhotos(source, MAX_PHOTOS - photos.length);
    const items = assets.map(itemFromAsset);
    if (items.length === 0) return;
    setPhotos((cur) => [...cur, ...items]);
    items.forEach(startUpload);
  };
  const photoProps = {
    photos,
    unavailable: photosOff,
    onAdd: () => setPhotoSheet(true),
    onRemove: (id: string) => setPhotos((cur) => cur.filter((p) => p.id !== id)),
    onRetry: (id: string) => {
      const p = photos.find((x) => x.id === id);
      if (p) startUpload(p);
    },
    onCover: (id: string) => setPhotos((cur) => {
      const p = cur.find((x) => x.id === id);
      return p ? [p, ...cur.filter((x) => x.id !== id)] : cur;
    }),
  };

  const goTo = (n: number) => {
    setStep(n);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  const validateUpTo = (last: number): { step: number; errs: FieldErrors } | null => {
    if (!form) return null;
    for (let i = 1; i <= last; i++) {
      const errs = validateStep(i, form, cat, t as never);
      if (Object.keys(errs).length) return { step: i, errs };
    }
    return null;
  };

  const next = () => {
    const errs = form ? validateStep(step, form, cat, t as never) : {};
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    goTo(step + 1);
  };

  const phone = user?.phone_number ?? null;

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'POST_QUOTA_EXCEEDED') {
      setQuota(true);
      return;
    }
    if (e instanceof ApiError && e.errors.length > 0) {
      const map: Record<string, string> = {};
      for (const i of e.errors) map[i.key === 'latitude' || i.key === 'longitude' ? 'province' : i.key] = i.message;
      setErrors(map);
      goTo(Math.min(...e.errors.map((i) => stepForField(i.key, cat))));
      toast.show({ message: t('prov.wizard.fieldErrors', { count: e.errors.length }), kind: 'error' });
      return;
    }
    toast.show({ message: errorText(e), kind: 'error' });
  };

  const done = () => {
    invalidateProvider(qc);
    nav.navigate('Tabs', { screen: 'myPosts' });
  };

  const send = async () => {
    if (!form || busy) return;
    if (photos.some((p) => p.state === 'uploading')) return;
    const bad = validateUpTo(4);
    if (bad) {
      setErrors(bad.errs);
      goTo(bad.step);
      toast.show({ message: t('prov.wizard.fieldErrors', { count: Object.keys(bad.errs).length }), kind: 'error' });
      return;
    }
    setBusy(true);
    try {
      const payload = toPayload(form, phone);
      if (editId) {
        const patch = diffPayload(payload, toPayload(base, phone));
        if (draftEdit) {
          // Saved and sent for review in one request.
          await api<Listing>(`/posts/${editId}`, { method: 'PATCH', body: { ...patch, submit: true } });
          setSent({ id: editId, category: form.category ?? '' });
        } else {
          if (Object.keys(patch).length > 0) await api<Listing>(`/posts/${editId}`, { method: 'PATCH', body: patch });
          toast.show({ message: t('prov.wizard.editSent'), kind: 'success' });
          done();
        }
      } else {
        const l = await api<Listing>('/posts', { method: 'POST', body: payload });
        void patchUser({ type: 'PROVIDER' });
        setSent({ id: l.id, category: l.category, days: (l as Listing & { renew_days?: number }).renew_days });
      }
      invalidateProvider(qc);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  /** Keeps what was typed as a draft (create) or as an in-place edit (a draft being resumed). */
  const saveDraft = async (): Promise<boolean> => {
    if (!form || !form.category || form.title.trim().length === 0) return true;
    setBusy(true);
    try {
      const payload = toPayload(form, phone);
      if (editId) {
        const patch = diffPayload(payload, toPayload(base, phone));
        if (Object.keys(patch).length > 0) await api<Listing>(`/posts/${editId}`, { method: 'PATCH', body: patch });
      } else {
        await api<Listing>('/posts', { method: 'POST', body: { ...payload, draft: true } });
        void patchUser({ type: 'PROVIDER' });
      }
      invalidateProvider(qc);
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const exit = () => {
    if (nav.canGoBack()) nav.goBack();
    else nav.navigate('Tabs');
  };

  const onBack = useCallback(() => {
    if (sent) {
      done();
      return true;
    }
    if (step > 1 && !editId) {
      goTo(step - 1);
      return true;
    }
    if (dirty) setLeave(true);
    else exit();
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over fresh state each render via the ref below
  }, [sent, step, dirty]);
  const backRef = useRef(onBack);
  backRef.current = onBack;
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => backRef.current());
      return () => sub.remove();
    }, []),
  );

  const stepNames = [1, 2, 3, 4, 5].map((n) => t(`prov.wizard.s${n}`));
  const title = editId ? t('prov.wizard.editTitle') : t('prov.wizard.title');
  const fixKey = editId ? src.data?.rejection_field ?? null : null;
  const fixOn = !!(editId && src.data?.rejection_reason);
  // Only this step's errors: going back a step must not carry the next step's banner.
  const errCount = Object.keys(errors).filter((k) => stepForField(k, cat) === step).length;
  const plan = stats.data?.plan;

  // ---- F6: sent ----
  if (sent) {
    const rentable = !!cats.data?.find((c) => c.key === sent.category)?.has_availability_dates;
    const row = (icon: string, label: string, value?: string) => (
      <View style={s.tl}>
        <Icon name={icon} size={22} color={colors.iconAccent} />
        <Text style={[s.label, { flex: 1 }]}>{label}</Text>
        {value ? <Text style={s.hint}>{value}</Text> : null}
      </View>
    );
    return (
      <View style={s.screen}>
        <AppHeader variant="pushed" title={title} onBack={done} />
        <ScrollView contentContainerStyle={[s.content, { paddingTop: 16 }]}>
          <EmptyState icon="circle-check" title={t('prov.wizard.sentTitle')} body={t('prov.wizard.sentBody')} />
          <View style={{ gap: 14, padding: 16, borderRadius: 16, backgroundColor: colors.bgSurface }}>
            {row('check', t('prov.wizard.sent'))}
            {row('clock', t('prov.wizard.checking'), t('prov.wizard.checkingTime'))}
            {row('circle-check', t('prov.wizard.publishes'), t('prov.wizard.activeDays', { days: sent.days ?? cats.data?.find((c) => c.key === sent.category)?.post_expiry_days ?? 60 }))}
          </View>
          {ask.show ? <PushPromptCard title={t('push.promptTitle')} body={t('push.reasonPost')} onEnable={ask.enable} onLater={ask.later} /> : null}
          {rentable ? <Text style={s.body}>{t('prov.wizard.sentBlockHint')}</Text> : null}
          {rentable ? <Button label={t('prov.wizard.blockDays')} icon="calendar" variant="outline" fullWidth onPress={() => nav.navigate('BlockDays', { postId: sent.id })} /> : null}
          <Button label={t('prov.wizard.toMyListings')} fullWidth onPress={done} />
          <Button
            label={t('prov.wizard.addAnother')}
            variant="outline"
            fullWidth
            onPress={() => { setSent(null); setForm(EMPTY_FORM); setBase(EMPTY_FORM); setErrors({}); setStep(1); nav.setParams({ edit: undefined, copyFrom: undefined, step: undefined }); }}
          />
        </ScrollView>
      </View>
    );
  }

  const loading = !form || (!!srcId && !src.data && !src.isError);
  const failed = !!srcId && src.isError;

  const last = step === STEP_COUNT;
  return (
    <View style={s.screen}>
      <AppHeader variant="pushed" title={title} onBack={() => void backRef.current()} />
      {failed ? (
        <EmptyState icon="wifi-off" title={t('deal.mine.errorTitle')} body={errorText(src.error)} actionLabel={t('deal.retry')} onAction={() => void src.refetch()} />
      ) : loading || !form ? (
        <View style={{ padding: 16, gap: 12 }}><SkeletonListingRow /><SkeletonListingRow /></View>
      ) : (
        <KeyboardAvoider>
          <View style={s.progress}><WizardSteps steps={stepNames} current={step} /></View>
          <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            {fixOn && step === stepForField(fixKey, cat) ? (
              <View style={{ gap: 8 }}>
                <Banner tone="danger" title={`${t('prov.wizard.fixNote')} · ${fieldLabel(t, fixKey, cat)}`} body={t('prov.wizard.fixReason', { reason: src.data?.rejection_reason ?? '' })} />
                {src.data?.approval_status === 'APPROVED' ? <Text style={s.body}>{t('prov.wizard.fixLiveNote')}</Text> : null}
              </View>
            ) : null}
            {errCount > 0 ? <Banner tone="danger" title={t('prov.wizard.fieldErrors', { count: errCount })} body={t('prov.wizard.fieldErrorsBody')} /> : null}
            {step === 1 ? <StepCategory form={form} set={set} errors={errors} cats={cats.data ?? []} families={fams.data ?? []} locked={!!editId} /> : null}
            {step === 2 ? <StepDetails form={form} set={set} errors={errors} cat={cat} locked={!!editId} photoProps={photoProps} /> : null}
            {step === 3 ? <StepPrice form={form} set={set} errors={errors} cat={cat} locked={!!editId} onBlockDays={editId ? () => nav.navigate('BlockDays', { postId: editId }) : undefined} /> : null}
            {step === 4 ? <StepLocation form={form} set={set} errors={errors} cat={cat} locked={!!editId} /> : null}
            {step === 5 ? <StepReview form={form} cat={cat} photoCount={photos.filter((p) => p.state === 'done').length} onEdit={goTo} /> : null}
          </ScrollView>
          <View style={[s.footer, { paddingBottom: 12 + insets.bottom }]}>
            {last && !editId ? <Button label={t('prov.wizard.saveDraft')} variant="outline" disabled={busy} style={{ flex: 0 }} onPress={() => void saveDraft().then((ok) => { if (ok) { toast.show({ message: t('prov.wizard.draftSaved', { age: t('prov.wizard.justNow') }), kind: 'success' }); done(); } })} /> : null}
            {editId && !last ? <Button label={t('prov.wizard.next')} variant="outline" onPress={next} /> : null}
            <View style={{ flex: 1 }}>
              {last || editId ? (
                <Button label={editId && !draftEdit ? t('prov.wizard.sendFix') : t('prov.wizard.send')} fullWidth loading={busy} onPress={() => void send()} />
              ) : (
                <Button label={t('prov.wizard.next')} fullWidth onPress={next} />
              )}
            </View>
          </View>
        </KeyboardAvoider>
      )}

      <BottomSheet visible={photoSheet} onClose={() => setPhotoSheet(false)} title={t('prov.wizard.photos')}>
        <Button label={t('provider.photoFirstGallery')} icon="image" variant="outline" fullWidth onPress={() => void addPhotos('library')} />
        <Button label={t('provider.photoFirstCamera')} icon="camera" variant="outline" fullWidth onPress={() => void addPhotos('camera')} />
      </BottomSheet>

      {/* F10 / F11 */}
      <Modal
        visible={leave}
        onClose={() => setLeave(false)}
        title={editId && !draftEdit ? t('prov.wizard.discardTitle') : t('prov.wizard.leaveTitle')}
        body={editId && !draftEdit ? t('prov.wizard.discardBody') : t('prov.wizard.leaveBody')}
        icon={editId && !draftEdit ? 'trash-2' : 'info'}
        iconTone={editId && !draftEdit ? 'danger' : 'info'}
        cancelLabel={t('prov.wizard.keepEditing')}
        confirmLabel={editId && !draftEdit ? t('prov.wizard.discard') : t('prov.wizard.leave')}
        destructive={!!editId && !draftEdit}
        onConfirm={() => {
          setLeave(false);
          if (editId && !draftEdit) exit();
          else void saveDraft().then(exit);
        }}
      />

      {/* G2: at the plan limit */}
      <BottomSheet
        visible={quota}
        onClose={() => setQuota(false)}
        title={t('prov.limit.title', { limit: plan?.post_limit ?? 0, used: plan?.active_posts ?? 0 })}
        footerLabel={t('prov.limit.startDraft')}
        onFooter={() => {
          setQuota(false);
          if (!form) return;
          setBusy(true);
          api<Listing>('/posts', { method: 'POST', body: { ...toPayload(form, phone), draft: true } })
            .then(() => { toast.show({ message: t('prov.wizard.draftSaved', { age: t('prov.wizard.justNow') }), kind: 'success' }); done(); })
            .catch(fail)
            .finally(() => setBusy(false));
        }}
      >
        <Text style={s.body}>{t('prov.limit.body')}</Text>
        <View style={s.sheetRow}>
          <Icon name="star" size={22} color={colors.iconSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={[s.label, { color: colors.textDisabled }]}>{t('prov.limit.plan')}</Text>
            <Text style={s.hint}>{t('prov.limit.planHint', { count: plan?.post_limit ?? 0 })}</Text>
          </View>
        </View>
        <Button label={t('prov.limit.finishOne')} variant="outline" icon="list" onPress={() => { setQuota(false); done(); }} />
        <Button label={t('prov.limit.deleteOld')} variant="outline" icon="trash-2" onPress={() => { setQuota(false); done(); }} />
      </BottomSheet>
    </View>
  );
}
