import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AI_INPUT_MAX, type AiFeature, type AiFeatureOn } from '../shared/ai';
import { flyerFromBrief } from '../shared/brief';
import { lintFlyer } from '../shared/copyRules';
import { withPhoto } from '../shared/defaults';
import { DEFAULT_CANVAS } from '../shared/layout';
import type { AiAssumption, Brief, Hostel } from '../shared/schema';
import { AiPhoto, AiPicture } from './AiPhoto';
import { AiSteps, type Found } from './AiSteps';
import { api, ApiError, asSentence } from './api';
import { offerDraft } from './handoff';
import { LEAVE_PROMPT, useLeaveGuard } from './leaveGuard';
import { briefFieldLabel, FIELD } from './fields';
import { AiUsedUp, BackToLibrary, Field, HostelOptions, Section } from './panel';
import { PHOTO_UPLOADING } from './photoModes';
import { pictureLimits, preparePhoto, type PhotoLimits } from './photoPrep';
import { Preview, copyWarnings, useFitReports } from './Preview';
import { go, onPage } from './route';
import { ShareCopy } from './share';
import { Toasts } from './Toasts';

/* "Create with AI" (#/ai, docs/prompts/ai-assistant.md): a staff member's idea in, a flyer out, ending at "Open in
   editor". A focus page like the editor, which stays the place where a flyer is adjusted and saved. The flyer is
   built from the brief with flyerFromBrief() and shown by the same <Preview> and <Flyer> as everywhere: never a second
   renderer. Everything the model wrote is marked as the AI's.
   Where the site runs the picture read, the idea can come from a picture (docs/prompts/ai-flyer-from-photo.md, stage
   3): the read stops at the words, in the idea box, and the flyer is the staff member's own next step. That way shows
   as three numbered steps (AiSteps.tsx), and its flyer can take the picture along as its photo (stage 4). */

/** What an idea looks like: two plain sentences, the owner's words (2026-10-05). The first one was a real staff
    post, an emoji and a line per fact, and staff read it as a form to fill in. Free text has no lines to copy. */
const PLACEHOLDER = 'Tomorrow at 19:00 we have a sunset stretching class by the pool. Bring water and a towel.';

/** The page's two ways in (the owner's answer, 2026-10-06: "Two ways in on one page"). Both end in the idea box: a
    picture is read into it, and the flyer is made from there. */
type Way = 'idea' | 'photo';
const WAY_LABEL: Record<Way, string> = { idea: 'From your idea', photo: 'From a photo' };
const WAY_HINT: Record<Way, string> = {
  idea: 'Paste the event as you would post it in the group: a few lines, in Spanish or English. The AI writes the flyer; you check it in the editor.',
  photo: 'A poster, a board, a Canva page or a chat screenshot. The AI reads its words into “Your idea”; you check them, then Generate.',
};

/** Under the idea box after a read: what to check in the words it left there, or that it left none. The owner's
    words (2026-10-06). `none` is a picture with no words, or one that announces no event: a sign, a menu, an empty
    board. */
const READ_NOTE: Record<Found, string> = {
  words: 'Read from your picture. Check every word, and add what is missing (the price?). [?] marks a word the AI could not read. If it lists several activities, keep the one this flyer is for.',
  none: 'The AI found no event in this picture. Write the event here yourself.',
};

/** After the server's own sentence when a read failed for no fault of the picture (the owner's line, 2026-10-06): the
    read was free, and the picture is still chosen. */
const PICTURE_KEPT = 'Your picture is still here: try again, or type the event yourself.';
/** The words of that line that are its link, to the idea box (his ask, the same day). */
const TYPE_IT = 'type the event yourself';

/** The line with its link. The link is cut out of the sentence, which stays one constant: what a spec pins letter for
    letter cannot drift from what the page shows. */
function PictureKept({ onType }: { onType: () => void }) {
  const [before, after] = PICTURE_KEPT.split(TYPE_IT);
  return (
    <>
      {' '}
      {before}
      <button type="button" className="linkish" onClick={onType}>
        {TYPE_IT}
      </button>
      {after}
    </>
  );
}

/** On the result, the picture an idea was read from, offered as the flyer's photo (the brief's stage 4; the owner's
    words, and his answer: "Offered, off by default"). */
const USE_PICTURE = 'Use this picture as the flyer’s photo';

/** What the stage says while an action is out. The first two are the AI's work and carry its ✨; the last is the
    picture taken along as the flyer's photo, on its way up (the owner's answer, 2026-10-06, with the editor's own
    word on the button: PHOTO_UPLOADING). */
const WAITING = {
  flyer: '✨ The AI is writing your flyer… it can take half a minute.',
  photo: '✨ The AI is reading your picture… it can take half a minute.',
  open: 'Adding your picture to the flyer…',
} as const;

/** One action at a time, as in the editor: a picture dropped or pasted while one is out. */
const STILL_WORKING = 'Still working on the last action — try the picture again in a moment.';

interface Result {
  brief: Brief;
  assumptions: AiAssumption[];
  /** The idea this flyer came from, as it was sent: the box may have changed since. */
  idea: string;
  /** The picture it was made from: the one on the page, read, when Generate was pressed. Null for an idea typed in
      by itself. Another picture may have been chosen since. */
  picture: File | null;
}

export function AiPage({
  hostels,
  ai,
  photo,
  limits,
  onRemaining,
  recount,
}: {
  hostels: Hostel[];
  /** The flyer feature as api/config lists it: its own limit, and what is left of it today. */
  ai: AiFeatureOn;
  /** The picture read for this staff member, with its own count: null where the site does not run it, and the page
      then has its one way in, as before. */
  photo: AiFeatureOn | null;
  /** The site's photo upload limits: a picture is shrunk in the browser before it is sent to be read. */
  limits: PhotoLimits;
  onRemaining: (feature: AiFeature, remaining: number) => void;
  /** Asks the server again what is left today of a feature. */
  recount: (feature: AiFeature) => void;
}) {
  const [chosenWay, setWay] = useState<Way>('idea');
  const way: Way = photo ? chosenWay : 'idea';
  // The picture to read. It is kept here, so it is still chosen after a look at the other way, and after a read.
  const [picture, setPicture] = useState<File | null>(null);
  const [idea, setIdea] = useState('');
  // The last read: the picture it was of, and what it left, words in the idea box or none. That picks the line under
  // the box, which stays until the next read.
  const [read, setRead] = useState<{ of: File; found: Found } | null>(null);
  // The box holds words a read was spent on, and no flyer has been made from them yet. A later read that finds no
  // event leaves them there, and this with them.
  const [wordsRead, setWordsRead] = useState(false);
  const wordsUnmade = wordsRead && idea.trim() !== '';
  // The picture on the page is one that was read: it is on its way to a flyer. Another one chosen since is not.
  const pictureRead = picture !== null && read?.of === picture;
  // On its words the steps then stand where the switch was (the owner's sketch, 2026-10-06): the page reads as a step
  // forward, where the From your idea tab read as the page going back to its start.
  const stepping = pictureRead && way === 'idea';
  // Where the focus goes when the button that was pressed is gone with its screen: to the line under the box once a
  // read lands, to the way the page is on again after "Change the picture", into the box after the failed-read
  // line's link.
  const [focus, setFocus] = useState<{ on: 'note' | 'way' | 'idea' } | null>(null);
  const readNote = useRef<HTMLParagraphElement>(null);
  const photoWay = useRef<HTMLButtonElement>(null);
  const ideaBox = useRef<HTMLTextAreaElement>(null);
  const readNoteId = useId();
  const [hostel, setHostel] = useState('');
  // One action at a time: the flyer's generation, a picture's read, or the picture on its way to the editor.
  const [busy, setBusy] = useState<null | keyof typeof WAITING>(null);
  const [error, setError] = useState<string | null>(null);
  // The red note is a read's that failed for no fault of its picture, which is still worth another try.
  const [pictureKept, setPictureKept] = useState(false);
  const say = useCallback((message: string | null, kept = false) => {
    setError(message);
    setPictureKept(kept);
  }, []);
  const [result, setResult] = useState<Result | null>(null);
  // The picture the flyer on screen was made from, offered as its photo: while it is still the one on the page, so
  // that "this picture" is the one the staff member sees there, and on an Activity flyer, since a This week one has
  // no photo. A picture with no event is offered too (the owner's answer, 2026-10-06): the event was typed for it.
  const offered = result && result.picture === picture && result.brief.template === 'activity' ? result.picture : null;
  // The picture the box is ticked for, or null. Kept by picture, so a flyer made again from the same one keeps the
  // tick, and a flyer from another picture starts unticked.
  const [ticked, setTicked] = useState<File | null>(null);
  const usePicture = offered !== null && ticked === offered;
  const [opening, setOpening] = useState(false);
  // Whether this page is still the one on screen, for an answer that lands after the staff member has left (open()).
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);
  const { onFit, cutOff } = useFitReports();

  // A flyer made and not yet opened is unsaved work, and a generation spent: leaving asks, as the editor does. So are
  // the words read from a picture while they are in the box: a read was spent on them. So is a read on its way: it
  // counts once it is answered, and its words would land nowhere (the editor guards a photo on its way the same).
  // A picture chosen and not read cost nothing, and asks nothing.
  useLeaveGuard((result !== null || wordsUnmade || busy === 'photo') && !opening);
  // After a read the button that was pressed is gone with its way. The focus goes to the line under the box, so a
  // keyboard stands at the box and a screen reader hears what happened. Not to the box itself: on a phone that
  // raises the keyboard over the words to check. "Change the picture" is gone with the steps it stood under: the
  // focus goes to From a photo in the switch, which says where the page is. "type the event yourself" is gone with
  // its note: the cursor goes into the box, where the keyboard is now wanted.
  useEffect(() => {
    if (focus) ({ note: readNote, way: photoWay, idea: ideaBox })[focus.on].current?.focus();
  }, [focus]);
  // "Open in editor" moves once the guard has let go (its layout effect runs first), so the move asks nothing.
  useEffect(() => {
    if (opening) go('#/new');
  }, [opening]);

  const nameOf = (slug: string | null) => hostels.find((h) => h.slug === slug)?.name ?? null;
  const flyer = useMemo(() => (result ? flyerFromBrief(result.brief, nameOf(result.brief.hostel)) : null), [result]); // eslint-disable-line react-hooks/exhaustive-deps
  const lints = useMemo(() => (flyer ? lintFlyer(flyer.data) : []), [flyer]);
  const left = ai.remaining;

  // A picture chosen, dropped or pasted. It is a new start, so what the last one was told goes. One that arrives
  // while an action is out is refused with a reason: the read on its way is of the picture on screen.
  const pick = useCallback(
    (file: File | null) => {
      if (busy) return say(STILL_WORKING);
      setPicture(file);
      say(null);
    },
    [busy, say],
  );

  // A picture → its words, in the idea box. Words already there are replaced only on a yes, asked before the read
  // is sent: it counts once the provider has answered, whatever becomes of the words.
  async function readPicture() {
    if (!photo || !picture) return;
    const cost = photo.remaining === 1 ? 'the last of today’s picture reads' : `one of the ${photo.remaining} picture reads left today`;
    if (idea.trim() && !confirm(`Replace your idea with the words the AI reads from this picture? It uses ${cost}.`)) return;
    setBusy('photo');
    say(null);
    let sent = false;
    try {
      // Shrunk here first, as a flyer's photo is, to the read's edge and under the host's upload limit.
      const { blob, name } = await preparePhoto(picture, pictureLimits(limits));
      sent = true;
      const r = await api.aiPhoto(blob, name);
      onRemaining(photo.name, r.remaining);
      // No event in the picture: the box stays as it was. Nothing is worth less than what was typed.
      if (r.text) {
        setIdea(r.text);
        setWordsRead(true);
      }
      setRead({ of: picture, found: r.text ? 'words' : 'none' });
      setWay('idea');
      setFocus({ on: 'note' });
      // What was said while it was out (a picture that came too soon) is about a moment that is over.
      say(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Refused: the picture itself, here or by the server's own checks, or the day's reads are used up. The message
      // says what to do, and nothing reached the provider.
      const refused = !sent || (e instanceof ApiError && e.status < 500);
      if (e instanceof ApiError && e.status === 429) onRemaining(photo.name, 0);
      // Anything else may have reached the provider. Such a read is free, answers no count, and is one of the day's
      // tries: what is left is asked from the server again.
      else if (!refused) recount(photo.name);
      say(refused ? message : asSentence(message), !refused);
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    setBusy('flyer');
    say(null);
    const sent = idea;
    // The picture this flyer is made from, as the page stands at this moment: the one on it, once it is read.
    const from = pictureRead ? picture : null;
    try {
      const r = await api.aiFlyer(hostel ? { text: sent, hostel } : { text: sent });
      setResult({ brief: r.brief, assumptions: r.assumptions, idea: sent, picture: from });
      // Words read from a picture are in a flyer now: the flyer is the unsaved work from here.
      setWordsRead(false);
      onRemaining(ai.name, r.remaining);
      say(null);
    } catch (e) {
      // The limit was reached elsewhere (another tab, another staff member): say so in this feature's count too.
      if (e instanceof ApiError && e.status === 429) onRemaining(ai.name, 0);
      say(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // The switch. From your idea, with the page's picture already read, is the way back to its words: the switch then
  // leaves with the button that was pressed, so the focus goes to the line under the box, as after the read itself.
  function chooseWay(to: Way) {
    setWay(to);
    if (to === 'idea' && pictureRead) setFocus({ on: 'note' });
  }

  // Back to choosing a picture. The words stay in the box, with the guard that holds them: a read was spent on them,
  // and the next one asks before it replaces them.
  function changePicture() {
    setWay('photo');
    setFocus({ on: 'way' });
  }

  // The failed-read line's link: to the idea box, to type the event by hand. The picture stays chosen, for another
  // try, and the note has said what it had to.
  function typeIt() {
    setWay('idea');
    say(null);
    setFocus({ on: 'idea' });
  }

  // "Open in editor". With the picture taken along it is an action like the others: the picture is uploaded first, as a
  // flyer's photo is from the editor. It is the original, at a photo's own limits: the read was sent a copy shrunk to
  // the read's edge. If the upload fails the page stays, with the photo route's own message and the tick still set.
  async function open() {
    if (!result || !flyer) return;
    // Words a read was spent on are in the box and in no flyer: the one on the stage is an older one, made before
    // them. Opening it leaves them behind, so it asks, as every other way out does, and before a picture is sent.
    if (wordsUnmade && !confirm(LEAVE_PROMPT)) return;
    const draft = { title: result.brief.title?.trim() ?? '', hostel: flyer.hostel, data: flyer.data };
    const taking = usePicture ? offered : null;
    if (!taking) {
      offerDraft({ ...draft, photo: null }, result.idea);
      return setOpening(true);
    }
    setBusy('open');
    say(null);
    try {
      const { blob, name } = await preparePhoto(taking, limits);
      const photo = await api.uploadPhoto(blob, name);
      // The staff member may have left meanwhile, on a yes to the leave question. An answer that lands then hands
      // nothing over: the next new flyer would open as this draft. The URL says so at once, where React unmounts a
      // page a few tasks after the move; the page itself says so when they have since come back to Create with AI,
      // which is the same URL and another page.
      if (!onPage('ai') || !here.current) return;
      offerDraft({ ...draft, data: withPhoto(draft.data), photo }, result.idea);
      setOpening(true);
    } catch (e) {
      say(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    // Idle (no flyer, nothing on its way, nothing to say): on a phone the form then has the screen (editor.css).
    <div className={'editor ai-page' + (!flyer && !busy && !error ? ' ai-page-idle' : '')}>
      <aside className="panel">
        <div className="panel-head">
          <BackToLibrary className="btn btn-quiet" />
        </div>
        {/* Where the steps stand alone they say what the hint would, as in the owner's sketch. */}
        <Section title="✨ Create with AI" hint={stepping ? undefined : WAY_HINT[way]}>
          {photo && !stepping && (
            <div className="seg ai-ways" role="group" aria-label="Start from">
              {(Object.entries(WAY_LABEL) as [Way, string][]).map(([key, label]) => (
                <button
                  key={key}
                  ref={key === 'photo' ? photoWay : undefined}
                  type="button"
                  className={way === key ? 'on' : ''}
                  aria-pressed={way === key}
                  disabled={!!busy}
                  onClick={() => chooseWay(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* From the first tap on From a photo (the owner's answer, 2026-10-06): under the switch while a picture is
              chosen and read, then in its place, with the picture that was read and the way back to choosing one.
              The last step is for the flyer made from this picture: one from an idea typed in, or from a picture
              chosen before, leaves this one at its words. */}
          {(way === 'photo' || stepping) && (
            <AiSteps at={way === 'photo' ? 1 : result?.picture === picture ? 3 : 2} found={pictureRead && read ? read.found : 'words'} />
          )}
          {stepping && (
            <AiPicture picture={picture} className="ai-picture-read">
              <button type="button" className="linkish" disabled={!!busy} onClick={changePicture}>
                Change the picture
              </button>
            </AiPicture>
          )}
          {way === 'photo' && photo ? (
            <AiPhoto ai={photo} flyer={ai} picture={picture} busy={!!busy} reading={busy === 'photo'} onPick={pick} onRead={readPicture} />
          ) : (
            <>
              <Field label="Your idea">
                <textarea
                  ref={ideaBox}
                  rows={10}
                  value={idea}
                  maxLength={AI_INPUT_MAX}
                  placeholder={PLACEHOLDER}
                  aria-describedby={read ? readNoteId : undefined}
                  onChange={(e) => {
                    setIdea(e.target.value);
                    // Emptied, the box holds nothing of a read any more.
                    if (!e.target.value.trim()) setWordsRead(false);
                  }}
                />
              </Field>
              {/* Focused when a read lands (above), which is how it is announced: it holds its words from the start. */}
              {read && (
                <p ref={readNote} id={readNoteId} tabIndex={-1} className="help ai-read-note">
                  {READ_NOTE[read.found]}
                </p>
              )}
              <Field label={FIELD.hostel} help="Pick one, or let the AI read it from your text">
                <select aria-label={FIELD.hostel} value={hostel} onChange={(e) => setHostel(e.target.value)}>
                  <option value="">Let the AI decide</option>
                  <HostelOptions hostels={hostels} />
                </select>
              </Field>
              <button type="button" className="btn btn-accent" disabled={!!busy || !idea.trim() || left === 0} onClick={generate}>
                {busy === 'flyer' ? 'Writing…' : '✨ Generate'} <span className="ai-left">({left} left today)</span>
              </button>
              <AiUsedUp feature={ai.name} limit={ai.limit} left={left} />
            </>
          )}
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
            {/* Beside the button it changes: ticked, "Open in editor" takes the picture along as the flyer's photo. */}
            {offered && (
              <label className="check">
                <input type="checkbox" checked={usePicture} disabled={!!busy} onChange={(e) => setTicked(e.target.checked ? offered : null)} />
                {USE_PICTURE}
              </label>
            )}
            <button type="button" className="btn btn-dark" disabled={!!busy || left === 0} onClick={generate}>
              Try again ({left === 0 ? 'none left today' : left === 1 ? 'uses the last one' : `uses one of ${left} left`})
            </button>
            <button type="button" className="btn btn-accent" disabled={!!busy} onClick={open}>
              {busy === 'open' ? PHOTO_UPLOADING : 'Open in editor'}
            </button>
          </div>
        )}

        {busy ? (
          <div className="stage">
            <p className="ai-waiting" role="status">
              {WAITING[busy]}
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
            onDropFile={() => say('Open the flyer in the editor to add its photo.')}
          />
        ) : (
          <div className="stage">
            <p className="ai-empty">Your flyer appears here.</p>
          </div>
        )}

        <Toasts
          outcome={
            error === null
              ? null
              : {
                  kind: 'error',
                  body: (
                    <>
                      {error}
                      {/* "Try again" only while a read is left to try with: at none, the used-up sentence says the rest. */}
                      {pictureKept && photo && photo.remaining > 0 && <PictureKept onType={typeIt} />}
                    </>
                  ),
                }
          }
          onCloseOutcome={() => say(null)}
          warnings={flyer && !busy ? copyWarnings(cutOff, lints) : []}
        />
      </main>
    </div>
  );
}
