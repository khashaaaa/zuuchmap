import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  options: readonly SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({ label, options, value, onChange, placeholder, disabled, className }: SelectProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-o${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);

  const openList = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (o: SelectOption) => {
    onChange(o.value);
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openList(); else setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault();
      const o = options[active];
      if (o) pick(o);
    }
  };

  return (
    <div
      ref={root}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      className={cn('relative flex flex-col gap-1.5', className)}
    >
      <span id={`${id}-l`} className={cn('text-label', disabled ? 'text-text-disabled' : 'text-text-primary')}>{label}</span>
      <button
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-l`}
        aria-activedescendant={open ? `${id}-o${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
        className={cn(
          'flex h-12 items-center gap-2.5 rounded-input border border-border-default px-4 text-left text-body transition-colors duration-(--duration-fast)',
          'focus-visible:outline-none focus-visible:border-border-focus focus-visible:shadow-[inset_0_0_0_1px_var(--color-border-focus)]',
          disabled ? 'cursor-not-allowed bg-bg-surface-sunken text-text-disabled' : 'bg-bg-surface',
          !disabled && (selected ? 'text-text-primary' : 'text-text-tertiary'),
        )}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
        <Icon name="chevron-down" size={20} className={cn(disabled ? 'text-text-disabled' : 'text-icon-secondary', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-labelledby={`${id}-l`}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-input border border-border-elevation bg-bg-surface-raised p-1 shadow-lg ring-1 ring-border-subtle"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={o.value === value}
              onPointerDown={(e) => e.preventDefault()}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(o)}
              className={cn(
                'flex min-h-12 cursor-pointer items-center justify-between rounded-md px-3 text-body text-text-primary',
                i === active && 'bg-bg-surface-sunken',
              )}
            >
              {o.label}
              {o.value === value && <Icon name="check" size={18} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
