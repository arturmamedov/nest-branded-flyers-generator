import { useEffect, useMemo, useRef, useState } from 'react';
import { copyTitle } from '../shared/names';
import type { FlyerListItem, Hostel, Template } from '../shared/schema';
import { api } from './api';
import { assetUrl } from '../flyer/urls';
import { canCopyImage } from './clipboard';
import type { FlyerExporter } from './export';
import { NO_PHOTO, TOUCH_QUERY, exportActions, type ExportAction } from './exportActions';
import { LibraryCard, lacksPhoto, type Busy, type CardAction, type Target } from './LibraryCard';
import { ALL_LABELS, LABEL_FILTER_OPTIONS, LABEL_PREF, labelFilterFrom } from './libraryLabel';
import { flyerAnswers } from './libraryFlyers';
import { SEARCH_PREF, findFlyers, searchWords, type Found } from './librarySearch';
import { LIBRARY_VIEWS, VIEW_LABEL, VIEW_PREF, viewFrom, type LibraryView } from './libraryView';
import { Lightbox } from './Lightbox';
import { useOneAction } from './oneAction';
import { pictureActions, type Answer } from './pictureActions';
import { go, onPage } from './route';
import { localStorageGet, localStorageSet, savedCanvas } from './prefs';
import { canShareFiles } from './shareSheet';
import { TEMPLATE_LABEL, isTemplate } from './templates';
import { Toasts } from './Toasts';
import { useMedia } from './useMedia';
import { WaysOut } from './WaysOut';

/* The poster over every reception (its QR leads to the experience page). Two files in assets/main-flyers/: a newer
   version is these two paths, and the names the files download under. */
const MAIN_FLYER = {
  png: { path: 'assets/main-flyers/V7-check.png', name: 'Nest QR flyer V7.png' },
  pdf: { path: 'assets/main-flyers/Simple QR flyer for Nest V7.pdf', name: 'Nest QR flyer V7.pdf' },
};

const savedTemplate = (): Template | '' => {
  const v = localStorageGet('library.template');
  return isTemplate(v) ? v : '';
};

const NO_WARNINGS: never[] = [];

function ViewIcon({ view }: { view: LibraryView }) {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      {view === 'list' ? (
        <path d="M2 3.5h10M2 7h10M2 10.5h10" />
      ) : (
        <>
          <rect x="2" y="2" width="4" height="4" rx="1" />
          <rect x="8" y="2" width="4" height="4" rx="1" />
          <rect x="2" y="8" width="4" height="4" rx="1" />
          <rect x="8" y="8" width="4" height="4" rx="1" />
        </>
      )}
    </svg>
  );
}

export function Library({ hostels, exporter }: { hostels: Hostel[]; exporter: FlyerExporter }) {
  const [filter, setFilter] = useState<string>(() => localStorageGet('library.hostel') ?? '');
  const [template, setTemplate] = useState<Template | ''>(savedTemplate);
  // One label's flyers, the ones with none, or all (libraryLabel.ts): the server filters, as for the other two.
  const [label, setLabel] = useState(() => labelFilterFrom(localStorageGet(LABEL_PREF)));
  // The flyers as a list or as a grid: how this viewer looks at them (libraryView.ts).
  const [view, setView] = useState<LibraryView>(() => viewFrom(localStorageGet(VIEW_PREF)));
  const [items, setItems] = useState<FlyerListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The library scrolls inside itself (editor.css): each card's nearness is measured against this.
  const scroller = useRef<HTMLDivElement>(null);
  // Each flyer's own answer, for this visit: the cards' pictures and ways out, and the search (libraryFlyers.ts).
  const [flyers] = useState(() => flyerAnswers(api.flyer));
  // The search narrows the list the filters gave, in the page (librarySearch.ts), and is remembered as they are.
  const [query, setQuery] = useState(() => localStorageGet(SEARCH_PREF) ?? '');
  const words = useMemo(() => searchWords(query), [query]);
  const searching = words.length > 0;

  // A flyer leaves the library as a picture the ways it leaves the editor (pictureActions.ts), one action at a time,
  // and what an action came to is the editor's toast. The picture is of the canvas this viewer last chose in the
  // editor, the one its Download gives; the cards' own pictures are always the default canvas.
  const [canvas] = useState(savedCanvas);
  const [can] = useState(() => ({ copy: canCopyImage(), share: canShareFiles() }));
  const offer = exportActions(can, useMedia(TOUCH_QUERY));
  const { busy, message, setMessage, run, turn } = useOneAction<Busy>();
  // Whose action the message is about: its next step ("Share now", "Copy the caption") is that flyer's. Noted when
  // the message lands, never when its action starts: another card's "Copy text" may be pressed in between.
  const [owner, setOwner] = useState<Target | null>(null);
  const sheetAsked = useRef(false);
  // The flyer shown large (Lightbox.tsx).
  const [zoomed, setZoomed] = useState<Target | null>(null);
  // Whether this library is still the page on screen, for an answer that lands after the staff member has left: the
  // URL says so at once, and the page itself when they have left and come back (Editor.tsx, onScreen()).
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);
  const onScreen = () => onPage('library') && here.current;
  // A toast that stands is about the flyer it came from: another flyer's lightbox opens without it.
  const opener = useRef<HTMLElement | null>(null);
  const zoom = (target: Target, from: HTMLElement) => {
    opener.current = from;
    setMessage(null);
    setZoomed(target);
  };
  // The browser gives the focus back to what had it when the dialog opened. Safari on a Mac gives a pressed button
  // none, so there the dialog has nothing to go back to: the button that opened it is handed the focus here.
  const unzoom = () => {
    opener.current?.focus();
    setZoomed(null);
  };

  // Answers can come back out of order (a slow host, two quick changes of filter): only the latest load's answer is
  // applied, or an earlier filter's list would show under the later choice.
  const latest = useRef(0);
  const load = () => {
    const n = ++latest.current;
    return api.flyers({ hostel: filter || undefined, template: template || undefined, label: label || undefined }).then(
      (list) => {
        if (n !== latest.current) return;
        setItems(list);
        setError(null);
      },
      (e) => {
        if (n === latest.current) setError(e.message);
      },
    );
  };

  useEffect(() => {
    localStorageSet('library.hostel', filter);
    localStorageSet('library.template', template);
    localStorageSet(LABEL_PREF, label);
    setItems(null);
    load();
  }, [filter, template, label]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => localStorageSet(SEARCH_PREF, query), [query]);
  // A search reads every listed flyer, a few at a time; the list redraws as their answers land, and only then.
  useEffect(() => {
    if (searching && items) flyers.read(items);
  }, [searching, items, flyers]);
  const [, redraw] = useState(0);
  useEffect(() => {
    if (searching) return flyers.subscribe(() => redraw((n) => n + 1));
  }, [searching, flyers]);

  const filtered = filter !== '' || template !== '' || label !== ALL_LABELS;
  // One way back to every flyer: the search emptied, and the filters set back to all (the owner's answer).
  const clearAll = () => {
    setQuery('');
    setFilter('');
    setTemplate('');
    setLabel(ALL_LABELS);
  };
  const found = searching && items ? findFlyers(items, words, (item) => flyers.answer(item.id, item.updatedAt)) : null;
  const shown: { item: FlyerListItem; found: Found | null }[] = found?.found ?? items?.map((item) => ({ item, found: null })) ?? [];

  const chooseView = (v: LibraryView) => {
    setView(v);
    localStorageSet(VIEW_PREF, v);
  };

  // A flyer's ways out. It is saved, so its picture is the export alone: no save first, as the editor's needs.
  const waysOf = (target: Target) => {
    const { id } = target.item;
    const start = (kind: ExportAction | CardAction, fn: () => Promise<Answer>) =>
      void run({ id, kind }, async () => {
        const answer = await fn();
        setOwner(target);
        return answer;
      });
    return pictureActions({
      run: start,
      say: (m) => {
        setOwner(target);
        setMessage(m);
      },
      picture: (format) => exporter.export({ id, format, canvas }),
      caption: target.payload.flyer.data.share,
      canvas,
      onScreen,
      turn,
      sheet: sheetAsked,
      stale: false,
    });
  };

  const duplicate = (item: FlyerListItem) =>
    void run({ id: item.id, kind: 'duplicate' }, async () => {
      const p = await api.flyer(item.id);
      const { id: newId } = await api.create({
        title: copyTitle(p.flyer.title),
        hostel: p.flyer.hostel,
        template: p.flyer.template,
        data: p.flyer.data,
        photoId: p.flyer.photoId,
      });
      if (onScreen()) go(`#/flyers/${newId}`); // saved either way; it opens only if the user is still here
    });

  const archive = (item: FlyerListItem) => {
    if (!confirm(`Archive "${item.title}"? It disappears from the library.`)) return;
    void run({ id: item.id, kind: 'archive' }, async () => {
      await api.archive(item.id);
      await load();
    });
  };

  // The toast's next step is its own flyer's, drawn as the flyer is.
  const step = owner && message?.next ? waysOf(owner).step(message.next, lacksPhoto(canvas, owner.payload)) : undefined;
  const toasts = <Toasts outcome={message && { kind: message.kind, body: message.text, action: step }} onCloseOutcome={() => setMessage(null)} warnings={NO_WARNINGS} />;
  const large = zoomed && waysOf(zoomed);
  const largeNoPhoto = zoomed !== null && lacksPhoto(canvas, zoomed.payload);

  return (
    <>
      {/* Behind the lightbox the library keeps its place: it does not scroll (editor.css). */}
      <div className={'library' + (zoomed ? ' library-held' : '')} ref={scroller}>
        {/* Two rows (the flyers' labels, 2026-10-14; the owner's picks from pictures): the name with how the flyers
            are looked at, then what is looked for. On a phone the three filters are two to a row and their words
            are not drawn (editor.css), so each one's first choice says what it is. */}
        <div className="library-head">
          <div className="library-top">
            <h1>Flyer library</h1>
            <div className="seg view-switch" role="group" aria-label="View">
              {LIBRARY_VIEWS.map((v) => (
                <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => chooseView(v)}>
                  <ViewIcon view={v} />
                  {VIEW_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
          <div className="library-filters">
            {/* The search, first of the filters (the owner's pick from pictures, 2026-10-14), with Clear beside it
                while there is something to clear. The box gives Clear its room, so the filters never move. */}
            <div className="library-search" role="search">
              <input
                type="search"
                aria-label="Search"
                placeholder="Name, label, share text…"
                value={query}
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape' || query === '') return;
                  e.preventDefault();
                  setQuery('');
                }}
              />
              <button type="button" className="btn btn-quiet" hidden={query === '' && !filtered} onClick={clearAll}>
                Clear
              </button>
            </div>
            <label className="filter">
              <span>Hostel</span>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">All hostels</option>
                <option value="none">Chain-wide only</option>
                {hostels.map((h) => (
                  <option key={h.slug} value={h.slug}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span>Template</span>
              <select value={template} onChange={(e) => setTemplate(isTemplate(e.target.value) ? e.target.value : '')}>
                <option value="">All templates</option>
                {(Object.entries(TEMPLATE_LABEL) as [Template, string][]).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span>Label</span>
              <select value={label} onChange={(e) => setLabel(labelFilterFrom(e.target.value))}>
                {LABEL_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.text}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {/* How many the search found, said to a screen reader as it changes: in the page before its words. How many
            flyers are still being read is shown and not said, or it would be said at every answer. */}
        <div className={'library-status' + (found ? ' library-status-on' : '')}>
          <p className="library-count" role="status">
            {found && items ? `${found.found.length} of ${items.length} flyers` : ''}
          </p>
          {found && items && found.waiting > 0 && (
            <p className="library-reading">
              Reading the flyers… {items.length - found.waiting} of {items.length}
            </p>
          )}
        </div>
        {error && <div className="banner banner-error">{error}</div>}
        {!items && !error && <div className="loading">Loading…</div>}
        {items && items.length === 0 && (
          <div className="empty">
            <p>No flyers here yet.</p>
            <a className="btn btn-accent" href="#/new">
              Make the first one
            </a>
          </div>
        )}
        {items && items.length > 0 && found && found.found.length === 0 && found.waiting === 0 && (
          <div className="library-none">
            <p>
              No flyer matches “{query.trim()}”{filtered ? ' with these filters' : ''}.
            </p>
            <button type="button" className="btn" onClick={clearAll}>
              {filtered ? 'Clear the search and filters' : 'Clear the search'}
            </button>
          </div>
        )}
        {shown.length > 0 && (
          <ul className={`cards cards-${view}`}>
            {shown.map(({ item: f, found: hit }) => (
              <LibraryCard key={f.id} item={f} words={words} why={hit?.why ?? null} scroller={scroller} flyers={flyers} canvas={canvas} offer={offer} busy={busy} ways={waysOf} onZoom={zoom} onDuplicate={duplicate} onArchive={archive} />
            ))}
          </ul>
        )}
        <section className="main-flyer" aria-labelledby="main-flyer-title">
          <h2 id="main-flyer-title">Main reception flyer</h2>
          <p>The poster over every reception. Its QR code leads guests to our experience page.</p>
          <img
            src={assetUrl(MAIN_FLYER.png.path)}
            alt="The main Nest flyer: Live Nest at maximum. Scan the QR code and book your next adventure."
            loading="lazy"
          />
          <div className="main-flyer-actions">
            <a className="btn btn-accent" href={assetUrl(MAIN_FLYER.png.path)} download={MAIN_FLYER.png.name}>
              Download PNG
            </a>
            <a className="btn" href={assetUrl(MAIN_FLYER.pdf.path)} download={MAIN_FLYER.pdf.name}>
              Download PDF
            </a>
          </div>
        </section>
      </div>
      {zoomed && large ? (
        <Lightbox title={zoomed.item.title} payload={zoomed.payload} canvas={canvas} onClose={unzoom}>
          {largeNoPhoto && <div className="lightbox-note">{NO_PHOTO}</div>}
          <div className="lightbox-actions">
            <WaysOut offer={offer} act={large.act} busy={busy?.id === zoomed.item.id ? busy.kind : null} disabled={busy !== null || largeNoPhoto}>
              <button type="button" className="btn" disabled={!zoomed.payload.flyer.data.share.trim()} onClick={large.copyCaption}>
                Copy text
              </button>
            </WaysOut>
            <a className="btn" href={`#/flyers/${zoomed.item.id}`}>
              Open in editor
            </a>
          </div>
          {/* The dialog is over everything else on the page: what an action answers is said inside it. */}
          {toasts}
        </Lightbox>
      ) : (
        toasts
      )}
    </>
  );
}
