import { useCallback, useEffect, useState } from 'react';
import type { AiConfig, ApiConfig, Hostel } from '../shared/schema';
import { assetUrl } from '../flyer/urls';
import { AiPage } from './AiPage';
import { api } from './api';
import { Editor } from './Editor';
import { createExporter, type FlyerExporter } from './export';
import { mayLeave } from './leaveGuard';
import { Library } from './Library';
import { replaceHash, useHashRoute, type Route } from './route';

export function App() {
  // Every move remounts the editor (keyed on `nav`); a move away from unsaved work asks first.
  // The editor's own replaceState after a first save is no move, so it keeps its state.
  const { route, nav } = useHashRoute(mayLeave);
  const [hostels, setHostels] = useState<Hostel[] | null>(null);
  // What this backend can do: which exporter runs, and the photo upload limits.
  const [backend, setBackend] = useState<{ exporter: FlyerExporter; limits: ApiConfig['limits'] } | null>(null);
  // The AI for this staff member (api/config): off shows nothing of it anywhere. What is left today follows every
  // answer, so the bar and the buttons count down without asking the server again.
  const [ai, setAi] = useState<AiConfig>({ enabled: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.hostels(), api.config()]).then(
      ([h, config]) => {
        setHostels(h);
        setBackend({ exporter: createExporter(config), limits: config.limits });
        setAi(config.ai);
      },
      (e) => setError(String(e.message || e)),
    );
  }, []);

  const onRemaining = useCallback((remaining: number) => setAi((a) => (a.enabled ? { ...a, remaining } : a)), []);

  // #/ai with the AI off is the library, and its URL says so (a replace: Back never lands on it again).
  const page: Route['page'] = route.page === 'ai' && !ai.enabled ? 'library' : route.page;
  const aiOff = backend !== null && !ai.enabled;
  useEffect(() => {
    if (aiOff && route.page === 'ai') replaceHash('#/ai', '#/');
  }, [aiOff, route.page]);

  return (
    <div className="app">
      {/* The bar every Nests tool shares, with the links to the other tools, comes from
          nestpass.ai (index.html loads it). Until it arrives, or if it can't, the element shows
          the app's own brand (slot="fallback"); the app's links are its default slot.
          It is the library's: the editor and the AI page are focus pages, with their way back at
          the top of their form (panel.tsx). When the app can't load, the bar is the way out. */}
      {(page === 'library' || error) && (
        <nest-nav tool="flyers">
          <a className="brand" slot="fallback" href="#/">
            <img src={assetUrl('assets/nest-logo-white.png')} alt="" />
            <span>Flyers</span>
          </a>
          <nav aria-label="Flyers">
            <a className={page === 'library' ? 'active' : ''} href="#/">
              Library
            </a>
            {/* Short on a phone (✨ AI): the shared bar leaves its links little room there (the nestpass-tools contract). */}
            {ai.enabled && (
              <a className="ai-entry" href="#/ai" aria-label={`Create with AI, ${ai.remaining} left today`}>
                <span aria-hidden="true">✨</span> <span className="ai-wide">Create with </span>AI<span className="ai-wide ai-count"> · {ai.remaining} left</span>
              </a>
            )}
            <a className="btn btn-accent" href="#/new">
              New flyer
            </a>
          </nav>
        </nest-nav>
      )}
      {error && <div className="banner banner-error">Could not reach the server: {error}</div>}
      {hostels &&
        backend &&
        (page === 'library' ? (
          <Library hostels={hostels} />
        ) : page === 'ai' && ai.enabled ? (
          <AiPage key={nav} hostels={hostels} ai={ai} onRemaining={onRemaining} />
        ) : (
          <Editor
            key={nav}
            id={route.page === 'edit' ? route.id : null}
            hostels={hostels}
            exporter={backend.exporter}
            limits={backend.limits}
            ai={ai}
            onRemaining={onRemaining}
          />
        ))}
    </div>
  );
}
