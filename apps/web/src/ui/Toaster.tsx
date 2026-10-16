import { useToastStore } from '@/lib/toast';
import { Toast } from './Toast';

/** Mount once. Bottom of the screen above the tab bar on phones, top-right on desktop. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 md:inset-x-auto md:bottom-auto md:right-6 md:top-6 md:items-end"
    >
      {toasts.map((t) => (
        <div key={t.id} data-closing={t.closing ? '' : undefined} className="zm-pop-in pointer-events-auto w-full max-w-[360px] md:w-[360px]">
          <Toast
            tone={t.tone}
            message={t.message}
            action={t.action && { label: t.action.label, onClick: () => { t.action?.onClick(); dismiss(t.id); } }}
          />
        </div>
      ))}
    </div>
  );
}
