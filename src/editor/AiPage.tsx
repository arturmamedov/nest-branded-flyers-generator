import { useEffect, useMemo, useState } from 'react';
import { AI_INPUT_MAX, type AiOn } from '../shared/ai';
import { flyerFromBrief } from '../shared/brief';
import { lintFlyer } from '../shared/copyRules';
import { DEFAULT_CANVAS } from '../shared/layout';
import type { AiAssumption, Brief, Hostel } from '../shared/schema';
import { api, ApiError } from './api';
import { offerDraft } from './handoff';
import { useLeaveGuard } from './leaveGuard';
import { briefFieldLabel, FIELD } from './fields';
import { AiUsedUp, BackToLibrary, Field, HostelOptions, Section } from './panel';
import { CutOffNote, Preview, useFitReports } from './Preview';
import { go } from './route';
import { ShareCopy } from './share';

/* "Create with AI" (#/ai, docs/prompts/ai-assistant.md): a staff member's idea in, a flyer out, ending at "Open in
   editor". A focus page like the editor, which stays the place where a flyer is adjusted and saved. The flyer is
   built from the brief with flyerFromBrief() and shown by the same <Preview> and <Flyer> as everywhere: never a second
   renderer. Everything the model wrote is marked as the AI's. */

/** What an idea looks like: two plain sentences, the owner's words (2026-10-05). The first one was a real staff
    post, an emoji and a line per fact, and staff read it as a form to fill in. Free text has no lines to copy. */
const PLACEHOLDER = 'Tomorrow at 19:00 we have a sunset stretching class by the pool. Bring water and a towel.';

interface Result {
  brief: Brief;
  assumptions: AiAssumption[];
  /** The idea this flyer came from, as it was sent: the box may have changed since. */
  idea: string;
}

export function AiPage({ hostels, ai, onRemaining }: { hostels: Hostel[]; ai: AiOn; onRemaining: (remaining: number) => void }) {
  const [idea, setIdea] = useState('');
  const [hostel, setHostel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [opening, setOpening] = useState(false);
  const { onFit, cutOff } = useFitReports();

  // A flyer made and not yet opened is unsaved work, and a generation spent: leaving asks, as the editor does.
  useLeaveGuard(result !== null && !opening);
  // "Open in editor" moves once the guard has let go (its layout effect runs first), so the move asks nothing.
  useEffect(() => {
    if (opening) go('#/new');
  }, [opening]);

  const nameOf = (slug: string | null) => hostels.find((h) => h.slug === slug)?.name ?? null;
  const flyer = useMemo(() => (result ? flyerFromBrief(result.brief, nameOf(result.brief.hostel)) : null), [result]); // eslint-disable-line react-hooks/exhaustive-deps
  const lints = useMemo(() => (flyer ? lintFlyer(flyer.data) : []), [flyer]);
  const left = ai.remaining;

  async function generate() {
    setBusy(true);
    setError(null);
    const sent = idea;
    try {
      const r = await api.aiFlyer(hostel ? { text: sent, hostel } : { text: sent });
      setResult({ brief: r.brief, assumptions: r.assumptions, idea: sent });
      onRemaining(r.remaining);
    } catch (e) {
      // The cap was reached elsewhere (another tab, another staff member): say so in the count too.
      if (e instanceof ApiError && e.status === 429) onRemaining(0);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function open() {
    if (!result || !flyer) return;
    offerDraft({ title: result.brief.title?.trim() ?? '', hostel: flyer.hostel, data: flyer.data }, result.idea);
    setOpening(true);
  }

  return (
    // Idle (no flyer, nothing on its way, nothing to say): on a phone the form then has the screen (editor.css).
    <div className={'editor ai-page' + (!flyer && !busy && !error ? ' ai-page-idle' : '')}>
      <aside className="panel">
        <div className="panel-head">
          <BackToLibrary className="btn btn-quiet" />
        </div>
        <Section title="✨ Create with AI" hint="Paste the event as you would post it in the group: a few lines, in Spanish or English. The AI writes the flyer; you check it in the editor.">
          <Field label="Your idea">
            <textarea rows={10} value={idea} maxLength={AI_INPUT_MAX} placeholder={PLACEHOLDER} onChange={(e) => setIdea(e.target.value)} />
          </Field>
          <Field label={FIELD.hostel} help="Pick one, or let the AI read it from your text">
            <select aria-label={FIELD.hostel} value={hostel} onChange={(e) => setHostel(e.target.value)}>
              <option value="">Let the AI decide</option>
              <HostelOptions hostels={hostels} />
            </select>
          </Field>
          <button type="button" className="btn btn-accent" disabled={busy || !idea.trim() || left === 0} onClick={generate}>
            {busy ? 'Writing…' : '✨ Generate'} <span className="ai-left">({left} left today)</span>
          </button>
          <AiUsedUp limit={ai.limit} left={left} />
        </Section>

        {result && result.assumptions.length > 0 && (
          <Section title="The AI assumed…" hint="Your text didn't say these, so the AI picked them. Check each one in the editor.">
            <ul className="ai-assumptions">
              {result.assumptions.map((a, i) => (
                <li key={i}>
                  <b>{briefFieldLabel(a.field)}:</b> {a.note}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {flyer && (
          <Section title={FIELD.share} hint="Written by the AI: the caption to paste when you post. You can change it in the editor.">
            <Field label="The AI’s share text">
              <textarea rows={8} value={flyer.data.share} readOnly />
            </Field>
            <ShareCopy text={flyer.data.share} />
          </Section>
        )}
      </aside>

      <main className="workspace">
        {/* The flyer's actions, once there is a flyer: before it, an empty bar would only push the stage down. */}
        {flyer && (
          <div className="toolbar">
            <span className="status">✨ The AI’s draft · not saved yet</span>
            <span className="spacer" />
            <button type="button" className="btn btn-dark" disabled={busy || left === 0} onClick={generate}>
              Try again (uses {left === 1 ? 'the last one' : `one of ${left} left`})
            </button>
            <button type="button" className="btn btn-accent" disabled={busy} onClick={open}>
              Open in editor
            </button>
          </div>
        )}

        {(error || (flyer && !busy && (cutOff.length > 0 || lints.length > 0))) && (
          <div className="notes">
            {error && <div className="note note-error">{error}</div>}
            {flyer && !busy && cutOff.length > 0 && <CutOffNote canvases={cutOff} />}
            {flyer &&
              !busy &&
              lints.map((l, i) => (
                <div key={i} className="note note-warn">
                  {l.message}
                </div>
              ))}
          </div>
        )}

        {busy ? (
          <div className="stage">
            <p className="ai-waiting" role="status">
              ✨ The AI is writing your flyer… it can take half a minute.
            </p>
          </div>
        ) : flyer ? (
          <Preview
            data={flyer.data}
            canvas={DEFAULT_CANVAS}
            hostel={hostels.find((h) => h.slug === flyer.hostel) ?? null}
            photo={null}
            showSafeZones={false}
            actualSize={false}
            onFit={onFit}
            onCrop={() => {}}
            onDropFile={() => setError('Open the flyer in the editor to add its photo.')}
          />
        ) : (
          <div className="stage">
            <p className="ai-empty">Your flyer appears here.</p>
          </div>
        )}
      </main>
    </div>
  );
}
