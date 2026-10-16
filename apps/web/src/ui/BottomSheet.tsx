import { createContext, useContext, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDialog } from '@/lib/useDialog';
import { usePresence } from '@/lib/usePresence';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { SheetGrabber } from './SheetGrabber';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Header text action, e.g. "Цэвэрлэх". */
  secondary?: { label: string; onClick: () => void };
  /** The sheet's one primary action; sticky at the foot. */
  primary?: { label: string; onClick: () => void; disabled?: boolean };
  children: ReactNode;
}

/** True while a SheetPresence is playing its sheet's exit. */
const Exiting = createContext(false);

/**
 * For a sheet whose body mounts only while open (`open ? <Body/> : null` resets its state per opening):
 * keeps the body mounted long enough for the exit, telling its BottomSheet it is closing.
 */
export function SheetPresence({ open, children }: { open: boolean; children: ReactNode }) {
  const { mounted, closing } = usePresence(open, 240);
  return mounted ? <Exiting.Provider value={closing}>{children}</Exiting.Provider> : null;
}

/**
 * Phones: slides from the bottom, covers the tab bar (z above it), reaches the screen
 * bottom with the home-indicator inset in its padding. md and up: a centred dialog.
 */
export function BottomSheet({ open: requested, onClose, title, secondary, primary, children }: BottomSheetProps) {
  const { t } = useTranslation();
  const exiting = useContext(Exiting);
  const open = requested && !exiting;
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(open, onClose, panel, 'panel');
  const { mounted, closing } = usePresence(open, 240);
  if (!mounted) return null;
  return createPortal(
    <div data-closing={closing ? '' : undefined} className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div aria-hidden="true" onClick={onClose} className="zm-fade-in absolute inset-0 bg-bg-scrim" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="zm-sheet-in relative flex max-h-[90dvh] w-full flex-col rounded-t-modal bg-bg-surface-raised shadow-lg focus-visible:outline-none md:max-h-[85dvh] md:w-[480px] md:rounded-modal"
      >
        <div className="flex justify-center pb-1.5 pt-2.5 md:hidden">
          <SheetGrabber />
        </div>
        <div className="flex items-center gap-2 px-5 pb-3 pt-1 md:pt-4">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-h3 text-text-primary">{title}</h2>
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="inline-flex h-12 items-center rounded-lg px-2 text-label-strong text-text-link focus-visible:outline-none focus-visible:shadow-focus"
            >
              {secondary.label}
            </button>
          )}
          <IconButton icon="x" label={t('common.close')} variant="ghost" size="medium" onClick={onClose} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4 pt-2">{children}</div>
        {primary && (
          <div className="border-t border-border-subtle bg-bg-surface-raised px-5 pb-[max(28px,calc(12px+env(safe-area-inset-bottom)))] pt-3 md:rounded-b-modal md:pb-5">
            <Button onClick={primary.onClick} disabled={primary.disabled} className="w-full">{primary.label}</Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
