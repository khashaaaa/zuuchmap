import { create } from 'zustand';
import type { AuthUser } from '@zuuchmap/core';

const AUTH_KEY = 'zm_auth';
const DEVICE_KEY = 'zm_device';

interface Stored { token: string; user: AuthUser }

function readAuth(): Stored | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

/** A random id generated once and kept; it identifies this browser for trusted-device sign-in and view counting. */
function readDevice(): string {
  try {
    const have = localStorage.getItem(DEVICE_KEY);
    if (have) return have;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return 'session-' + Math.random().toString(36).slice(2);
  }
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  deviceId: string;
  signIn: (a: Stored) => void;
  /** Updates the stored account in place (the first listing makes a customer a provider). */
  patchUser: (u: Partial<AuthUser>) => void;
  clear: () => void;
}

const initial = readAuth();

export const useAuthStore = create<AuthState>((set) => ({
  token: initial?.token ?? null,
  user: initial?.user ?? null,
  deviceId: readDevice(),
  signIn: (a) => {
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(a));
    } catch {
      /* storage unavailable */
    }
    set({ token: a.token, user: a.user });
  },
  patchUser: (u) => {
    const cur = useAuthStore.getState();
    if (!cur.token || !cur.user) return;
    const user = { ...cur.user, ...u };
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify({ token: cur.token, user }));
    } catch {
      /* storage unavailable */
    }
    set({ user });
  },
  clear: () => {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      /* storage unavailable */
    }
    set({ token: null, user: null });
  },
}));

export type SignInReason = 'message' | 'book' | 'search' | 'generic';

interface SheetState {
  open: boolean;
  reason: SignInReason;
  resume: (() => void) | null;
  show: (reason: SignInReason, resume?: () => void) => void;
  hide: () => void;
}

export const useSignInSheet = create<SheetState>((set) => ({
  open: false,
  reason: 'generic',
  resume: null,
  show: (reason, resume) => set({ open: true, reason, resume: resume ?? null }),
  hide: () => set({ open: false, resume: null }),
}));

/** Runs `action` now when signed in; otherwise opens the C4 sheet and runs it after sign-in on the same screen. */
export function requireAuth(reason: SignInReason, action: () => void): void {
  if (useAuthStore.getState().token) action();
  else useSignInSheet.getState().show(reason, action);
}
