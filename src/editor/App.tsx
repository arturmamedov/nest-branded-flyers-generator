import { useEffect, useState } from 'react';
import type { ApiConfig, Hostel } from '../shared/schema';
import { assetUrl } from '../flyer/urls';
import { api } from './api';
import { Editor } from './Editor';
import { createExporter, type FlyerExporter } from './export';
import { mayLeave } from './leaveGuard';
import { Library } from './Library';
import { useHashRoute } from './route';

export function App() {
  // Every move remounts the editor (keyed on `nav`); a move away from unsaved work asks first.
  // The editor's own replaceState after a first save is no move, so it keeps its state.
  const { route, nav } = useHashRoute(mayLeave);
  const [hostels, setHostels] = useState<Hostel[] | null>(null);
  // What this backend can do: which exporter runs, and the photo upload limits.
  const [backend, setBackend] = useState<{ exporter: FlyerExporter; limits: ApiConfig['limits'] } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      {/* The bar every Nests tool shares, with the links to the other tools, comes from
          nestpass.ai (index.html loads it). Until it arrives, or if it can't, the element shows
          the app's own brand (slot="fallback"); the app's links are its default slot.
          It is the library's: the editor is a focus page, with its way back at the top of its
          form (Editor.tsx). When the app can't load, the bar is the way out. */}
      {(route.page === 'library' || error) && (
        <nest-nav tool="flyers">
          <a className="brand" slot="fallback" href="#/">
            <img src={assetUrl('assets/nest-logo-white.png')} alt="" />
            <span>Flyers</span>
          </a>
          <nav aria-label="Flyers">
            <a className={route.page === 'library' ? 'active' : ''} href="#/">
              Library
            </a>
            <a className="btn btn-accent" href="#/new">
              New flyer
            </a>
          </nav>
        </nest-nav>
      )}
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
