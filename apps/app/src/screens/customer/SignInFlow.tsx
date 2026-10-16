import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ANALYTICS_EVENTS, validateMongolianPhone, type AuthResponse, type VerifyStartResponse, type VerifyStatusResponse } from '@zuuchmap/core';
import { themedStyles, useAppTheme } from '../../design/theme';
import { api, ApiError, errorText } from '../../lib/api';
import { getDeviceId, getToken, setAuth } from '../../lib/auth';
import { mergeGuestSaves } from '../../lib/queries';
import { track } from '../../lib/track';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Icon } from '../../ui/Icon';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';

const useStyles = themedStyles((t) => ({
  card: { alignItems: 'center', gap: 6, paddingVertical: 20, paddingHorizontal: 16, borderRadius: t.radius.card, backgroundColor: t.colors.bgSurface, borderWidth: 1, borderColor: t.colors.borderSubtle },
  codeCap: { ...t.type.small, color: t.colors.textSecondary },
  code: { ...t.type.display, color: t.colors.textPrimary, letterSpacing: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.bgSurfaceSunken },
  stepNumText: { ...t.type.labelStrong, color: t.colors.textPrimary },
  stepText: { ...t.type.bodyMedium, color: t.colors.textPrimary, flex: 1 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: t.radius.lg, backgroundColor: t.colors.statusInfoTint },
  timerText: { ...t.type.labelStrong, color: t.colors.statusInfo, flex: 1 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteText: { ...t.type.small, color: t.colors.textSecondary, flex: 1 },
  link: { ...t.type.labelStrong, color: t.colors.textLink },
  small: { ...t.type.small, color: t.colors.textSecondary },
}));

type Step =
  | { kind: 'phone' }
  | { kind: 'code'; phone: string; session: VerifyStartResponse }
  | { kind: 'expired'; phone: string }
  | { kind: 'tooMany'; phone: string; until: number };

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export interface SignInFlowProps {
  /** Called once after the session is stored and the device saves were merged. */
  onDone: () => void;
  /** Dock the primary action to the bottom (the full screen); in a sheet it sits under the content. */
  fill?: boolean;
  /** Shown on the phone step above the field (the screen's title block). */
  header?: ReactNode;
}

/** N1 phone → N2 code (poll) → N3 expired / N6 too many. The same steps in the SignIn screen and the C4 sheet. */
export function SignInFlow({ onDone, fill, header }: SignInFlowProps) {
  const s = useStyles();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: 'phone' });
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const finish = useCallback(
    async (auth: AuthResponse) => {
      await setAuth(auth);
      track(ANALYTICS_EVENTS.VERIFY_COMPLETED);
      await mergeGuestSaves(qc);
      doneRef.current();
    },
    [qc],
  );

  const start = async (number: string) => {
    setBusy(true);
    setError(null);
    track(ANALYTICS_EVENTS.VERIFY_STARTED);
    try {
      const res = await api<VerifyStartResponse>('/auth/verify/start', { method: 'POST', body: { phone_number: number, device_id: await getDeviceId() } });
      if (res.verified && res.auth) await finish(res.auth);
      else setStep({ kind: 'code', phone: number, session: res });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 429 || e.code === 'TOO_MANY_VERIFICATIONS')) setStep({ kind: 'tooMany', phone: number, until: Date.now() + 3600_000 });
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const session = step.kind === 'code' ? step.session : null;
  const now = useNow(step.kind === 'code' || step.kind === 'tooMany');
  const expiresAt = session?.expires_at ? new Date(session.expires_at).getTime() : 0;

  // Poll the status every 2 s while the code is showing.
  const sessionId = session?.session_id;
  useEffect(() => {
    if (!sessionId || step.kind !== 'code') return;
    const phoneNo = step.phone;
    let stopped = false;
    const id = setInterval(async () => {
      try {
        const r = await api<VerifyStatusResponse>('/auth/verify/status', { method: 'POST', body: { session_id: sessionId } });
        if (stopped) return;
        setPollFailed(false);
        if (r.status === 'VERIFIED' && r.auth) {
          stopped = true;
          clearInterval(id);
          void finish(r.auth);
        } else if (r.status === 'EXPIRED') {
          stopped = true;
          clearInterval(id);
          setStep({ kind: 'expired', phone: phoneNo });
        }
      } catch {
        if (!stopped) setPollFailed(true);
      }
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the session only
  }, [sessionId, finish]);

  useEffect(() => {
    if (step.kind === 'code' && expiresAt && now >= expiresAt) setStep({ kind: 'expired', phone: step.phone });
  }, [now, expiresAt, step]);

  const openSms = async () => {
    if (!session?.sms_uri) return;
    try {
      await Linking.openURL(session.sms_uri);
    } catch {
      toast.show({ message: t('auth.smsOpenError'), kind: 'error' });
    }
  };

  const copyCode = async () => {
    if (!session?.code) return;
    await Clipboard.setStringAsync(session.code);
    toast.show({ message: t('customer.signin.copied'), kind: 'success' });
  };

  const body = (content: ReactNode, footer?: ReactNode) => (
    <View style={fill ? { flex: 1, justifyContent: 'space-between', gap: 16 } : { gap: 16 }}>
      <View style={{ gap: 16 }}>{content}</View>
      {footer ? <View style={{ gap: 12 }}>{footer}</View> : null}
    </View>
  );

  if (step.kind === 'tooMany') {
    return body(
      <>
        <EmptyState icon="clock" title={t('customer.signin.tooManyTitle')} body={t('customer.signin.tooManyBody', { phone: step.phone })} />
        <View style={s.timer}>
          <Icon name="clock" size={20} color={colors.statusInfo} />
          <Text style={s.timerText}>{t('customer.signin.untilRetry')}</Text>
          <Text style={s.timerText}>{mmss(step.until - now)}</Text>
        </View>
        <Text style={s.small}>{t('customer.signin.tooManyHint')}</Text>
      </>,
      <Button label={t('auth.startOver')} variant="outline" fullWidth disabled={step.until > now} onPress={() => setStep({ kind: 'phone' })} />,
    );
  }

  if (step.kind === 'expired') {
    return body(<EmptyState icon="clock" title={t('auth.expired')} actionLabel={t('auth.startOver')} onAction={() => void start(step.phone)} actionVariant="secondary" />);
  }

  if (step.kind === 'code' && session) {
    const code = session.code ?? '';
    const spaced = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
    return body(
      <>
        <Text style={s.small}>{t('customer.signin.verifyFrom', { phone: step.phone })}</Text>
        <View style={s.card}>
          <Text style={s.codeCap}>{t('customer.signin.codeLabel', { shortcode: session.shortcode })}</Text>
          <Text style={s.code} accessibilityLabel={code.split('').join(' ')} selectable>{spaced}</Text>
          <Pressable onPress={() => void copyCode()} accessibilityRole="button" accessibilityLabel={t('customer.signin.copy')} hitSlop={12} style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="copy" size={16} color={colors.textLink} />
            <Text style={s.link}>{t('customer.signin.copy')}</Text>
          </Pressable>
        </View>
        {['step1', 'step2', 'step3'].map((k, i) => (
          <View key={k} style={s.stepRow}>
            <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
            <Text style={s.stepText}>{t(`customer.signin.${k}`)}</Text>
          </View>
        ))}
        <View style={s.timer} accessibilityLiveRegion="polite">
          <Icon name="clock" size={20} color={colors.statusInfo} />
          <Text style={s.timerText}>{t('auth.waiting')}</Text>
          <Text style={s.timerText}>{mmss(expiresAt - now)}</Text>
        </View>
        {pollFailed ? <Text style={[s.small, { color: colors.statusWarning }]}>{t('auth.pollOffline')}</Text> : null}
        <Text style={s.small}>{t('auth.manualHint', { code, shortcode: session.shortcode })}</Text>
      </>,
      <>
        <Button label={t('auth.openSms')} icon="message-circle" fullWidth onPress={() => void openSms()} />
        <View style={s.note}>
          <Icon name="circle-check" size={16} color={colors.iconSecondary} />
          <Text style={s.noteText}>{t('customer.signin.noRepeat')}</Text>
        </View>
      </>,
    );
  }

  const valid = validateMongolianPhone(phone);
  return body(
    <>
      {header}
      <TextField
        label={t('profile.phone')}
        value={phone}
        onChangeText={(v) => {
          setPhone(v.replace(/\D/g, '').slice(0, 8));
          setError(null);
        }}
        placeholder={t('auth.phonePlaceholder')}
        helper={t('customer.signin.phoneHint')}
        error={error}
        icon="phone"
        inputMode="numeric"
        keyboardType="number-pad"
      />
    </>,
    <>
      <Button label={t('auth.continue')} fullWidth disabled={!valid} loading={busy} onPress={() => void start(phone)} />
      <View style={s.note}>
        <Icon name="shield-check" size={16} color={colors.iconSecondary} />
        <Text style={s.noteText}>{t('customer.signin.fee')}</Text>
      </View>
    </>,
  );
}

// ---- C4: the sheet any "needs an account" action opens, and resumes after VERIFIED ----

export type AuthReason = 'message' | 'book' | 'search' | 'become' | 'report';
type Require = (reason: AuthReason, resume: () => void) => void;
const AuthCtx = createContext<Require>(() => undefined);
export const useRequireAuth = (): Require => useContext(AuthCtx);

const REASON_KEY: Record<AuthReason, string> = {
  message: 'customer.signin.sheetMessage',
  book: 'customer.signin.sheetBook',
  search: 'customer.signin.sheetSearch',
  become: 'customer.signin.sheetTitle',
  report: 'auth.loginRequired',
};

export function AuthSheetProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<{ reason: AuthReason; resume: () => void } | null>(null);
  const [visible, setVisible] = useState(false);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const require = useCallback<Require>((reason, resume) => {
    if (getToken()) {
      resume();
      return;
    }
    setPending({ reason, resume });
    setVisible(true);
  }, []);

  const done = useCallback(() => {
    setVisible(false);
    const p = pendingRef.current;
    setPending(null);
    // Resume after the sheet's close animation, on the same screen.
    if (p) setTimeout(p.resume, 250);
  }, []);

  const value = useMemo(() => require, [require]);
  return (
    <AuthCtx.Provider value={value}>
      {children}
      <BottomSheet visible={visible} onClose={() => setVisible(false)} title={t('customer.signin.sheetTitle')}>
        <SheetBody reason={pending?.reason ?? 'message'} onDone={done} />
      </BottomSheet>
    </AuthCtx.Provider>
  );
}

function SheetBody({ reason, onDone }: { reason: AuthReason; onDone: () => void }) {
  const { t } = useTranslation();
  const { colors, type } = useAppTheme();
  return (
    <View style={{ gap: 12 }}>
      <Text style={[type.body, { color: colors.textSecondary }]}>{t(REASON_KEY[reason])}</Text>
      <SignInFlow onDone={onDone} />
      <Text style={[type.small, { color: colors.textSecondary }]}>{t('customer.signin.sheetNote')}</Text>
    </View>
  );
}
