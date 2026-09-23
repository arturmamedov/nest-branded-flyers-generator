import { useEffect, useState } from 'react';
import type { ApiConfig, Hostel } from '../shared/schema';
import { assetUrl } from '../flyer/urls';
import { api } from './api';
import { Editor } from './Editor';
import { createExporter, type FlyerExporter } from './export';
import { Library } from './Library';

export type Route = { page: 'library' } | { page: 'new' } | { page: 'edit'; id: number };

function parseHash(hash: string): Route {
  const edit = /^#\/flyers\/(\d+)$/.exec(hash);
  if (edit) return { page: 'edit', id: Number(edit[1]) };
  if (hash === '#/new') return { page: 'new' };
  return { page: 'library' };
}

export const go = (hash: string) => {
  location.hash = hash;
};

export function App() {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  // Every navigation remounts the editor; the editor's own replaceState after
  // a first save does not fire hashchange, so it keeps its state.
  const [nav, setNav] = useState(0);
  const [hostels, setHostels] = useState<Hostel[] | null>(null);
  // What this backend can do: which exporter runs, and the photo upload limits.
  const [backend, setBackend] = useState<{ exporter: FlyerExporter; limits: ApiConfig['limits'] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(location.hash));
      setNav((n) => n + 1);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    Promise.all([api.hostels(), api.config()]).then(
      ([h, config]) => {
        setHostels(h);
        setBackend({ exporter: createExporter(config), limits: config.limits });
      },
      (e) => setError(String(e.message || e)),
    );
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <img src={assetUrl('assets/nest-logo-white.png')} alt="" />
          <span>Flyers</span>
        </a>
        <nav>
          <a className={route.page === 'library' ? 'active' : ''} href="#/">
            Library
          </a>
          <a className="btn btn-accent" href="#/new" onClick={() => location.hash === '#/new' && setNav((n) => n + 1)}>
            New flyer
          </a>
        </nav>
      </header>
      {error && <div className="banner banner-error">Could not reach the server: {error}</div>}
      {hostels &&
        backend &&
        (route.page === 'library' ? (
          <Library hostels={hostels} />
        ) : (
          <Editor key={nav} id={route.page === 'edit' ? route.id : null} hostels={hostels} exporter={backend.exporter} limits={backend.limits} />
        ))}
    </div>
  );
}
