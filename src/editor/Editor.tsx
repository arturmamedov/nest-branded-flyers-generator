import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHIP_VALUE_MAX, deriveChip, splitBigSub } from '../shared/chips';
import { EXTRA_MAX, EXTRAS_MAX } from '../shared/extras';
import { FLYER_LABELS, LABELS_MAX, knownLabels, tidyLabels, toggleLabel } from '../shared/labels';
import { ACCEPTED_PHOTO_TYPES } from '../shared/limits';
import { lintFlyer } from '../shared/copyRules';
import { followHostel, marksFor, newFlyerData, switchTemplate, weekTitle, withPhoto } from '../shared/defaults';
import { CANVASES, CANVAS_IDS, SHARED_GEOMETRY, bodyOf, photoFrame, type CanvasId, type PhotoMode } from '../shared/layout';
import { DEFAULT_CROP, ZOOM_MAX, ZOOM_MIN, clampCrop, wholePhotoZoom, zoomCrop } from '../shared/photo';
import type { AiFeature, AiFeatureOn } from '../shared/ai';
import type { Chip, ChipKey, Crop, FlyerData, FlyerInput, FlyerListItem, FlyerText, Hostel, PhotoInfo, Template, WeekRow } from '../shared/schema';
import { TITLE_MAX, libraryName } from '../shared/names';
import { SHARE_MAX, SHARE_SPANISH_BREAK, shareDetails } from '../shared/share';
import { TEXT_LIMITS } from '../shared/text';
import { WEEK_ROWS_MAX, WEEK_ROW_LIMITS, isPrintable, rowFromActivity } from '../shared/week';
import { api, ApiError, asSentence } from './api';
import { COPY_FAILED, canCopyImage } from './clipboard';
import type { ExportFormat, FlyerExporter } from './export';
import { TOUCH_QUERY, exportActions, needsPhoto as frameNeedsPhoto, type ExportAction } from './exportActions';
import { takeDraft } from './handoff';
import { useLeaveGuard } from './leaveGuard';
import { FIELD } from './fields';
import { useOneAction } from './oneAction';
import { AiUsedUp, BackToLibrary, Field, HostelOptions, Section, type Fold } from './panel';
import { PHOTO_MODE_LABEL, PHOTO_UPLOADING } from './photoModes';
import { pictureActions } from './pictureActions';
import { preparePhoto, type PhotoLimits } from './photoPrep';
import { onPage, replaceHash } from './route';
import { CANVAS_PREF, localStorageGet, localStorageSet, savedCanvas } from './prefs';
import { SECTIONS, SECTIONS_PREF, allOpen, flaggedSections, openAtStart, opened, sectionLine, sectionsOf, storeOpen, toggled, type SectionId } from './sectionFolds';
import { Preview, copyWarnings, useFitReports } from './Preview';
import { ShareCopy, ShareFab } from './share';
import { canShareFiles } from './shareSheet';
import { Toasts, type Warning } from './Toasts';
import { warningId } from './toastFolds';
import { WaysOut } from './WaysOut';
import { TEMPLATE_LABEL } from './templates';
import { useMedia } from './useMedia';

/** A flyer as the editor holds it. The AI page hands one over whole (handoff.ts). */
export interface Draft {
  title: string;
  hostel: string | null;
  data: FlyerData;
  photo: PhotoInfo | null;
}

const blankDraft = (): Draft => ({ title: '', hostel: null, data: newFlyerData('activity'), photo: null });

/** The line under the labels' buttons: what they are for, or, with the flyer's room taken, why the ones not pressed
    wait greyed. A label that is no longer on the list is stored and shows nowhere, so it takes room unseen: the line
    says how many do (found in review, 2026-10-14). */
function labelRoom(labels: readonly string[]): string {
  if (labels.length < LABELS_MAX) return 'For the library’s filter — not printed';
  const hidden = labels.length - knownLabels(labels).length;
  const unseen = hidden === 0 ? '' : `, and ${hidden} of this one’s ${hidden === 1 ? 'is' : 'are'} no longer on the list`;
  return `A flyer carries ${LABELS_MAX} labels at most${unseen}: take one off to add another.`;
}

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

/** The details a flyer's caption stands for when the flyer is opened: its own, when it has a caption. Nothing is
    stored of where a caption came from, so one that is there counts as written for the flyer as it is. */
const captionDetails = (d: Draft): string | null => (d.data.share.trim() ? shareDetails(d.hostel, d.data) : null);

/** What "Write with AI" answers (the editor's UX round, Part 1): it writes the caption and saves the flyer. */
const CAPTION_SAVED = '✨ The AI wrote the caption and saved the flyer: read it before you post.';
const captionUnsaved = (reason: string) => `✨ The AI wrote the caption, but the flyer was not saved. ${asSentence(reason)} Press Save to try again.`;

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

/** Where staff look for a photo when they have none (the owner's line, 2026-10-05). The line says nothing about
    licences: only the words he approved. */
const PEXELS_URL = 'https://www.pexels.com/';

const CHIP_HELP: Record<ChipKey, { placeholder: string; help: string }> = {
  when: { placeholder: 'Saturday 19/9 · 15:00', help: 'Day on the yellow stroke · the hour next to the clock' },
  where: { placeholder: 'The terrace', help: 'The hostel prints big; type the spot. Add · for a second line' },
  cost: { placeholder: 'Free · food & drinks', help: 'Price big · what it includes small' },
};

export function Editor({
  id,
  hostels,
  exporter,
  limits,
  ai,
  onRemaining,
}: {
  id: number | null;
  hostels: Hostel[];
  exporter: FlyerExporter;
  limits: PhotoLimits;
  /** The share text's AI ("Write with AI") for this staff member, with its own limit and what is left of it today:
      null where the site does not run it for them, and the editor then shows nothing of it. */
  ai: AiFeatureOn | null;
  /** Tells the app what is left today of a feature after an AI answer. */
  onRemaining: (feature: AiFeature, remaining: number) => void;
}) {
  // A new flyer the AI page made (handoff.ts): taken once, it starts the draft as it was offered, unsaved, so the leave
  // guard is armed at once and the first save makes its URL as for any new flyer.
  const [handoff] = useState(() => (id == null ? takeDraft() : null));
  const [draft, setDraft] = useState<Draft | null>(id == null ? (handoff?.draft ?? blankDraft()) : null);
  const [savedJson, setSavedJson] = useState<string>(() => (id == null ? JSON.stringify(toInput(blankDraft(), hostels)) : 'loading'));
  const [flyerId, setFlyerId] = useState<number | null>(id);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<CanvasId>(savedCanvas);
  const [safe, setSafe] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  // One action at a time, and what the last one came to (oneAction.ts).
  const { busy, message, setMessage, run, turn } = useOneAction<'save' | 'upload' | 'row' | 'ai' | ExportAction>();
  // What this browser can do with the flyer as a picture: asked once, it does not change while the page is open.
  const [can] = useState(() => ({ copy: canCopyImage(), share: canShareFiles() }));
  // A finger as the main pointer: there the share sheet is the first way out (exportActions.ts).
  const touch = useMedia(TOUCH_QUERY);
  const fileInput = useRef<HTMLInputElement>(null);
  // The details the caption on the form was written from: by the AI in this visit, or as the flyer stood when it was
  // opened with one. While they are still the flyer's, "Write with AI" steps back to a small "Write again" (the
  // owner's answers, 2026-10-07). A caption typed by hand in this visit sets nothing here.
  const [captionOf, setCaptionOf] = useState<string | null>(() => (draft ? captionDetails(draft) : null));
  // The staff member has saved the AI's flyer themselves (Save, or a download): the save "Write with AI" makes does
  // not count, or the AI draft warning would leave at the moment the AI wrote one thing more.
  const [ownSave, setOwnSave] = useState(false);
  // Whether this editor is still the page on screen, for an answer that lands after the staff member has left. It
  // takes both checks: the URL says so at once, where React unmounts a page a few tasks after the move; the page
  // itself says so when they have since opened another flyer, which is the same kind of URL and another editor.
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);
  const onScreen = () => (onPage('new') || onPage('edit')) && here.current;
  // A share sheet this editor asked for and has no answer from yet: one at a time.
  const sheetAsked = useRef(false);

  // The sections open in this editor (sectionFolds.ts): all of a new flyer's and of an AI-made one's, a saved flyer's
  // as they were left last time. Only an editor that opened a saved flyer remembers them. `id` is this editor's for
  // as long as it is mounted, and a new flyer's first save keeps it mounted: nothing folds or is written then.
  const [openSections, setOpenSections] = useState<readonly SectionId[]>(() => openAtStart(id != null, localStorageGet(SECTIONS_PREF)));
  const sectionsAtStart = useRef(openSections);
  useEffect(() => {
    // Opening a flyer is no "last time": only a change is written.
    if (id != null && openSections !== sectionsAtStart.current) localStorageSet(SECTIONS_PREF, storeOpen(openSections));
  }, [id, openSections]);
  // The whole form folds away, to a rail on a desktop and up to its head bar on a phone (editor.css). It starts open
  // on every visit: a form hidden on arrival would look broken, so only the sections are remembered.
  const [panelOpen, setPanelOpen] = useState(true);
  const formId = useId();
  const labelsHelp = useId();
  // Folded, the form is not laid out and forgets how far it was scrolled: opened, it gets its place back.
  const form = useRef<HTMLDivElement>(null);
  const formPlace = useRef(0);
  useLayoutEffect(() => {
    if (panelOpen && form.current) form.current.scrollTop = formPlace.current;
  }, [panelOpen]);

  useEffect(() => {
    if (id == null) return;
    api.flyer(id).then(
      (p) => {
        // The record's template wins over data.template, as it does on every write (normalize.ts). The labels are
        // put in the list's order the same way, before the saved copy is taken below: a list that changed its order
        // since the flyer was saved must not make one press and its undo read "Unsaved changes". Read loosely: a
        // backend from before labels sends none, and the form must still open (it was a blank page, found 2026-10-14).
        const data = { ...p.flyer.data, template: p.flyer.template, labels: tidyLabels(p.flyer.data.labels ?? []) };
        const d: Draft = { title: p.flyer.title, hostel: p.flyer.hostel, data, photo: p.photo };
        setDraft(d);
        setCaptionOf(captionDetails(d));
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
  const { onFit, cutOff } = useFitReports();
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
  // A label on, or off: saved in the list's order, so pressed and pressed again is the flyer as it was (labels.ts).
  const pressLabel = (slug: string) => setDraft((d) => (d ? { ...d, data: { ...d.data, labels: toggleLabel(d.data.labels, slug) } } : d));

  const week = draft.data.template === 'week';
  // The AI wrote this flyer and the staff member has not saved it yet: every fact is still the model's.
  const aiDraft = handoff !== null && !ownSave;
  // The caption was written for the flyer as it is: a second try is a small link. Once a detail changes, or the
  // caption is emptied, the button is back.
  const captionWritten = draft.data.share.trim() !== '' && captionOf === shareDetails(draft.hostel, draft.data);
  // The week title's defaults, as a new week flyer gets them for this hostel: the placeholders once cleared.
  const weekDefaults = weekTitle(hostel?.name ?? null);
  // A frame with no photo in it would print as a blank strip; a week flyer has no frame at all.
  const needsPhoto = frameNeedsPhoto(canvas, draft.data, draft.photo);

  // The draft to write is this render's unless the caller has a later one: an answer that lands after the render its
  // action started from (writeShare) saves the draft as it is then.
  async function save(d: Draft = draft!): Promise<number> {
    const input = toInput(d, hostels);
    const res = flyerId == null ? await api.create(input) : await api.update(flyerId, input);
    setSavedJson(JSON.stringify(input));
    if (d.title.trim() === '') set({ title: input.title });
    if (flyerId == null) {
      setFlyerId(res.id);
      // Keep this editor mounted; just make the URL reopenable. Only while the new flyer is still the page
      // on screen: a save that answers after the user has moved on leaves their URL alone.
      replaceHash('#/new', `#/flyers/${res.id}`);
    }
    return res.id;
  }

  const onSave = () =>
    run('save', async () => {
      await save();
      setOwnSave(true);
      return 'Saved to the library.';
    });

  // The flyer as a picture, for every way out of the editor (a download, and what Part 3 of the UX round adds beside
  // it): saved first, as a download always was, then the canvas on screen when the button was pressed. What you see
  // is what you get. The export seam is one call on both backends (export/).
  async function picture(format: ExportFormat) {
    const savedId = await save();
    setOwnSave(true);
    return exporter.export({ id: savedId, format, canvas });
  }

  // The ways to take the flyer out as a picture (pictureActions.ts, which the library shares): what each one does, and
  // the step a toast then offers.
  const { act, step: stepFor } = pictureActions({ run, say: setMessage, picture, caption: draft.data.share, canvas, onScreen, turn, sheet: sheetAsked, stale: dirty });

  const onFile = (file: File) =>
    run('upload', async () => {
      const { blob, name } = await preparePhoto(file, limits);
      const photo = await api.uploadPhoto(blob, name);
      setDraft((d) => (d ? { ...d, photo, data: withPhoto(d.data) } : d));
      // The photo's controls are in its section: a photo that lands opens it. One that is dropped on the preview
      // finds it closed on a saved flyer; a file the checks above refuse opens nothing.
      setOpenSections((open) => opened(open, 'photo'));
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

  // The caption from what the fields say now, with the idea the flyer came from when the AI made it. A caption already
  // there is replaced only on a yes: the generation is counted either way once it is sent. One press writes it and
  // saves the flyer (the owner's ask, 2026-10-07), as one action.
  const writeShare = () => {
    if (!ai) return;
    const cost = ai.remaining === 1 ? 'the last generation' : `one of the ${ai.remaining} generations`;
    if (draft.data.share.trim() && !confirm(`Replace the caption with one the AI writes? It uses ${cost} left today.`)) return;
    run('ai', async () => {
      const { hostel: slug, data } = latestDraft.current!;
      // The details as they were sent: a field changed while the answer was on its way leaves a caption that is no
      // longer the flyer's, and the button stays.
      const sent = shareDetails(slug, data);
      const r = await api.aiShare({ hostel: slug, template: data.template, data, ...(handoff ? { idea: handoff.idea } : {}) }).catch((e) => {
        if (e instanceof ApiError && e.status === 429) onRemaining(ai.name, 0);
        throw e;
      });
      onRemaining(ai.name, r.remaining);
      // The staff member left while it was on its way, on a yes to the leave question where there was unsaved work:
      // nothing of this flyer is written behind their back (onScreen() says why it takes two checks, as on the AI
      // page).
      if (!onScreen()) return;
      setData({ share: r.share });
      setCaptionOf(sent);
      // The draft as it is now, with the caption: save() by itself would write the draft of the render this action
      // started from, which has neither the caption nor what was typed since.
      const now = latestDraft.current!;
      try {
        await save({ ...now, data: { ...now.data, share: r.share } });
      } catch (e) {
        // The caption stays in the form, unsaved, and the generation is spent either way.
        throw new Error(captionUnsaved(e instanceof Error ? e.message : String(e)));
      }
      return CAPTION_SAVED;
    });
  };

  // What is still true of the flyer on the stage, in the order it matters: whose facts these are, what stops a
  // download, then the copy.
  const warnings: Warning[] = [
    ...(aiDraft ? [{ id: warningId('ai-draft', ''), body: '✨ AI draft: check every fact before you print.' }] : []),
    ...(needsPhoto
      ? [
          {
            id: warningId('needs-photo', ''),
            body: (
              <>
                Add a photo, or{' '}
                <button type="button" className="linkish" onClick={() => setData({ photoMode: 'none' })}>
                  switch to {PHOTO_MODE_LABEL.none}
                </button>{' '}
                — the empty photo band would print as a blank strip.
              </>
            ),
          },
        ]
      : []),
    ...copyWarnings(cutOff, lints),
  ];

  // Which way out is the first button, and which are behind "Download" (exportActions.ts).
  const offer = exportActions(can, touch);
  // The toast's next step, drawn with the flyer as it is now.
  const step = stepFor(message?.next, needsPhoto);

  const t = draft.data.text;
  const chip = (key: ChipKey) => draft.data.chips.find((c) => c.key === key) as Chip;
  const togglePanel = () => {
    if (panelOpen) formPlace.current = form.current?.scrollTop ?? 0;
    setPanelOpen((open) => !open);
  };
  // The sections this template shows: one list (sectionFolds.ts) for the form below, and for "Open all".
  const shown = sectionsOf(draft.data.template);
  // "Open all" until every section on screen is open, then "Close all". Either one is every section's, the other
  // template's too.
  const everyOpen = allOpen(openSections, draft.data.template);
  // A closed section says what is inside, and shows a dot while a warning stands for one of its fields.
  const flagged = flaggedSections(
    lints.map((l) => l.field),
    needsPhoto,
  );
  const fold = (section: SectionId): Fold => ({
    open: openSections.includes(section),
    onToggle: () => setOpenSections((open) => toggled(open, section)),
    line: sectionLine(section, { data: draft.data, hostelName: hostel?.name ?? null, hasPhoto: draft.photo !== null }),
    flagged: flagged.includes(section),
  });

  return (
    <div className="editor">
      <aside className={panelOpen ? 'panel' : 'panel panel-folded'}>
        {/* The editor has no shared bar (App.tsx): the way back stays at the top of the form, and on what is left of
            it when the form is folded. The fold button comes first, so it is in the same corner open and folded;
            it is one button in both states, and keeps the focus. */}
        <div className="panel-head">
          <button type="button" className="btn btn-quiet" aria-label={panelOpen ? 'Hide the form' : 'Show the form'} aria-controls={formId} onClick={togglePanel}>
            <svg className="panel-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="2" y="3" width="12" height="10" rx="2.5" />
              <path d="M6.5 3v10" />
            </svg>
            {panelOpen ? 'Hide' : 'Form'}
          </button>
          <BackToLibrary className="btn btn-quiet" />
          <span className="spacer" />
          {panelOpen && (
            <button type="button" className="btn btn-quiet" onClick={() => setOpenSections(everyOpen ? [] : [...SECTIONS])}>
              {everyOpen ? 'Close all' : 'Open all'}
            </button>
          )}
        </div>
        {/* Folded, the form is hidden whole, so no field can be reached by Tab, by the pointer or by a screen
            reader; it stays mounted, as a closed section's content does. */}
        <div ref={form} id={formId} className="panel-body" hidden={!panelOpen}>
          <Section title={FIELD.flyer} fold={fold('flyer')}>
            <div className="field">
              <span className="label">{FIELD.template}</span>
              <div className="seg" role="group" aria-label={FIELD.template}>
                {(Object.entries(TEMPLATE_LABEL) as [Template, string][]).map(([key, label]) => (
                  <button key={key} type="button" className={draft.data.template === key ? 'on' : ''} aria-pressed={draft.data.template === key} onClick={() => chooseTemplate(key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Field
              label={FIELD.hostel}
              help={`${hostel?.logoPath && marksFor(true).includes('badge') ? 'Its badge prints at the top. ' : ''}${week ? 'Named in the Spanish title line, and tags the flyer in the library' : 'Prints in the WHERE block and tags the flyer in the library'}`}
            >
              <select aria-label={FIELD.hostel} value={draft.hostel ?? ''} onChange={(e) => chooseHostel(e.target.value || null)}>
                <option value="">All hostels (chain-wide)</option>
                <HostelOptions hostels={hostels} />
              </select>
            </Field>
            <Field label={FIELD.title} help="Only for finding it again — not printed">
              <input value={draft.title} placeholder={autoTitle({ ...draft, title: '' }, hostels)} maxLength={TITLE_MAX} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            {/* What kind of flyer it is, for the library's filter (the flyers' labels, 2026-10-14): a button a label,
                pressed for the ones it carries. A group of buttons, so no <label> wraps it: a press on the word would
                press the first one. With the flyer's room taken, the ones not pressed wait greyed. */}
            <div className="field">
              <span className="label">{FIELD.labels}</span>
              <div className="label-picker" role="group" aria-label={FIELD.labels} aria-describedby={labelsHelp}>
                {FLYER_LABELS.map(({ slug, name }) => {
                  const on = draft.data.labels.includes(slug);
                  return (
                    <button key={slug} type="button" className={on ? 'on' : ''} aria-pressed={on} disabled={!on && draft.data.labels.length >= LABELS_MAX} onClick={() => pressLabel(slug)}>
                      {name}
                    </button>
                  );
                })}
              </div>
              {/* What the buttons are for, or why the ones not pressed wait greyed. */}
              <span className="help" id={labelsHelp}>
                {labelRoom(draft.data.labels)}
              </span>
            </div>
          </Section>

          {/* A week flyer's title is the headline's lines: one set, kept across a switch (the owner's call, 2026-09-29). */}
          <Section title={week ? FIELD.weekTitle : FIELD.headline} fold={fold('headline')} hint={week ? `The same lines as the ${TEMPLATE_LABEL.activity} headline: switching template keeps them.` : undefined}>
            {/* The small line at the flyer's top, over the headline: with it, as it prints (Artur, 2026-10-13; it was in
                a section of its own with the tag pill, at the form's end). */}
            <Field label={FIELD.eyebrow}>
              <input value={t.eyebrow} maxLength={TEXT_LIMITS.eyebrow} onChange={(e) => setText('eyebrow', e.target.value)} />
            </Field>
            <Field label={FIELD.line1} lang="en" help={week ? 'Black' : 'Black. About 18 characters before it starts to shrink'}>
              <input value={t.headline1} maxLength={TEXT_LIMITS.headline1} placeholder={week ? weekDefaults.headline1 : 'Saturday is a'} onChange={(e) => setText('headline1', e.target.value)} />
            </Field>
            <Field label={FIELD.line2} lang="en" help={week ? 'Big and teal' : 'Big and teal. About 15 characters'}>
              <input value={t.headline2} maxLength={TEXT_LIMITS.headline2} placeholder={week ? weekDefaults.headline2 : 'pool party.'} onChange={(e) => setText('headline2', e.target.value)} />
            </Field>
            <Field
              label={FIELD.spanishLine}
              lang="es"
              optional
              help={week ? 'Names the place picked above until you change it. Leave empty and it disappears' : 'Leave empty and it disappears'}
            >
              <textarea
                rows={2}
                value={t.headlineEs}
                maxLength={TEXT_LIMITS.headlineEs}
                placeholder={week ? weekDefaults.headlineEs : 'El sábado toca fiesta en la piscina.'}
                onChange={(e) => setText('headlineEs', e.target.value)}
              />
            </Field>
          </Section>

          {shown.includes('photo') && (
            <Section title={FIELD.photo} fold={fold('photo')}>
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
                      {busy === 'upload' ? PHOTO_UPLOADING : draft.photo ? 'Replace photo' : 'Choose photo'}
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
                  {/* After the photo's own help, whose "Or" answers the button above. A new tab: leaving the editor with
                      unsaved work asks first, and a link must never cost a draft. */}
                  <p className="help">
                    Need a photo? Search{' '}
                    <a className="linkish" href={PEXELS_URL} target="_blank" rel="noopener noreferrer">
                      Pexels
                    </a>
                    .
                  </p>
                  {draft.photo && <PhotoControls photo={draft.photo} data={draft.data} canvas={canvas} onCrop={updateCrop} />}
                </>
              )}
            </Section>
          )}

          {shown.includes('facts') && (
            <Section title={FIELD.facts} fold={fold('facts')} hint="Put a · between the big line and the small line.">
              {(['when', 'where', 'cost'] as const).map((key) => (
                <ChipField key={key} chip={chip(key)} hostelName={hostel?.name ?? null} onChange={(v) => setChip(key, v)} />
              ))}
            </Section>
          )}

          {shown.includes('extras') && (
            <Section title={FIELD.extras} fold={fold('extras')} hint="0–4 short items. The dots are added for you.">
              <ExtrasField extras={draft.data.extras} onChange={(extras) => setData({ extras })} />
            </Section>
          )}

          {shown.includes('rows') && (
            <Section title={FIELD.weekRows} fold={fold('rows')} hint={`Up to ${WEEK_ROWS_MAX}. Type them, or take one from a saved ${TEMPLATE_LABEL.activity} flyer and change it.`}>
              <WeekRowsField rows={draft.data.week} onChange={updateWeek} onTake={takeRow} busy={busy !== null} />
            </Section>
          )}

          <Section title={FIELD.ask} fold={fold('ask')}>
            <Field label={FIELD.english} lang="en">
              <input value={t.askEn} maxLength={TEXT_LIMITS.askEn} onChange={(e) => setText('askEn', e.target.value)} />
            </Field>
            <Field label={FIELD.spanish} lang="es" optional>
              <input value={t.askEs} maxLength={TEXT_LIMITS.askEs} onChange={(e) => setText('askEs', e.target.value)} />
            </Field>
          </Section>

          <Section title={FIELD.pill} fold={fold('pill')}>
            <label className="check">
              <input type="checkbox" checked={draft.data.showPill} onChange={(e) => setData({ showPill: e.target.checked })} />
              Show the tag pill
            </label>
            {draft.data.showPill && (
              <div className="two">
                <Field label={FIELD.handle}>
                  <input value={t.handle} maxLength={TEXT_LIMITS.handle} onChange={(e) => setText('handle', e.target.value)} />
                </Field>
                <Field label={FIELD.tag}>
                  <input value={t.tag} maxLength={TEXT_LIMITS.tag} onChange={(e) => setText('tag', e.target.value)} />
                </Field>
              </div>
            )}
          </Section>

          <Section title={FIELD.share} fold={fold('share')} hint="Not printed. The caption to paste when you post or send the flyer.">
            {ai && (
              <div className="ai-write">
                {/* One button in both states: the one that was pressed is there to take the focus back (run()). */}
                <button type="button" className={captionWritten ? 'linkish ai-again' : 'btn'} disabled={!!busy || ai.remaining === 0} onClick={writeShare}>
                  {busy === 'ai' ? 'Writing…' : captionWritten ? 'Write again' : '✨ Write with AI'} <span className="ai-left">({ai.remaining} left today)</span>
                </button>
                <AiUsedUp feature={ai.name} limit={ai.limit} left={ai.remaining} />
              </div>
            )}
            <Field label="Caption" optional>
              <textarea
                rows={8}
                value={draft.data.share}
                readOnly={busy === 'ai'}
                maxLength={SHARE_MAX}
                placeholder={`TODAY we have a plan! 🌅\n🕖 19:00 h · 📍 The pool\n\n${SHARE_SPANISH_BREAK}\n\n¡HOY tenemos plan! 🌅`}
                onChange={(e) => {
                  setData({ share: e.target.value });
                  // Emptied, the caption that was written is gone: what is typed next is the staff member's own.
                  if (!e.target.value.trim()) setCaptionOf(null);
                }}
              />
            </Field>
            <ShareCopy text={draft.data.share} />
          </Section>
        </div>
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
          {/* The flyer's own actions are one group at the bar's right end (editor.css): it wraps as a whole, so no
              button drops alone to the left of a second row, and the menu's list always has room to open. */}
          <div className="toolbar-actions">
            <span className="status">{dirty ? 'Unsaved changes' : flyerId ? 'Saved' : ''}</span>
            <button type="button" className="btn btn-dark" disabled={!!busy || (!dirty && flyerId != null)} onClick={onSave}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <WaysOut offer={offer} act={act} busy={busy} disabled={!!busy || needsPhoto} dark />
          </div>
        </div>

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

        {draft.data.share.trim() && <ShareFab text={draft.data.share} onFail={(why) => setMessage({ kind: 'error', text: COPY_FAILED.text[why] })} />}
        <Toasts outcome={message && { kind: message.kind, body: message.text, action: step }} onCloseOutcome={() => setMessage(null)} warnings={warnings} />
      </main>
    </div>
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
      <DotInput label={chip.label} value={chip.value} maxLength={CHIP_VALUE_MAX} placeholder={placeholder} onChange={onChange} />
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

  // The saved Activity flyers to take a row from, fetched when a week flyer's form is first shown (its rows may be
  // closed then: a closed section stays mounted), and again on "Try again".
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
  const frame = photoFrame(canvas, bodyOf(data), SHARED_GEOMETRY);
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
            aria-label={`${FIELD.extras} ${i + 1}`}
            maxLength={EXTRA_MAX}
            placeholder="Everyone welcome"
            onChange={(e) => onChange(extras.map((y, j) => (j === i ? e.target.value : y)))}
          />
          <button type="button" className="btn btn-quiet" title="Remove" onClick={() => onChange(extras.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      {extras.length < EXTRAS_MAX && (
        <button type="button" className="btn btn-quiet" onClick={() => onChange([...extras, ''])}>
          + Add item
        </button>
      )}
    </div>
  );
}
