import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
  /** Dismissed, playing its exit. */
  closing?: boolean;
}

const TOAST_MS = 4000;
/** An actionable toast stays long enough to be read and tapped. */
const TOAST_ACTION_MS = 8000;

interface ToastState {
  toasts: ToastItem[];
  show: (t: Omit<ToastItem, 'id' | 'closing'>) => number;
  dismiss: (id: number) => void;
}

/** How long a dismissed toast keeps its node for the exit animation. */
const EXIT_MS = 180;

let next = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (t) => {
    const id = next++;
    set((s) => ({ toasts: [...s.toasts.filter((x) => !x.closing).slice(-2), { ...t, id }] }));
    timers.set(id, setTimeout(() => get().dismiss(id), t.action ? TOAST_ACTION_MS : TOAST_MS));
    return id;
  },
  dismiss: (id) => {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    set((s) => ({ toasts: s.toasts.map((x) => (x.id === id ? { ...x, closing: true } : x)) }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), EXIT_MS);
  },
}));

const api = {
  show: (t: Omit<ToastItem, 'id'>) => useToastStore.getState().show(t),
  success: (message: string, action?: ToastAction) => useToastStore.getState().show({ tone: 'success', message, action }),
  error: (message: string, action?: ToastAction) => useToastStore.getState().show({ tone: 'error', message, action }),
  info: (message: string, action?: ToastAction) => useToastStore.getState().show({ tone: 'info', message, action }),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};

/** Imperative toast API; the `<Toaster/>` host renders what is queued. */
export const useToast = () => api;
