import { useId, type ReactNode } from 'react';
import { aiQuotaVars, type AiFeature } from '../shared/ai';
import { apiError } from '../shared/errors';
import type { Hostel } from '../shared/schema';
import { LangFlag, type Lang } from './LangFlag';
import { mayLeave } from './leaveGuard';

/* The pieces of a focus page's form (the editor, the AI page): the way back at its top, its sections, its labelled
   controls. */

/** A focus page's one way back (they have no top bar). A plain link, so it opens in a new tab too; a plain click asks first
    when there is unsaved work (route.ts would too, but not in a browser without the Navigation API). */
export function BackToLibrary({ className }: { className?: string }) {
  return (
    <a
      className={className}
      href="#/"
      onClick={(e) => {
        const plain = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
        if (plain && !mayLeave()) e.preventDefault();
      }}
    >
      <span aria-hidden="true">←</span> Library
    </a>
  );
}

/** A section that opens and closes by its header (the editor's; sectionFolds.ts says which are open). */
export interface Fold {
  open: boolean;
  onToggle: () => void;
}

/** A section of the form. Given a `fold`, its header is a button that opens and closes it (the owner's "pill
    dropdown section", 2026-10-07); without one it is always open, as on the AI page. */
export function Section({ title, hint, fold, children }: { title: string; hint?: string; fold?: Fold; children: ReactNode }) {
  const body = useId();
  if (!fold)
    return (
      <section className="section">
        <h2>{title}</h2>
        {hint && <p className="hint">{hint}</p>}
        {children}
      </section>
    );
  return (
    <section className={`section section-fold${fold.open ? ' section-open' : ''}`}>
      <h2>
        <button type="button" className="section-head" aria-expanded={fold.open} aria-controls={body} onClick={fold.onToggle}>
          <span className="section-title">{title}</span>
          <svg className="section-chev" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </button>
      </h2>
      {/* Closed, its content is hidden and stays mounted: the rows' list of saved flyers is asked for once, the
          photo's file input is still there for a photo that is chosen, and nothing typed is lost. */}
      <div id={body} className="section-body" hidden={!fold.open}>
        {hint && <p className="hint">{hint}</p>}
        {children}
      </div>
    </section>
  );
}

/** A labelled control. `lang` flags the language the copy is written in (LangFlag). */
export function Field({ label, help, optional, lang, children }: { label: string; help?: string; optional?: boolean; lang?: Lang; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">
        {lang && <LangFlag lang={lang} />}
        {label}
        {optional && <em> optional</em>}
      </span>
      {children}
      {help && <span className="help">{help}</span>}
    </label>
  );
}

/** Under a button that would start a generation, once the day has none left of its feature: the server's own sentence
    for a refused one, so the staff member reads what ran out and when it comes back without having to press anything. */
export function AiUsedUp({ feature, limit, left }: { feature: AiFeature; limit: number; left: number }) {
  if (left > 0) return null;
  return (
    <p className="help ai-used-up" role="status">
      {apiError('ai_quota', aiQuotaVars(feature, limit)).message}
    </p>
  );
}

/** The hostels as a select lists them: grouped by island, in the library's order. */
export function HostelOptions({ hostels }: { hostels: Hostel[] }) {
  return (
    <>
      {[...new Set(hostels.map((h) => h.island))].map((island) => (
        <optgroup key={island} label={island}>
          {hostels
            .filter((h) => h.island === island)
            .map((h) => (
              <option key={h.slug} value={h.slug}>
                {h.name}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}
