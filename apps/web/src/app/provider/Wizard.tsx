import { useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Listing } from '@zuuchmap/core';
import { api, ApiError, errorKey } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { useCategoryLookup } from '@/lib/labels';
import { useDocTitle } from '@/lib/meta';
import { useBadges } from '@/lib/notifications';
import {
  EMPTY_FORM, formFromListing, stepForField, issuesToErrors, stepOfError, toRequest, useMyListings, useOwnListing, useRefreshListings, validateStep as validateWizardStep,
  type FieldErrors, type WizardForm,
} from '@/lib/provider';
import { useToast } from '@/lib/toast';
import { AppHeader } from '@/ui/AppHeader';
import { Banner } from '@/ui/Banner';
import { BottomSheet } from '@/ui/BottomSheet';
import { Button } from '@/ui/Button';
import { DesktopWizardHeader } from '@/ui/DesktopHeader';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { WizardSteps } from '@/ui/WizardSteps';
import { NeedSignIn } from '../NeedSignIn';
import { Sent } from './wizard/Sent';
import { StepCategory } from './wizard/StepCategory';
import { StepDetails } from './wizard/StepDetails';
import { StepLocation } from './wizard/StepLocation';
import { StepPrice } from './wizard/StepPrice';
import { StepReview } from './wizard/StepReview';

interface BodyProps {
  editId: number | null;
  listing: Listing | null;
  copy: Listing | null;
  fix: boolean;
  startStep?: number;
}

const isDraftListing = (l: Listing | null): boolean => l?.is_draft === true;

function Body({ editId, listing, copy, fix, startStep }: BodyProps) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const me = useAuthStore((s) => s.user);
  const refresh = useRefreshListings();
  const cats = useCategoryLookup();
  const plan = useBadges()?.plan;

  const draftMode = editId === null || isDraftListing(listing);
  const editing = editId !== null;
  const initial = listing ? formFromListing(listing) : copy ? formFromListing(copy, false) : EMPTY_FORM;
  const rejectedField = !draftMode ? (listing?.rejection_field ?? null) : null;
  const [form, setForm] = useState<WizardForm>(initial);
  const [step, setStep] = useState(startStep ?? (editing || copy ? 2 : 1));
  const [fixing, setFixing] = useState(fix && !!listing && !draftMode);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [id, setId] = useState<number | null>(editId);
  const mineItem = useMyListings().data?.find((p) => p.id === id);
  const [savedAt, setSavedAt] = useState<boolean>(isDraftListing(listing));
  const [dirty, setDirty] = useState(false);
  const [leave, setLeave] = useState(false);
  const [limit, setLimit] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ id: number } | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const idRef = useRef<number | null>(editId);

  const cat = form.category ? cats.byKey.get(form.category) : undefined;
  useDocTitle(t(draftMode ? 'prov.wizard.title' : 'prov.wizard.editTitle'));

  const set = (patch: Partial<WizardForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    setErrors((e) => {
      if (Object.keys(e).length === 0) return e;
      const next = { ...e };
      if ('title' in patch) delete next.title;
      if ('price' in patch) delete next.price;
      if ('province' in patch) delete next.province;
      if ('district' in patch) delete next.district;
      if ('category' in patch) delete next.category;
      if ('attributes' in patch) for (const k of Object.keys(next)) if (k.startsWith('attr.')) delete next[k];
      return next;
    });
  };

  /**
   * Creates the draft on first call, patches it after; serialised so quick steps never create two.
   * With `submit` the same request sends it for review (a new listing is created already sent).
   */
  const saveDraft = (submit = false): Promise<number> => {
    const run = async (): Promise<number> => {
      const cur = idRef.current;
      if (cur === null) {
        const res = await api<Listing>('/posts', { method: 'POST', body: toRequest(form, { create: true, draft: !submit, phone: me?.phone_number, cat, submit }) });
        idRef.current = res.id;
        setId(res.id);
        useAuthStore.getState().patchUser({ type: 'PROVIDER' });
        setSavedAt(true);
        return res.id;
      }
      await api<Listing>(`/posts/${cur}`, { method: 'PATCH', body: { ...toRequest(form, { create: false, cat, submit }), ...(submit ? { submit: true } : {}) } });
      setSavedAt(true);
      return cur;
    };
    const p = queue.current.then(run, run);
    queue.current = p.catch(() => undefined);
    return p;
  };

  const validate = (upTo: number): { errs: FieldErrors; first: number | null } => {
    const errs: FieldErrors = {};
    for (let s = 1; s <= upTo; s++) {
      if (s === 1 && editing) continue;
      Object.assign(errs, validateWizardStep(s, form, cat));
    }
    const keys = Object.keys(errs);
    return { errs, first: keys.length ? Math.min(...keys.map(stepOfError)) : null };
  };

  const goto = (n: number) => {
    setErrors({});
    setStep(n);
    window.scrollTo({ top: 0 });
  };

  const next = () => {
    const errs = validateWizardStep(step, form, cat);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    if (draftMode && step >= 2) void saveDraft().then(() => refresh()).catch(() => undefined);
    goto(step + 1);
  };

  const back = () => (step > (editing ? 2 : 1) ? goto(step - 1) : requestLeave());

  const requestLeave = () => {
    if (!dirty) exit();
    else setLeave(true);
  };
  const exit = () => void nav('/provider/listings', { replace: true });

  const confirmLeave = async () => {
    setLeave(false);
    if (draftMode && form.category && form.title.trim().length > 0) {
      try {
        await saveDraft();
        refresh();
      } catch (e) {
        toast.error(t(errorKey(e)));
      }
    }
    exit();
  };

  /** A 400 with field issues marks those fields and opens the step that holds them. */
  const onIssues = (e: unknown): boolean => {
    if (!(e instanceof ApiError) || e.issues.length === 0) return false;
    const errs = issuesToErrors(e.issues);
    setErrors(errs);
    setStep(Math.min(...Object.keys(errs).map(stepOfError)));
    window.scrollTo({ top: 0 });
    return true;
  };

  const onQuota = (e: unknown): boolean => {
    if (e instanceof ApiError && e.code === 'POST_QUOTA_EXCEEDED') {
      setLimit(true);
      return true;
    }
    return false;
  };

  const send = async (fixOnly = false) => {
    const { errs, first } = fixOnly ? { errs: validateWizardStep(step, form, cat), first: null as number | null } : validate(4);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      if (first !== null && first !== step) setStep(first);
      window.scrollTo({ top: 0 });
      return;
    }
    setSending(true);
    try {
      if (draftMode) {
        const pid = await saveDraft(true);
        refresh();
        setSent({ id: pid });
      } else if (id !== null) {
        const res = await api<Listing>(`/posts/${id}`, { method: 'PATCH', body: toRequest(form, { create: false, cat, submit: true }) });
        refresh();
        toast.success(t(res.approval_status === 'APPROVED' && !res.pending_revision ? 'prov.wizard.editPublished' : 'prov.wizard.editSent'));
        exit();
      }
    } catch (e) {
      if (!onQuota(e) && !onIssues(e)) toast.error(t(errorKey(e)));
    } finally {
      setSending(false);
    }
  };

  const keepAsDraft = async () => {
    setSending(true);
    try {
      await saveDraft();
      refresh();
      toast.success(t('ui.prov.draftKept'));
      exit();
    } catch (e) {
      toast.error(t(errorKey(e)));
    } finally {
      setSending(false);
    }
  };

  const blockDays = async () => {
    try {
      const pid = await saveDraft();
      void nav(`/provider/block?post=${pid}`);
    } catch (e) {
      toast.error(t(errorKey(e)));
    }
  };

  if (sent) return <Sent id={sent.id} title={form.title} rentable={!!cat?.has_availability_dates} days={mineItem?.renew_days ?? cat?.post_expiry_days ?? 60} onAnother={() => void nav(`/provider/new?fresh=${Date.now()}`, { replace: true })} />;

  const title = t(draftMode ? 'prov.wizard.title' : 'prov.wizard.editTitle');
  const props = { form, set, errors, cat, editing };
  // Only this step's errors: going back a step must not carry the next step's banner.
  const errCount = Object.keys(errors).filter((k) => stepOfError(k) === step).length;
  const fieldHere = rejectedField && stepForField(rejectedField) === step;
  const last = step === 5;
  const nextName = !last ? t(`kit.wizard.s${step + 1}`) : '';

  const body = (() => {
    switch (step) {
      case 1: return <StepCategory {...props} />;
      case 2: return <StepDetails {...props} />;
      case 3: return <StepPrice {...props} postId={id} onBlock={() => void blockDays()} />;
      case 4: return <StepLocation {...props} />;
      default: return <StepReview {...props} goto={goto} blockedLabel={t('prov.wizard.allFree')} />;
    }
  })();

  const footer = fixing ? (
    <>
      <Button loading={sending} onClick={() => void send(true)} className="flex-1 px-3! md:flex-none">{t('prov.wizard.sendFix')}</Button>
      <Button variant="outline" className="px-3!" onClick={() => { setFixing(false); goto(5); }}>{t('prov.wizard.otherStep')}</Button>
    </>
  ) : last ? (
    draftMode ? (
      <>
        <Button loading={sending} onClick={() => void send()} className="flex-1 md:flex-none">{t('prov.wizard.send')}</Button>
        <Button variant="outline" disabled={sending} onClick={() => void keepAsDraft()}>{t('prov.wizard.saveDraft')}</Button>
      </>
    ) : (
      <Button loading={sending} onClick={() => void send()} className="flex-1 md:flex-none">{t('prov.wizard.sendFix')}</Button>
    )
  ) : (
    <>
      <Button variant="outline" onClick={back}>{t('prov.wizard.back')}</Button>
      <Button onClick={next} className="flex-1 md:flex-none">{`${t('prov.wizard.next')}: ${nextName.toLowerCase()}`}</Button>
    </>
  );

  return (
    <div className="pb-28 md:pb-10">
      <AppHeader variant="pushed" title={title} onBack={back} action={{ icon: 'x', label: t('common.close'), onClick: requestLeave }} className="md:hidden" />
      <div className="px-4 pb-3 md:hidden"><WizardSteps current={step} /></div>
      <div className="hidden px-8 pt-8 md:block">
        <DesktopWizardHeader title={title} current={step} savedNote={draftMode && savedAt ? t('prov.wizard.draftSaved', { age: t('prov.wizard.justNow') }) : undefined} />
      </div>
      <div className="flex flex-col gap-4 px-4 pt-2 md:px-8 md:pt-6">
        {errCount > 0 && <Banner tone="danger" title={t('prov.wizard.fieldErrors', { count: errCount })} body={t('prov.wizard.fieldErrorsBody')} />}
        {fixing && listing && (
          <Banner
            tone="warning"
            title={t('prov.wizard.fixNote')}
            body={[listing.rejection_reason ? t('prov.wizard.fixReason', { reason: listing.rejection_reason }) : '', listing.approval_status === 'APPROVED' ? t('prov.wizard.fixLiveNote') : ''].filter(Boolean).join(' ')}
          />
        )}
        {fieldHere && !fixing && listing?.rejection_reason && <Banner tone="danger" title={t('prov.wizard.fixNote')} body={t('prov.wizard.fixReason', { reason: listing.rejection_reason })} />}
        {body}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-border-subtle bg-bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 md:static md:mt-6 md:border-0 md:bg-transparent md:px-8 md:pb-0 md:pt-0">
        {footer}
      </div>

      <Modal
        open={leave}
        onClose={() => setLeave(false)}
        tone={draftMode ? 'info' : 'warning'}
        destructive={!draftMode}
        title={t(draftMode ? 'prov.wizard.leaveTitle' : 'prov.wizard.discardTitle')}
        body={t(draftMode ? 'prov.wizard.leaveBody' : 'prov.wizard.discardBody')}
        cancelLabel={t('prov.wizard.keepEditing')}
        confirmLabel={t(draftMode ? 'prov.wizard.leave' : 'prov.wizard.discard')}
        onConfirm={() => void confirmLeave()}
      />
      <BottomSheet
        open={limit}
        onClose={() => setLimit(false)}
        title={t('prov.limit.title', { limit: plan?.post_limit ?? '', used: plan?.active_posts ?? '' })}
        primary={{ label: t('prov.limit.startDraft'), onClick: () => { setLimit(false); void keepAsDraft(); } }}
      >
        <p className="text-body text-text-secondary">{t('prov.limit.body')}</p>
        <ul className="flex flex-col">
          {[
            { icon: 'sparkles', label: t('prov.limit.plan'), go: () => void nav('/provider/billing') },
            { icon: 'circle-check', label: t('prov.limit.finishOne'), hint: undefined, go: () => void nav('/provider/listings?filter=live') },
            { icon: 'trash-2', label: t('prov.limit.deleteOld'), hint: t('prov.limit.deleteOldHint'), go: () => void nav('/provider/listings') },
          ].map((r) => (
            <li key={r.label}>
              <button type="button" onClick={r.go} className="flex min-h-14 w-full items-center gap-3 rounded-md px-2 text-left focus-visible:outline-none focus-visible:shadow-focus">
                <Icon name={r.icon} size={20} className="text-icon-secondary" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-bold text-text-primary">{r.label}</span>
                  {r.hint && <span className="text-caption text-text-secondary">{r.hint}</span>}
                </span>
                <Icon name="chevron-right" size={18} className="text-icon-secondary" />
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </div>
  );
}

/** F1–F11 and G1/G2: create (`/provider/new[?copy=id]`) or edit (`/provider/listings/:id/edit[?fix=1]`). */
export default function Wizard() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const token = useAuthStore((s) => s.token);
  const params = useParams();
  const [sp] = useSearchParams();
  const editId = params.id ? Number(params.id) : null;
  const copyId = sp.get('copy') ? Number(sp.get('copy')) : null;
  const own = useOwnListing(editId ?? copyId);
  const stepParam = Number(sp.get('step'));

  if (!token) return <NeedSignIn />;
  if (editId !== null || copyId !== null) {
    if (own.isError) return <EmptyState icon="circle-alert" title={t('errors.notFound')} action={{ label: t('prov.tab.listings'), onClick: () => void nav('/provider/listings') }} className="py-24" />;
    if (!own.data) return <div className="p-8 text-center text-caption text-text-secondary" role="status">{t('ui.loading')}</div>;
  }
  const listing = editId !== null ? (own.data ?? null) : null;
  const copy = copyId !== null && editId === null ? (own.data ?? null) : null;
  const fix = sp.get('fix') === '1';
  // A notification names the field itself (`?field=`); otherwise the listing's own refused field.
  const fixField = sp.get('field') ?? listing?.rejection_field ?? null;
  const start = fix && fixField ? stepForField(fixField) : stepParam >= 1 && stepParam <= 5 ? stepParam : undefined;
  return <Body key={`${editId ?? 'new'}-${copyId ?? ''}-${sp.get('fresh') ?? ''}`} editId={editId} listing={listing} copy={copy} fix={fix} startStep={start} />;
}
