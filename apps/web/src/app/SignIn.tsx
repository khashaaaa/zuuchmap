import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_EVENTS, validateMongolianPhone, type VerifyStartResponse, type VerifyStatusResponse } from '@zuuchmap/core';
import { create } from 'zustand';
import { api, ApiError, errorKey } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { useDocTitle } from '@/lib/meta';
import { mergeGuestSaves } from '@/lib/saved';
import { useToast } from '@/lib/toast';
import { track } from '@/lib/track';
import { AppHeader } from '@/ui/AppHeader';
import { Banner } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { TextField } from '@/ui/TextField';

type Phase = 'phone' | 'waiting' | 'expired' | 'tooMany';

interface VerifyState {
  phase: Phase;
  phone: string;
  session: VerifyStartResponse | null;
  /** When the one-hour block lifts (ms). */
  retryAt: number;
  set: (p: Partial<Omit<VerifyState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const useVerify = create<VerifyState>((set) => ({
  phase: 'phone',
  phone: '',
  session: null,
  retryAt: 0,
  set: (p) => set(p),
  reset: () => set({ phase: 'phone', session: null }),
}));

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** N1 → N2 → N3/N6, shared by the /login page and the C4 sheet. */
export function SignInFlow({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const v = useVerify();
  const deviceId = useAuthStore((s) => s.deviceId);
  const signIn = useAuthStore((s) => s.signIn);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const now = useNow(v.phase === 'waiting' || v.phase === 'tooMany');

  const finish = async (auth: NonNullable<VerifyStatusResponse['auth']>) => {
    signIn({ token: auth.token, user: auth.user });
    track(ANALYTICS_EVENTS.VERIFY_COMPLETED);
    v.reset();
    toast.success(t('customer.signin.signedIn'));
    onDone();
    await mergeGuestSaves(qc);
    void qc.invalidateQueries();
  };

  const start = async () => {
    if (!validateMongolianPhone(v.phone)) {
      setError(t('auth.phoneError'));
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      track(ANALYTICS_EVENTS.VERIFY_STARTED);
      const r = await api<VerifyStartResponse>('/auth/verify/start', { method: 'POST', body: { phone_number: v.phone, device_id: deviceId } });
      if (r.verified && r.auth) await finish(r.auth);
      else v.set({ session: r, phase: 'waiting' });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 429 || e.code === 'TOO_MANY_VERIFICATIONS')) v.set({ phase: 'tooMany', retryAt: Date.now() + 3600_000 });
      else setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const sessionId = v.session?.session_id;
  const phase = v.phase;
  const expiresAt = v.session?.expires_at ? new Date(v.session.expires_at).getTime() : 0;

  useEffect(() => {
    if (phase !== 'waiting' || !sessionId) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await api<VerifyStatusResponse>('/auth/verify/status', { method: 'POST', body: { session_id: sessionId } });
        if (stop) return;
        if (r.status === 'VERIFIED' && r.auth) {
          stop = true;
          await finish(r.auth);
        } else if (r.status === 'EXPIRED') {
          stop = true;
          useVerify.getState().set({ phase: 'expired' });
        }
      } catch {
        /* offline: keep polling, the code stays valid */
      }
    };
    const id = setInterval(() => void tick(), 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
    // finish is recreated per render but reads only stable store state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sessionId]);

  const copy = async () => {
    if (!v.session?.code) return;
    try {
      await navigator.clipboard.writeText(v.session.code);
      toast.success(t('customer.signin.copied'));
    } catch {
      /* clipboard unavailable: the code is on screen */
    }
  };

  if (v.phase === 'tooMany') {
    const left = v.retryAt - now;
    return (
      <div className="flex flex-col gap-4">
        <EmptyState icon="clock" title={t('customer.signin.tooManyTitle')} body={t('customer.signin.tooManyBody', { phone: v.phone })} className="py-4" />
        <div className="flex flex-col items-center gap-1 rounded-xl bg-bg-surface-sunken py-4">
          <p className="text-caption text-text-secondary">{t('customer.signin.untilRetry')}</p>
          <p className="text-h2 tabular-nums text-text-primary">{mmss(left)}</p>
          <p className="text-small text-text-secondary">{t('customer.signin.tooManyHint')}</p>
        </div>
        <Button variant="outline" onClick={() => v.reset()} disabled={left > 0}>{t('auth.startOver')}</Button>
      </div>
    );
  }

  if (v.phase === 'expired') {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState icon="clock" title={t('auth.expired')} className="py-4" />
        <Button onClick={() => v.reset()}>{t('auth.startOver')}</Button>
      </div>
    );
  }

  if (v.phase === 'waiting' && v.session) {
    const s = v.session;
    const left = expiresAt - now;
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body text-text-secondary">{t('customer.signin.verifyFrom', { phone: v.phone })}</p>
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border-subtle bg-bg-surface-sunken px-4 py-5">
          <p className="text-caption text-text-secondary">{t('customer.signin.codeLabel', { shortcode: s.shortcode })}</p>
          <p className="text-display tabular-nums tracking-[0.2em] text-text-primary">{s.code}</p>
          <Button variant="outline" size="medium" icon="copy" onClick={() => void copy()}>{t('customer.signin.copy')}</Button>
        </div>
        <ol className="flex flex-col gap-2 text-body text-text-primary">
          {(['step1', 'step2', 'step3'] as const).map((k, i) => (
            <li key={k} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-pill bg-bg-surface-sunken text-label-strong">{i + 1}</span>
              {t(`customer.signin.${k}`)}
            </li>
          ))}
        </ol>
        {mobile && s.sms_uri ? (
          <Button icon="message-circle" onClick={() => { window.location.href = s.sms_uri ?? ''; }}>{t('auth.openSms')}</Button>
        ) : (
          <Banner tone="info" title={t('customer.signin.desktopNote')} />
        )}
        <p className="flex items-center justify-center gap-2 text-caption text-text-secondary" role="status">
          <Icon name="loader-2" size={16} className="animate-spin" />
          {t('auth.waiting')} · <span className="tabular-nums">{mmss(left)}</span>
        </p>
        <p className="text-center text-small text-text-secondary">{t('customer.signin.noRepeat')}</p>
        <Button variant="outline" size="medium" onClick={() => v.reset()}>{t('auth.continueDifferent')}</Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <TextField
        label={t('profile.phone')}
        icon="phone"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={8}
        placeholder={t('auth.phonePlaceholder')}
        value={v.phone}
        onChange={(e) => {
          v.set({ phone: e.target.value.replace(/\D/g, '').slice(0, 8) });
          setError(undefined);
        }}
        helper={t('customer.signin.phoneHint')}
        error={error}
      />
      <Button type="submit" loading={busy}>{t('auth.continue')}</Button>
      <p className="text-small text-text-secondary">{t('customer.signin.fee')}</p>
    </form>
  );
}

/** `/login` and `/login/verify` (N1–N3, N6). */
export default function SignInPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const phase = useVerify((s) => s.phase);
  const token = useAuthStore((s) => s.token);
  useDocTitle(t('auth.title'));
  const from = (loc.state as { from?: string } | null)?.from ?? '/';
  const verifying = loc.pathname.endsWith('/verify');

  useEffect(() => {
    if (phase === 'waiting' && !verifying) void nav('/login/verify', { replace: true, state: loc.state });
    else if (phase !== 'waiting' && verifying) void nav('/login', { replace: true, state: loc.state });
  }, [phase, verifying, nav, loc.state]);

  if (token) return <EmptyState icon="circle-check" title={t('customer.signin.signedIn')} action={{ label: t('auth.continue'), onClick: () => void nav(from) }} />;

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col">
      <AppHeader variant="pushed" title={t('auth.title')} onBack={() => void nav(-1)} className="md:hidden" />
      <div className="flex flex-col gap-4 px-5 pb-10 pt-4 md:pt-16">
        <h1 className="text-h1 text-text-primary">{phase === 'waiting' ? t('auth.smsTitle') : t('auth.phoneTitle')}</h1>
        {phase === 'phone' && <p className="-mt-2 text-body text-text-secondary">{t('auth.phoneSubtitle')}</p>}
        <SignInFlow onDone={() => void nav(from, { replace: true })} />
      </div>
    </div>
  );
}
