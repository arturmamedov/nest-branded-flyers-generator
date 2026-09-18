import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FitReport } from '../flyer/fit';
import { deriveChip } from '../shared/chips';
import { lintFlyer } from '../shared/copyRules';
import { newFlyerData } from '../shared/defaults';
import { photoFrame } from '../shared/layout';
import { ZOOM_MAX, ZOOM_MIN, clampCrop, wholePhotoZoom, zoomCrop } from '../shared/photo';
import type { Chip, ChipKey, Crop, FlyerData, FlyerInput, FlyerText, Hostel, PhotoInfo } from '../shared/schema';
import { api, ApiError } from './api';
import { Preview } from './Preview';

interface Draft {
  title: string;
  hostel: string | null;
  data: FlyerData;
  photo: PhotoInfo | null;
}

const blankDraft = (): Draft => ({ title: '', hostel: null, data: newFlyerData('activity'), photo: null });

const autoTitle = (d: Draft) =>
  d.title.trim() || [d.data.text.headline1, d.data.text.headline2].join(' ').replace(/\s+/g, ' ').replace(/\.$/, '').trim() || 'Untitled flyer';

const toInput = (d: Draft): FlyerInput => ({
  title: autoTitle(d),
  hostel: d.hostel,
  template: 'activity',
  data: d.data,
  photoId: d.photo?.id ?? null,
});

const CHIP_HELP: Record<ChipKey, { placeholder: string; help: string }> = {
  when: { placeholder: 'Saturday 19/9 · 15:00', help: 'Day on the yellow stroke · the hour next to the clock' },
  where: { placeholder: 'The terrace', help: 'The hostel prints big; type the spot. Add · for a second line' },
  cost: { placeholder: 'Free · food & drinks', help: 'Price big · what it includes small' },
};

export function Editor({ id, hostels }: { id: number | null; hostels: Hostel[] }) {
  const [draft, setDraft] = useState<Draft | null>(id == null ? blankDraft() : null);
  const [savedJson, setSavedJson] = useState<string>(() => (id == null ? JSON.stringify(toInput(blankDraft())) : 'loading'));
  const [flyerId, setFlyerId] = useState<number | null>(id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fit, setFit] = useState<FitReport | null>(null);
  const [safe, setSafe] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'png' | 'jpg' | 'upload'>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id == null) return;
    api.flyer(id).then(
      (p) => {
        const d: Draft = { title: p.flyer.title, hostel: p.flyer.hostel, data: p.flyer.data, photo: p.photo };
        setDraft(d);
        setSavedJson(JSON.stringify(toInput(d)));
      },
      (e) => setLoadError(e instanceof ApiError && e.status === 404 ? 'This flyer does not exist or was archived.' : String(e.message)),
    );
  }, [id]);

  const dirty = draft ? JSON.stringify(toInput(draft)) !== savedJson : false;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const hostel = useMemo(() => hostels.find((h) => h.slug === draft?.hostel) ?? null, [hostels, draft?.hostel]);
  const lints = useMemo(() => (draft ? lintFlyer(draft.data) : []), [draft]);
  const onFit = useCallback((r: FitReport) => setFit(r), []);

  if (loadError) return <div className="banner banner-error">{loadError} <a href="#/">Back to the library</a></div>;
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

  const needsPhoto = draft.data.photoMode !== 'none' && !draft.photo;
  const shrunk = fit ? fit.clippedBoxes + fit.entries.filter((e) => e.overflowX).length : 0;

  async function save(): Promise<number> {
    const input = toInput(draft!);
    const res = flyerId == null ? await api.create(input) : await api.update(flyerId, input);
    setSavedJson(JSON.stringify(input));
    if (draft!.title.trim() === '') set({ title: input.title });
    if (flyerId == null) {
      setFlyerId(res.id);
      // Keep this editor mounted; just make the URL reopenable.
      history.replaceState(null, '', `#/flyers/${res.id}`);
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
      const { blob, filename } = await api.render(savedId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return `Downloaded ${filename} (1080 × 1920).`;
    });

  const onFile = (file: File) =>
    run('upload', async () => {
      const photo = await api.uploadPhoto(file);
      setDraft((d) =>
        d ? { ...d, photo, data: { ...d.data, photoCrop: { x: 0.5, y: 0.5, zoom: 1 }, photoMode: d.data.photoMode === 'none' ? 'bleed' : d.data.photoMode } } : d,
      );
    });

  const t = draft.data.text;
  const chip = (key: ChipKey) => draft.data.chips.find((c) => c.key === key) as Chip;

  return (
    <div className="editor">
      <aside className="panel">
        <Section title="Flyer">
          <Field label="Hostel" help="Prints in the WHERE block and tags the flyer in the library">
            <select value={draft.hostel ?? ''} onChange={(e) => set({ hostel: e.target.value || null })}>
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
            <input value={draft.title} placeholder={autoTitle({ ...draft, title: '' })} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
          </Field>
        </Section>

        <Section title="Headline">
          <Field label="Line 1" help="Black. About 18 characters before it starts to shrink">
            <input value={t.headline1} maxLength={40} placeholder="Saturday is a" onChange={(e) => setText('headline1', e.target.value)} />
          </Field>
          <Field label="Line 2" help="Big and teal. About 15 characters">
            <input value={t.headline2} maxLength={40} placeholder="pool party." onChange={(e) => setText('headline2', e.target.value)} />
          </Field>
          <Field label="Spanish line" optional help="Leave empty and it disappears">
            <textarea rows={2} value={t.headlineEs} maxLength={140} placeholder="El sábado toca fiesta en la piscina." onChange={(e) => setText('headlineEs', e.target.value)} />
          </Field>
        </Section>

        <Section title="When · Where · Cost" hint="Put a · between the big line and the small line.">
          {(['when', 'where', 'cost'] as const).map((key) => (
            <ChipField key={key} chip={chip(key)} hostelName={hostel?.name ?? null} onChange={(v) => setChip(key, v)} />
          ))}
        </Section>

        <Section title="Nice to know" hint="0–4 short items. The dots are added for you.">
          <ExtrasField extras={draft.data.extras} onChange={(extras) => setData({ extras })} />
        </Section>

        <Section title="The ask">
          <Field label="English">
            <input value={t.askEn} maxLength={60} onChange={(e) => setText('askEn', e.target.value)} />
          </Field>
          <Field label="Spanish" optional>
            <input value={t.askEs} maxLength={70} onChange={(e) => setText('askEs', e.target.value)} />
          </Field>
        </Section>

        <Section title="Photo">
          <div className="seg">
            {(
              [
                ['bleed', 'Full bleed'],
                ['band', 'In a frame'],
                ['none', 'No photo'],
              ] as const
            ).map(([mode, label]) => (
              <button key={mode} type="button" className={draft.data.photoMode === mode ? 'on' : ''} onClick={() => setData({ photoMode: mode })}>
                {label}
              </button>
            ))}
          </div>
          {draft.data.photoMode !== 'none' && (
            <>
              <div className="photo-row">
                <button type="button" className="btn" disabled={busy === 'upload'} onClick={() => fileInput.current?.click()}>
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
                  accept="image/jpeg,image/png,image/webp"
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
              {draft.photo && <PhotoControls photo={draft.photo} data={draft.data} onCrop={updateCrop} />}
            </>
          )}
        </Section>

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

        {(message || needsPhoto || lints.length > 0 || shrunk > 0) && (
          <div className="notes">
            {message && <div className={message.kind === 'ok' ? 'note note-ok' : 'note note-error'}>{message.text}</div>}
            {needsPhoto && (
              <div className="note note-warn">
                Add a photo, or{' '}
                <button type="button" className="linkish" onClick={() => setData({ photoMode: 'none' })}>
                  switch to No photo
                </button>{' '}
                — the empty photo band would print as a blank strip.
              </div>
            )}
            {shrunk > 0 && <div className="note note-warn">Some text is at its smallest size and is being cut off — shorten it.</div>}
            {lints.map((l, i) => (
              <div key={i} className="note note-warn">
                {l.message}
              </div>
            ))}
          </div>
        )}

        <Preview
          data={draft.data}
          hostel={hostel}
          photo={draft.data.photoMode === 'none' ? null : draft.photo}
          showSafeZones={safe}
          actualSize={actualSize}
          onFit={onFit}
          onCrop={setCrop}
          onDropFile={onFile}
        />
      </main>
    </div>
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

function Field({ label, help, optional, children }: { label: string; help?: string; optional?: boolean; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">
        {label}
        {optional && <em> optional</em>}
      </span>
      {children}
      {help && <span className="help">{help}</span>}
    </label>
  );
}

function ChipField({ chip, hostelName, onChange }: { chip: Chip; hostelName: string | null; onChange: (v: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const derived = deriveChip(chip, hostelName);
  const insertDot = () => {
    const el = input.current!;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start).replace(/\s+$/, '') + ' · ' + el.value.slice(end).replace(/^\s+/, '');
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = next.length - el.value.slice(end).replace(/^\s+/, '').length;
      el.setSelectionRange(pos, pos);
    });
  };
  const { placeholder, help } = CHIP_HELP[chip.key];
  return (
    <div className="field">
      <span className="label">{chip.label}</span>
      <div className="with-button">
        <input ref={input} aria-label={chip.label} value={chip.value} maxLength={90} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn btn-quiet dot" title="Insert a · separator" onClick={insertDot}>
          ·
        </button>
      </div>
      <span className="help">{help}</span>
      {derived.big ? (
        <span className="split">
          <b>{derived.big}</b>
          {derived.sub && <span>{derived.sub}</span>}
        </span>
      ) : (
        <span className="split split-empty">Empty — this block is hidden</span>
      )}
    </div>
  );
}

/* Zoom is a log slider: the middle just fills the frame, left shrinks the
   photo inside it (down to ¼), right crops in (up to 4×). */
const ZOOM_BASE = ZOOM_MAX; // symmetric: ZOOM_MIN = 1 / ZOOM_MAX
const toSlider = (zoom: number) => Math.log(zoom) / Math.log(ZOOM_BASE);
const fromSlider = (v: number) => (Math.abs(v) < 0.025 ? 1 : ZOOM_BASE ** v); // sticky at "fills the frame"

function PhotoControls({ photo, data, onCrop }: { photo: PhotoInfo; data: FlyerData; onCrop: (fn: (c: Crop) => Crop) => void }) {
  const frame = photoFrame(data.photoMode);
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
        <button type="button" className="btn btn-quiet" onClick={() => onCrop(() => ({ x: 0.5, y: 0.5, zoom: 1 }))}>
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
