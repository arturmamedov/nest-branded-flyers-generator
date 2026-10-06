import { useEffect, useRef, useState } from 'react';
import { copyTitle, libraryDate } from '../shared/names';
import type { FlyerListItem, Hostel, Template } from '../shared/schema';
import { api } from './api';
import { FlyerThumb } from './FlyerThumb';
import { go, onPage } from './route';
import { localStorageGet, localStorageSet } from './prefs';
import { TEMPLATE_LABEL, isTemplate } from './templates';

const savedTemplate = (): Template | '' => {
  const v = localStorageGet('library.template');
  return isTemplate(v) ? v : '';
};

const when = (iso: string) => libraryDate(new Date(iso), true);

export function Library({ hostels }: { hostels: Hostel[] }) {
  const [filter, setFilter] = useState<string>(() => localStorageGet('library.hostel') ?? '');
  const [template, setTemplate] = useState<Template | ''>(savedTemplate);
  const [items, setItems] = useState<FlyerListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // The library scrolls inside itself (editor.css): each card's picture measures its nearness against this.
  const scroller = useRef<HTMLDivElement>(null);

  // Answers can come back out of order (a slow host, two quick changes of filter): only the latest load's answer is
  // applied, or an earlier filter's list would show under the later choice.
  const latest = useRef(0);
  const load = () => {
    const n = ++latest.current;
    return api.flyers({ hostel: filter || undefined, template: template || undefined }).then(
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
    setItems(null);
    load();
  }, [filter, template]); // eslint-disable-line react-hooks/exhaustive-deps

  async function duplicate(id: number) {
    setBusyId(id);
    try {
      const p = await api.flyer(id);
      const { id: newId } = await api.create({
        title: copyTitle(p.flyer.title),
        hostel: p.flyer.hostel,
        template: p.flyer.template,
        data: p.flyer.data,
        photoId: p.flyer.photoId,
      });
      if (onPage('library')) go(`#/flyers/${newId}`); // saved either way; it opens only if the user is still here
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusyId(null);
    }
  }

  async function archive(item: FlyerListItem) {
    if (!confirm(`Archive "${item.title}"? It disappears from the library.`)) return;
    setBusyId(item.id);
    try {
      await api.archive(item.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="library" ref={scroller}>
      <div className="library-head">
        <h1>Flyer library</h1>
        <label className="filter">
          <span>Hostel</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All flyers</option>
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
            {(Object.entries(TEMPLATE_LABEL) as [Template, string][]).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
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
      {items && items.length > 0 && (
        <ul className="cards">
          {items.map((f) => (
            <li key={f.id} className="card">
              {/* The picture is inside the link and hidden from its name (FlyerThumb): the card is still its title. */}
              <a className="card-main" href={`#/flyers/${f.id}`}>
                <FlyerThumb id={f.id} version={f.updatedAt} scroller={scroller} />
                <span className="card-text">
                  <span className="card-title">{f.title}</span>
                  <span className="card-meta">
                    {f.hostelName ?? 'All hostels'} · {TEMPLATE_LABEL[f.template]} · {when(f.updatedAt)}
                  </span>
                </span>
              </a>
              <div className="card-actions">
                <a className="btn btn-quiet" href={`#/flyers/${f.id}`}>
                  Open
                </a>
                <button type="button" className="btn btn-quiet" disabled={busyId === f.id} onClick={() => duplicate(f.id)}>
                  Duplicate
                </button>
                <button type="button" className="btn btn-quiet" disabled={busyId === f.id} onClick={() => archive(f)}>
                  Archive
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
