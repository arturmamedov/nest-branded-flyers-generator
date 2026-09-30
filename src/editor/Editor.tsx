import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FitReport } from '../flyer/fit';
import { deriveChip, splitBigSub } from '../shared/chips';
import { ACCEPTED_PHOTO_TYPES } from '../shared/limits';
import { lintFlyer } from '../shared/copyRules';
import { DEFAULT_PHOTO_MODE, followHostel, marksFor, newFlyerData, switchTemplate, weekTitle } from '../shared/defaults';
import { CANVASES, CANVAS_IDS, bodyOf, isCanvasId, photoFrame, type CanvasId, type PhotoMode } from '../shared/layout';
import { DEFAULT_CROP, ZOOM_MAX, ZOOM_MIN, clampCrop, wholePhotoZoom, zoomCrop } from '../shared/photo';
import type { Chip, ChipKey, Crop, FlyerData, FlyerInput, FlyerListItem, FlyerText, Hostel, PhotoInfo, Template, WeekRow } from '../shared/schema';
import { TITLE_MAX, libraryName } from '../shared/names';
import { WEEK_ROWS_MAX, WEEK_ROW_LIMITS, isPrintable, rowFromActivity } from '../shared/week';
import { api, ApiError } from './api';
import type { FlyerExporter } from './export';
import { LangFlag, type Lang } from './LangFlag';
import { mayLeave, useLeaveGuard } from './leaveGuard';
import { PHOTO_MODE_LABEL } from './photoModes';
import { preparePhoto, type PhotoLimits } from './photoPrep';
import { replaceHash } from './route';
import { localStorageGet, localStorageSet } from './prefs';
import { Preview } from './Preview';
import { TEMPLATE_LABEL } from './templates';

interface Draft {
  title: string;
  hostel: string | null;
  data: FlyerData;
  photo: PhotoInfo | null;
}

const blankDraft = (): Draft => ({ title: '', hostel: null, data: newFlyerData('activity'), photo: null });

/** The name a save writes: the one typed in the field, else the flyer's own (names.ts), dated today. Only an untitled
    week flyer's name reads the day, and such a draft already differs from the blank one it started as, so the
    unsaved-changes check never turns on the clock. The hostels come in whole: the draft names a hostel by slug. */
const autoTitle = (d: Draft, hostels: Hostel[], now = new Date()) =>
  d.title.trim() || libraryName(d.data, hostels.find((h) => h.slug === d.hostel)?.name ?? null, now);

const toInput = (d: Draft, hostels: Hostel[]): FlyerInput => ({
  title: autoTitle(d, hostels),
  hostel: d.hostel,
  template: d.data.template,
  data: d.data,
  photoId: d.photo?.id ?? null,
});

const EMPTY_ROW: WeekRow = { day: '', name: '', time: '', cost: '' };

/** Why a row taken from a saved flyer can't join this draft now, or null when it can. Asked when it is picked, and
    again when it arrives, since the rows and the template can change while it is on its way. */
function takeRefusal(d: FlyerData): string | null {
  if (d.template !== 'week') return `this is an ${TEMPLATE_LABEL.activity} flyer now. Switch back to ${TEMPLATE_LABEL.week}, then add it again.`;
  if (d.week.length >= WEEK_ROWS_MAX) return `a week holds ${WEEK_ROWS_MAX} rows. Remove one, then add it again.`;
  return null;
}

/** A row with its short name set, or without the key at all when cleared: an empty one would
    print nothing different but make a saved flyer read as changed. */
function withShortName(row: WeekRow, shortName: string): WeekRow {
  const { shortName: _, ...rest } = row;
  return shortName ? { ...rest, shortName } : rest;
}

/** The canvas on screen is how this viewer likes to work, never flyer data. */
const CANVAS_PREF = 'editor.canvas';
const savedCanvas = (): CanvasId => {
  const v = localStorageGet(CANVAS_PREF);
  return isCanvasId(v) ? v : 'story';
};

const CHIP_HELP: Record<ChipKey, { placeholder: string; help: string }> = {
  when: { placeholder: 'Saturday 19/9 · 15:00', help: 'Day on the yellow stroke · the hour next to the clock' },
  where: { placeholder: 'The terrace', help: 'The hostel prints big; type the spot. Add · for a second line' },
  cost: { placeholder: 'Free · food & drinks', help: 'Price big · what it includes small' },
};

export function Editor({ id, hostels, exporter, limits }: { id: number | null; hostels: Hostel[]; exporter: FlyerExporter; limits: PhotoLimits }) {
  const [draft, setDraft] = useState<Draft | null>(id == null ? blankDraft() : null);
  const [savedJson, setSavedJson] = useState<string>(() => (id == null ? JSON.stringify(toInput(blankDraft(), hostels)) : 'loading'));
  const [flyerId, setFlyerId] = useState<number | null>(id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fits, setFits] = useState<Partial<Record<CanvasId, FitReport>>>({});
  const [canvas, setCanvas] = useState<CanvasId>(savedCanvas);
  const [safe, setSafe] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'png' | 'jpg' | 'upload' | 'row'>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id == null) return;
    api.flyer(id).then(
      (p) => {
        // The record's template wins over data.template, as it does on every write (normalize.ts).
        const d: Draft = { title: p.flyer.title, hostel: p.flyer.hostel, data: { ...p.flyer.data, template: p.flyer.template }, photo: p.photo };
        setDraft(d);
        setSavedJson(JSON.stringify(toInput(d, hostels)));
      },
      (e) => setLoadError(e instanceof ApiError && e.status === 404 ? 'This flyer does not exist or was archived.' : String(e.message)),
    );
  }, [id]);

  const dirty = draft ? JSON.stringify(toInput(draft, hostels)) !== savedJson : false;
  // A photo still uploading is unsaved work too.
  useLeaveGuard(dirty || busy === 'upload');

  // The draft as last rendered, for an answer that lands after the render its action started from (takeRow). Set in
  // a layout effect, never during render: a render React throws away must not leave its draft here.
  const latestDraft = useRef(draft);
  useLayoutEffect(() => {
    latestDraft.current = draft;
  });

  const hostel = useMemo(() => hostels.find((h) => h.slug === draft?.hostel) ?? null, [hostels, draft?.hostel]);
  const lints = useMemo(() => (draft ? lintFlyer(draft.data) : []), [draft]);
  // An identical report (a photo drag refits the canvas on screen) keeps the state, so nothing re-renders.
  const onFit = useCallback(
    (c: CanvasId, r: FitReport) => setFits((f) => (JSON.stringify(f[c]) === JSON.stringify(r) ? f : { ...f, [c]: r })),
    [],
  );
  const chooseCanvas = (c: CanvasId) => {
    setCanvas(c);
    localStorageSet(CANVAS_PREF, c);
  };

  if (loadError)
    return (
      <div className="banner banner-error">
        {loadError} <BackToLibrary />
      </div>
    );
  if (!draft) return <div className="loading">Loading flyer…</div>;

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setData = (patch: Partial<FlyerData>) => setDraft((d) => (d ? { ...d, data: { ...d.data, ...patch } } : d));
  const setText = (key: keyof FlyerText, value: string) =>
    setDraft((d) => (d ? { ...d, data: { ...d.data, text: { ...d.data.text, [key]: value } } } : d));
  const setChip = (key: ChipKey, value: string) =>
    setDraft((d) => (d ? { ...d, data: { ...d.data, chips: d.data.chips.map((c) => (c.key === key ? { ...c, value } : c)) } } : d));
  const setCrop = (photoCrop: Crop) => setData({ photoCrop });
  // Functional, so back-to-back slider and drag updates never read a stale crop.
  const updateCrop = (fn: (c: Crop) => Crop) =>
    setDraft((d) => (d ? { ...d, data: { ...d.data, photoCrop: fn(d.data.photoCrop) } } : d));
  const nameOf = (slug: string | null) => hostels.find((h) => h.slug === slug)?.name ?? null;
  // Both read the draft they change: the defaults that follow a template or a hostel are worked out from it.
  const chooseTemplate = (to: Template) => setDraft((d) => (d ? { ...d, data: switchTemplate(d.data, to, nameOf(d.hostel)) } : d));
  const chooseHostel = (slug: string | null) =>
    setDraft((d) => (d ? { ...d, hostel: slug, data: followHostel(d.data, nameOf(d.hostel), nameOf(slug)) } : d));
  const updateWeek = (fn: (rows: WeekRow[]) => WeekRow[]) => setDraft((d) => (d ? { ...d, data: { ...d.data, week: fn(d.data.week) } } : d));

  const week = draft.data.template === 'week';
  // The week title's defaults, as a new week flyer gets them for this hostel: the placeholders once cleared.
  const weekDefaults = weekTitle(hostel?.name ?? null);
  // A frame with no photo in it would print as a blank strip; a week flyer has no frame at all.
  const needsPhoto = photoFrame(canvas, bodyOf(draft.data)) !== null && !draft.photo;
  // Every canvas is fitted, the one on screen and the others offscreen: copy is one, so is the warning.
  const cutOff = CANVAS_IDS.filter((c) => {
    const r = fits[c];
    return r && r.clippedBoxes + r.entries.filter((e) => e.overflowX).length > 0;
  });

  async function save(): Promise<number> {
    const input = toInput(draft!, hostels);
    const res = flyerId == null ? await api.create(input) : await api.update(flyerId, input);
    setSavedJson(JSON.stringify(input));
    if (draft!.title.trim() === '') set({ title: input.title });
    if (flyerId == null) {
      setFlyerId(res.id);
      // Keep this editor mounted; just make the URL reopenable. Only while the new flyer is still the page
      // on screen: a save that answers after the user has moved on leaves their URL alone.
      replaceHash('#/new', `#/flyers/${res.id}`);
    }
    return res.id;
  }

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<string | void>) {
    setBusy(kind);
    setMessage(null);
    try {
      const ok = await fn();
      if (ok) setMessage({ kind: 'ok', text: ok });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const onSave = () => run('save', async () => (await save(), 'Saved to the library.'));

  const onDownload = (format: 'png' | 'jpg') =>
    run(format, async () => {
      const savedId = await save();
      // The canvas on screen when the button was pressed: what you see is what you download.
      const { blob, filename } = await exporter.export({ id: savedId, format, canvas });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return `Downloaded ${filename} (${CANVASES[canvas].width} × ${CANVASES[canvas].height}).`;
    });

  const onFile = (file: File) =>
    run('upload', async () => {
      const { blob, name } = await preparePhoto(file, limits);
      const photo = await api.uploadPhoto(blob, name);
      setDraft((d) =>
        d ? { ...d, photo, data: { ...d.data, photoCrop: DEFAULT_CROP, photoMode: d.data.photoMode === 'none' ? DEFAULT_PHOTO_MODE : d.data.photoMode } } : d,
      );
    });

  // A week flyer has no photo: a drop gets a reason, never an upload. Nor does a drop while another action is out:
  // one action at a time, since each one's end empties `busy`, and with it the upload's state and the leave guard.
  const onDrop = (file: File) => {
    if (week) setMessage({ kind: 'error', text: `A ${TEMPLATE_LABEL.week} flyer has no photo — switch to ${TEMPLATE_LABEL.activity} to use one.` });
    else if (busy) setMessage({ kind: 'error', text: 'Still working on the last action — drop the photo again in a moment.' });
    else onFile(file);
  };

  // A row from a saved Activity flyer: a copy, never a link. It joins the rows as they are when it
  // arrives (they may have changed while it was on its way), and only while there is room. The picker
  // empties itself once a flyer is picked, so a row that can't join says so, by name.
  const takeRow = (id: number) =>
    run('row', async () => {
      const now = takeRefusal(draft.data);
      if (now) throw new Error(now[0].toUpperCase() + now.slice(1));
      const p = await api.flyer(id);
      const row = rowFromActivity(p.flyer.data, p.flyer.title);
      const late = takeRefusal(latestDraft.current!.data);
      if (late) throw new Error(`“${row.name}” was not added: ${late}`);
      setDraft((d) => (d && !takeRefusal(d.data) ? { ...d, data: { ...d.data, week: [...d.data.week, row] } } : d));
      return `Added “${row.name}” from ${p.flyer.title}.`;
    });

  const t = draft.data.text;
  const chip = (key: ChipKey) => draft.data.chips.find((c) => c.key === key) as Chip;

  return (
    <div className="editor">
      <aside className="panel">
        {/* The editor has no shared bar (App.tsx): the way back stays at the top of the form. */}
        <div className="panel-head">
          <BackToLibrary className="btn btn-quiet" />
        </div>
        <Section title="Flyer">
          <div className="field">
            <span className="label">Template</span>
            <div className="seg" role="group" aria-label="Template">
              {(Object.entries(TEMPLATE_LABEL) as [Template, string][]).map(([key, label]) => (
                <button key={key} type="button" className={draft.data.template === key ? 'on' : ''} aria-pressed={draft.data.template === key} onClick={() => chooseTemplate(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Field
            label="Hostel"
            help={`${hostel?.logoPath && marksFor(true).includes('badge') ? 'Its badge prints at the top. ' : ''}${week ? 'Named in the Spanish title line, and tags the flyer in the library' : 'Prints in the WHERE block and tags the flyer in the library'}`}
          >
            <select aria-label="Hostel" value={draft.hostel ?? ''} onChange={(e) => chooseHostel(e.target.value || null)}>
              <option value="">All hostels (chain-wide)</option>
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
            </select>
          </Field>
          <Field label="Library name" help="Only for finding it again — not printed">
            <input value={draft.title} placeholder={autoTitle({ ...draft, title: '' }, hostels)} maxLength={TITLE_MAX} onChange={(e) => set({ title: e.target.value })} />
          </Field>
        </Section>

        {/* A week flyer's title is the headline's lines: one set, kept across a switch (the owner's call, 2026-09-29). */}
        <Section title={week ? 'Title' : 'Headline'} hint={week ? `The same lines as the ${TEMPLATE_LABEL.activity} headline: switching template keeps them.` : undefined}>
          <Field label="Line 1" lang="en" help={week ? 'Black' : 'Black. About 18 characters before it starts to shrink'}>
            <input value={t.headline1} maxLength={40} placeholder={week ? weekDefaults.headline1 : 'Saturday is a'} onChange={(e) => setText('headline1', e.target.value)} />
          </Field>
          <Field label="Line 2" lang="en" help={week ? 'Big and teal' : 'Big and teal. About 15 characters'}>
            <input value={t.headline2} maxLength={40} placeholder={week ? weekDefaults.headline2 : 'pool party.'} onChange={(e) => setText('headline2', e.target.value)} />
          </Field>
          <Field
            label="Spanish line"
            lang="es"
            optional
            help={week ? 'Names the place picked above until you change it. Leave empty and it disappears' : 'Leave empty and it disappears'}
          >
            <textarea
              rows={2}
              value={t.headlineEs}
              maxLength={140}
              placeholder={week ? weekDefaults.headlineEs : 'El sábado toca fiesta en la piscina.'}
              onChange={(e) => setText('headlineEs', e.target.value)}
            />
          </Field>
        </Section>

        {week ? (
          <Section title={`${TEMPLATE_LABEL.week}’s rows`} hint={`Up to ${WEEK_ROWS_MAX}. Type them, or take one from a saved ${TEMPLATE_LABEL.activity} flyer and change it.`}>
            <WeekRowsField rows={draft.data.week} onChange={updateWeek} onTake={takeRow} busy={busy !== null} />
          </Section>
        ) : (
          <>
            <Section title="When · Where · Cost" hint="Put a · between the big line and the small line.">
              {(['when', 'where', 'cost'] as const).map((key) => (
                <ChipField key={key} chip={chip(key)} hostelName={hostel?.name ?? null} onChange={(v) => setChip(key, v)} />
              ))}
            </Section>

            <Section title="Nice to know" hint="0–4 short items. The dots are added for you.">
              <ExtrasField extras={draft.data.extras} onChange={(extras) => setData({ extras })} />
            </Section>
          </>
        )}

        <Section title="The ask">
          <Field label="English" lang="en">
            <input value={t.askEn} maxLength={60} onChange={(e) => setText('askEn', e.target.value)} />
          </Field>
          <Field label="Spanish" lang="es" optional>
            <input value={t.askEs} maxLength={70} onChange={(e) => setText('askEs', e.target.value)} />
          </Field>
        </Section>

        {!week && (
          <Section title="Photo">
            <div className="seg">
              {(Object.entries(PHOTO_MODE_LABEL) as [PhotoMode, string][]).map(([mode, label]) => (
                <button key={mode} type="button" className={draft.data.photoMode === mode ? 'on' : ''} onClick={() => setData({ photoMode: mode })}>
                  {label}
                </button>
              ))}
            </div>
            {draft.data.photoMode !== 'none' && (
              <>
                <div className="photo-row">
                  <button type="button" className="btn" disabled={!!busy} onClick={() => fileInput.current?.click()}>
                    {busy === 'upload' ? 'Uploading…' : draft.photo ? 'Replace photo' : 'Choose photo'}
                  </button>
                  {draft.photo && (
                    <button type="button" className="btn btn-quiet" onClick={() => set({ photo: null })}>
                      Remove
                    </button>
                  )}
                  <input
                    ref={fileInput}
                    type="file"
                    accept={ACCEPTED_PHOTO_TYPES.join(',')}
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onFile(f);
                      e.target.value = '';
                    }}
                  />
                </div>
                <p className="help">
                  Or drop a photo on the preview. Drag the photo there to move it in any direction; click it and use the arrow keys to nudge
                  (Shift for bigger steps).
                </p>
                {draft.photo && <PhotoControls photo={draft.photo} data={draft.data} canvas={canvas} onCrop={updateCrop} />}
              </>
            )}
          </Section>
        )}

        <Section title="Top and tag pill">
          <Field label="Eyebrow">
            <input value={t.eyebrow} maxLength={18} onChange={(e) => setText('eyebrow', e.target.value)} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={draft.data.showPill} onChange={(e) => setData({ showPill: e.target.checked })} />
            Show the tag pill
          </label>
          {draft.data.showPill && (
            <div className="two">
              <Field label="Handle">
                <input value={t.handle} maxLength={18} onChange={(e) => setText('handle', e.target.value)} />
              </Field>
              <Field label="Tag">
                <input value={t.tag} maxLength={12} onChange={(e) => setText('tag', e.target.value)} />
              </Field>
            </div>
          )}
        </Section>
      </aside>

      <main className="workspace">
        <div className="toolbar">
          <div className="seg seg-dark" role="group" aria-label="Canvas">
            {CANVAS_IDS.map((c) => (
              <button key={c} type="button" className={canvas === c ? 'on' : ''} aria-pressed={canvas === c} onClick={() => chooseCanvas(c)}>
                {CANVASES[c].label}
              </button>
            ))}
          </div>
          <div className="seg seg-dark">
            <button type="button" className={!safe ? 'on' : ''} onClick={() => setSafe(false)}>
              Clean
            </button>
            <button type="button" className={safe ? 'on' : ''} onClick={() => setSafe(true)}>
              Safe zones
            </button>
          </div>
          <div className="seg seg-dark">
            <button type="button" className={!actualSize ? 'on' : ''} onClick={() => setActualSize(false)}>
              Fit
            </button>
            <button type="button" className={actualSize ? 'on' : ''} onClick={() => setActualSize(true)}>
              1:1
            </button>
          </div>
          <span className="spacer" />
          <span className="status">{dirty ? 'Unsaved changes' : flyerId ? 'Saved' : ''}</span>
          <button type="button" className="btn btn-dark" disabled={!!busy || (!dirty && flyerId != null)} onClick={onSave}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn btn-accent" disabled={!!busy || needsPhoto} onClick={() => onDownload('png')}>
            {busy === 'png' ? 'Rendering…' : 'Download PNG'}
          </button>
          <button type="button" className="btn btn-dark" disabled={!!busy || needsPhoto} onClick={() => onDownload('jpg')} title="Smaller file">
            {busy === 'jpg' ? 'Rendering…' : 'JPG'}
          </button>
        </div>

        {(message || needsPhoto || lints.length > 0 || cutOff.length > 0) && (
          <div className="notes">
            {message && <div className={message.kind === 'ok' ? 'note note-ok' : 'note note-error'}>{message.text}</div>}
            {needsPhoto && (
              <div className="note note-warn">
                Add a photo, or{' '}
                <button type="button" className="linkish" onClick={() => setData({ photoMode: 'none' })}>
                  switch to {PHOTO_MODE_LABEL.none}
                </button>{' '}
                — the empty photo band would print as a blank strip.
              </div>
            )}
            {cutOff.length > 0 && (
              <div className="note note-warn">
                Some text is at its smallest size and is being cut off on {cutOff.map((c) => CANVASES[c].label).join(' and ')} — shorten it.
              </div>
            )}
            {lints.map((l, i) => (
              <div key={i} className="note note-warn">
                {l.message}
              </div>
            ))}
          </div>
        )}

        <Preview
          data={draft.data}
          canvas={canvas}
          hostel={hostel}
          photo={draft.data.photoMode === 'none' ? null : draft.photo}
          showSafeZones={safe}
          actualSize={actualSize}
          onFit={onFit}
          onCrop={setCrop}
          onDropFile={onDrop}
        />
      </main>
    </div>
  );
}

/** The editor's one way back. A plain link, so it opens in a new tab too; a plain click asks first
    when there is unsaved work (route.ts would too, but not in a browser without the Navigation API). */
function BackToLibrary({ className }: { className?: string }) {
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

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  );
}

/** A labelled control. `lang` flags the language the copy is written in (LangFlag). */
function Field({ label, help, optional, lang, children }: { label: string; help?: string; optional?: boolean; lang?: Lang; children: ReactNode }) {
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

/** A text input with a button that puts a · where the caret is: the convention's big line · small line. */
function DotInput({ label, value, maxLength, placeholder, onChange }: { label: string; value: string; maxLength: number; placeholder: string; onChange: (v: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const insertDot = () => {
    const el = input.current!;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start).replace(/\s+$/, '') + ' · ' + el.value.slice(end).replace(/^\s+/, '');
    // maxLength stops typing, not a script: past it, the save would be refused. Counted as maxLength counts.
    if (next.length > maxLength) return el.focus();
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = next.length - el.value.slice(end).replace(/^\s+/, '').length;
      el.setSelectionRange(pos, pos);
    });
  };
  return (
    <div className="with-button">
      <input ref={input} aria-label={label} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="btn btn-quiet dot" title="Insert a · separator" onClick={insertDot}>
        ·
      </button>
    </div>
  );
}

/** The two lines a value prints as, or that it prints nothing. */
function Split({ big, sub, empty }: { big: string; sub: string; empty: string }) {
  return big ? (
    <span className="split">
      <b>{big}</b>
      {sub && <span>{sub}</span>}
    </span>
  ) : (
    <span className="split split-empty">{empty}</span>
  );
}

function ChipField({ chip, hostelName, onChange }: { chip: Chip; hostelName: string | null; onChange: (v: string) => void }) {
  const derived = deriveChip(chip, hostelName);
  const { placeholder, help } = CHIP_HELP[chip.key];
  return (
    <div className="field">
      <span className="label">{chip.label}</span>
      <DotInput label={chip.label} value={chip.value} maxLength={90} placeholder={placeholder} onChange={onChange} />
      <span className="help">{help}</span>
      <Split big={derived.big} sub={derived.sub} empty="Empty — this block is hidden" />
    </div>
  );
}

/** Where focus goes after a row moved or went: the control that follows the row, or its neighbour. */
type RowFocus = { slot: number; want: 'up' | 'down' | 'remove' } | 'add';

/* This week's rows: typed, or taken from a saved Activity flyer (a copy, then edited like any other).
   Every change is a function of the rows as they are (updateWeek), never of the list this render saw.
   `busy`: the editor has an action out, and takes one at a time. */
function WeekRowsField({ rows, onChange, onTake, busy }: { rows: WeekRow[]; onChange: (fn: (rows: WeekRow[]) => WeekRow[]) => void; onTake: (id: number) => void; busy: boolean }) {
  const [saved, setSaved] = useState<FlyerListItem[] | null>(null);
  // Apart from `saved`, which stays null: a failure is not an empty library, and the picker stays off.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const focus = useRef<RowFocus | null>(null);

  // The saved Activity flyers to take a row from, fetched when the rows are first shown, and again on "Try again".
  useEffect(() => {
    let live = true;
    api.flyers({ template: 'activity' }).then(
      (list) => live && setSaved(list),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  // After a move or a removal: the moved row keeps the focus (its other arrow when this one is off at an end),
  // a removal hands it to the row that took its place, or to "+ Add row".
  useLayoutEffect(() => {
    const f = focus.current;
    if (!f) return;
    focus.current = null;
    const find = (name: string) => root.current?.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`);
    const add = root.current?.querySelector<HTMLButtonElement>('[data-add-row]');
    if (f === 'add') return add?.focus();
    const n = f.slot + 1;
    const first = find(`${f.want === 'remove' ? 'Remove' : 'Move'} row ${n}${f.want === 'remove' ? '' : ` ${f.want}`}`);
    const other = find(`Move row ${n} ${f.want === 'up' ? 'down' : 'up'}`);
    (first && !first.disabled ? first : other && !other.disabled ? other : add)?.focus();
  });

  const set = (slot: number, patch: Partial<WeekRow>) => onChange((rs) => rs.map((r, i) => (i === slot ? { ...r, ...patch } : r)));
  const move = (slot: number, by: -1 | 1) => {
    focus.current = { slot: slot + by, want: by < 0 ? 'up' : 'down' };
    onChange((rs) => {
      const to = slot + by;
      if (to < 0 || to >= rs.length) return rs;
      const next = [...rs];
      [next[slot], next[to]] = [next[to], next[slot]];
      return next;
    });
  };
  const remove = (slot: number) => {
    focus.current = slot < rows.length - 1 ? { slot, want: 'remove' } : slot > 0 ? { slot: slot - 1, want: 'remove' } : 'add';
    onChange((rs) => rs.filter((_, i) => i !== slot));
  };
  const full = rows.length >= WEEK_ROWS_MAX;

  return (
    <div className="week-rows" ref={root}>
      {rows.map((r, slot) => {
        const n = slot + 1;
        const cost = splitBigSub(r.cost);
        return (
          <div key={slot} className="week-row">
            <div className="week-row-head">
              <h3>Row {n}</h3>
              <button type="button" className="btn btn-quiet" aria-label={`Move row ${n} up`} disabled={slot === 0} onClick={() => move(slot, -1)}>
                ↑
              </button>
              <button type="button" className="btn btn-quiet" aria-label={`Move row ${n} down`} disabled={slot === rows.length - 1} onClick={() => move(slot, 1)}>
                ↓
              </button>
              <button type="button" className="btn btn-quiet" aria-label={`Remove row ${n}`} onClick={() => remove(slot)}>
                ✕
              </button>
            </div>
            {!isPrintable(r) && <p className="split split-empty">Empty — this row is hidden</p>}
            <div className="two">
              <label className="field">
                <span className="label">Day</span>
                <input aria-label={`Row ${n} day`} value={r.day} maxLength={WEEK_ROW_LIMITS.day} placeholder="Fridays" onChange={(e) => set(slot, { day: e.target.value })} />
              </label>
              <label className="field">
                <span className="label">Time</span>
                <input aria-label={`Row ${n} time`} value={r.time} maxLength={WEEK_ROW_LIMITS.time} placeholder="20:30" onChange={(e) => set(slot, { time: e.target.value })} />
              </label>
            </div>
            <label className="field">
              <span className="label">Event</span>
              <input aria-label={`Row ${n} event`} value={r.name} maxLength={WEEK_ROW_LIMITS.name} placeholder="Two hours of fun waves" onChange={(e) => set(slot, { name: e.target.value })} />
              <span className="help">The whole name: it wraps to two lines, then shrinks</span>
            </label>
            <label className="field">
              <span className="label">
                Short name<em> optional</em>
              </span>
              <input
                aria-label={`Row ${n} short name`}
                value={r.shortName ?? ''}
                maxLength={WEEK_ROW_LIMITS.shortName}
                placeholder="For a long name"
                onChange={(e) => onChange((rs) => rs.map((x, i) => (i === slot ? withShortName(x, e.target.value) : x)))}
              />
              <span className="help">Prints instead of the event name</span>
            </label>
            <div className="field">
              <span className="label">Price</span>
              <DotInput label={`Row ${n} cost`} value={r.cost} maxLength={WEEK_ROW_LIMITS.cost} placeholder="25€ · 18€ without breakfast" onChange={(v) => set(slot, { cost: v })} />
              <span className="help">Put a · before a second, smaller line</span>
              {cost.big && <Split big={cost.big} sub={cost.sub} empty="" />}
            </div>
          </div>
        );
      })}
      <div className="week-add">
        {!full && (
          <button type="button" className="btn btn-quiet" data-add-row onClick={() => onChange((rs) => (rs.length < WEEK_ROWS_MAX ? [...rs, { ...EMPTY_ROW }] : rs))}>
            + Add row
          </button>
        )}
        <select
          aria-label="Add from a saved flyer"
          value=""
          disabled={full || busy || !saved?.length}
          onChange={(e) => {
            const id = Number(e.target.value);
            if (id) onTake(id);
          }}
        >
          <option value="">
            {failed ? 'Could not load the saved flyers' : saved === null ? 'Loading saved flyers…' : saved.length ? 'Add from a saved flyer…' : `No saved ${TEMPLATE_LABEL.activity} flyers yet`}
          </option>
          {saved?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.hostelName ? `${f.title} · ${f.hostelName}` : f.title}
            </option>
          ))}
        </select>
        {failed && (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/* Zoom is a log slider: the middle just fills the frame, left shrinks the
   photo inside it (down to ¼), right crops in (up to 4×). */
const ZOOM_BASE = ZOOM_MAX; // symmetric: ZOOM_MIN = 1 / ZOOM_MAX
const toSlider = (zoom: number) => Math.log(zoom) / Math.log(ZOOM_BASE);
const fromSlider = (v: number) => (Math.abs(v) < 0.025 ? 1 : ZOOM_BASE ** v); // sticky at "fills the frame"

/* The frame is the one on screen. Every canvas's frame has the same aspect for
   a mode (layout.ts), so the stored crop shows the same picture on all of them. */
function PhotoControls({ photo, data, canvas, onCrop }: { photo: PhotoInfo; data: FlyerData; canvas: CanvasId; onCrop: (fn: (c: Crop) => Crop) => void }) {
  const frame = photoFrame(canvas, bodyOf(data));
  if (!frame) return null;
  const zoom = data.photoCrop.zoom;
  return (
    <div className="photo-controls">
      <Field label={`Zoom ${zoom.toFixed(2)}×`} help="Middle fills the frame · left shows more of the photo · right crops in">
        <input
          type="range"
          min={toSlider(ZOOM_MIN)}
          max={toSlider(ZOOM_MAX)}
          step={0.005}
          value={toSlider(zoom)}
          onChange={(e) => {
            const next = fromSlider(Number(e.target.value));
            onCrop((c) => zoomCrop(c, next, photo, frame));
          }}
        />
      </Field>
      <div className="photo-row">
        <button type="button" className="btn btn-quiet" onClick={() => onCrop(() => DEFAULT_CROP)}>
          Fill frame
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => onCrop(() => ({ x: 0.5, y: 0.5, zoom: wholePhotoZoom(photo, frame) }))}>
          Whole photo
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => onCrop((c) => clampCrop({ ...c, x: 0.5, y: 0.5 }, photo, frame))}>
          Centre
        </button>
      </div>
    </div>
  );
}

function ExtrasField({ extras, onChange }: { extras: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="extras">
      {extras.map((x, i) => (
        <div key={i} className="with-button">
          <input
            value={x}
            aria-label={`Nice to know ${i + 1}`}
            maxLength={32}
            placeholder="Everyone welcome"
            onChange={(e) => onChange(extras.map((y, j) => (j === i ? e.target.value : y)))}
          />
          <button type="button" className="btn btn-quiet" title="Remove" onClick={() => onChange(extras.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      {extras.length < 4 && (
        <button type="button" className="btn btn-quiet" onClick={() => onChange([...extras, ''])}>
          + Add item
        </button>
      )}
    </div>
  );
}
