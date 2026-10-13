import { useCallback, useEffect, useState } from 'react';
import { aiFor, aiWithRemaining, type AiFeature } from '../shared/ai';
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
  // The AI for this staff member (api/config): off shows nothing of it anywhere. Each feature has its own daily limit,
  // and what is left of it today follows every answer, so the bar and the buttons count down without asking the
  // server again.
  const [ai, setAi] = useState<AiConfig>({ enabled: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.hostels(), api.config()]).then(
      ([h, config]) => {
        setHostels(h);
        setBackend({ exporter: createExporter(config), limits: config.limits });
        // A backend from before the AI answers no `ai` block: off, as aiFor() reads every answer it does not know.
        setAi(config.ai ?? { enabled: false });
      },
      (e) => setError(String(e.message || e)),
    );
  }, []);

  // One feature's count moves, and only that one: a generation, or its limit reached, says nothing of the others.
  const onRemaining = useCallback((feature: AiFeature, remaining: number) => setAi((a) => aiWithRemaining(a, feature, remaining)), []);

  // What is left today of one feature, asked from the server again. A picture read the provider failed answers no
  // count and is one of the day's tries, so the number on its button could be too high. Only that feature's count
  // moves, and if the question fails it stays as it was: the server still refuses at the right moment.
  const recount = useCallback(
    (feature: AiFeature) => {
      api.config().then(
        (config) => {
          const its = aiFor(config.ai ?? { enabled: false }, feature);
          if (its) onRemaining(feature, its.remaining);
        },
        () => {},
      );
    },
    [onRemaining],
  );

  // A site runs the features it names (api/config lists them): the bar's link and the #/ai page are the flyer's,
  // "Write with AI" in the editor is the share text's, and "From a photo" on the #/ai page is the picture read's (its
  // words land in the flyer's idea box, so it shows only where the flyer's page does). Each shows only where its
  // feature runs for this staff member, with its own count.
  const flyerAi = aiFor(ai, 'flyer');
  const shareAi = aiFor(ai, 'share');
  const photoAi = aiFor(ai, 'photo');

  // #/ai without its feature is the library, and its URL says so (a replace: Back never lands on it again).
  const page: Route['page'] = route.page === 'ai' && !flyerAi ? 'library' : route.page;
  const noAiPage = backend !== null && !flyerAi;
  useEffect(() => {
    if (noAiPage && route.page === 'ai') replaceHash('#/ai', '#/');
  }, [noAiPage, route.page]);

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
            {flyerAi && (
              <a className="ai-entry" href="#/ai" aria-label={`Create with AI, ${flyerAi.remaining} left today`}>
                <span aria-hidden="true">✨</span> <span className="ai-wide">Create with </span>AI<span className="ai-wide ai-count"> · {flyerAi.remaining} left</span>
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
          <Library hostels={hostels} exporter={backend.exporter} />
        ) : page === 'ai' && flyerAi ? (
          <AiPage key={nav} hostels={hostels} ai={flyerAi} photo={photoAi} limits={backend.limits} onRemaining={onRemaining} recount={recount} />
        ) : (
          <Editor
            key={nav}
            id={route.page === 'edit' ? route.id : null}
            hostels={hostels}
            exporter={backend.exporter}
            limits={backend.limits}
            ai={shareAi}
            onRemaining={onRemaining}
          />
        ))}
    </div>
  );
}
