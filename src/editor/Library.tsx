import { useEffect, useState } from 'react';
import type { FlyerListItem, Hostel, Template } from '../shared/schema';
import { api } from './api';
import { go, onPage } from './route';
import { localStorageGet, localStorageSet } from './prefs';
import { TEMPLATE_LABEL, isTemplate } from './templates';

const savedTemplate = (): Template | '' => {
  const v = localStorageGet('library.template');
  return isTemplate(v) ? v : '';
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function Library({ hostels }: { hostels: Hostel[] }) {
  const [filter, setFilter] = useState<string>(() => localStorageGet('library.hostel') ?? '');
  const [template, setTemplate] = useState<Template | ''>(savedTemplate);
  const [items, setItems] = useState<FlyerListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () =>
    api.flyers({ hostel: filter || undefined, template: template || undefined }).then(
      (list) => {
        setItems(list);
        setError(null);
      },
      (e) => setError(e.message),
    );

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
        title: `${p.flyer.title} (copy)`.slice(0, 80),
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
    <div className="library">
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
              <a className="card-main" href={`#/flyers/${f.id}`}>
                <span className="card-title">{f.title}</span>
                <span className="card-meta">
                  {f.hostelName ?? 'All hostels'} · {TEMPLATE_LABEL[f.template]} · {when(f.updatedAt)}
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
