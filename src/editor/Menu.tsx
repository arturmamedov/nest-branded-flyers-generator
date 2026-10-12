import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

/* A button that opens a short list of actions: the toolbar's "Download ▾" (the editor's UX round, Part 3; the owner's
   "create a dropdown from Download PNG, JPG", 2026-10-07). The editor's own, with what a menu owes the keyboard and
   the pointer, and no dependency. Like a section's header (panel.tsx), the button says with `aria-expanded` whether
   its list is open, and the list is hidden, never unmounted. */

export interface MenuEntry {
  id: string;
  label: string;
  /** A few words after the name, in a lighter ink: what tells this entry from its neighbour. */
  hint?: string;
  onPick: () => void;
}

export function Menu({ label, entries, disabled = false, className }: { label: string; entries: MenuEntry[]; disabled?: boolean; className: string }) {
  const [open, setOpen] = useState(false);
  // Which entry takes the focus once the list is on screen: the first, or the last when it was opened upwards.
  const [land, setLand] = useState<'first' | 'last' | null>(null);
  const [buttonId, listId] = [useId(), useId()];
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Greyed, it is closed. The page takes one action at a time, and one can start with the list open (a photo dropped
  // on the preview is no click outside it): an entry must not start a second. Worked out while rendering, so the
  // open list is never on screen under a greyed button.
  if (disabled && open) setOpen(false);

  const items = () => [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];

  useEffect(() => {
    if (!open || !land) return;
    items().at(land === 'first' ? 0 : -1)?.focus();
    setLand(null);
  }, [open, land]);

  // A press anywhere else closes it. On the press, not the click: it is closed before that click does its own work.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const show = (at: 'first' | 'last') => {
    setOpen(true);
    setLand(at);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const go = (to: number) => {
      e.preventDefault();
      all[(to + all.length) % all.length]?.focus();
    };
    if (!open) {
      // Enter and Space are the button's own click.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        show(e.key === 'ArrowDown' ? 'first' : 'last');
      }
      return;
    }
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at < 0 ? -1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    }
    // Tab moves on as it always does, from the entry it is on, and the list closes behind it.
    else if (e.key === 'Tab') setOpen(false);
  };

  // The focus goes back to the button before the entry does its work: the action then starts from the button, which
  // is what gets the focus back when the action is done (Editor.tsx, run()). The entry acts on the click itself, so
  // what it starts is still inside the tap (a clipboard write, a share sheet).
  const pick = (entry: MenuEntry) => {
    button.current?.focus();
    setOpen(false);
    entry.onPick();
  };

  return (
    <div ref={root} className="menu" onKeyDown={onKeyDown}>
      <button
        ref={button}
        id={buttonId}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show('first'))}
      >
        {label}
        <svg className="menu-chev" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      <div ref={list} id={listId} className="menu-list" role="menu" aria-labelledby={buttonId} hidden={!open}>
        {entries.map((entry) => (
          <button key={entry.id} type="button" className="menu-entry" role="menuitem" tabIndex={-1} onClick={() => pick(entry)}>
            {entry.label}
            {entry.hint && <span className="menu-hint"> · {entry.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
