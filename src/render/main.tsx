import { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { FitReport } from '../flyer/fit';
import { Flyer } from '../flyer/Flyer';
import { prepareFlyer } from '../flyer/ready';
import { apiUrl } from '../flyer/urls';
import { isCanvasId, type CanvasId } from '../shared/layout';
import type { FlyerPayload } from '../shared/schema';

/* The export page: one flyer on one canvas (?canvas=, the story when absent),
   nothing else. Headless Chromium waits for __FLYER_READY, then screenshots.
   Tests may inject a payload. */

declare global {
  interface Window {
    __FLYER_READY?: boolean;
    __FLYER_ERROR?: string;
    __FLYER_FIT?: FitReport;
    __FLYER_PAYLOAD?: FlyerPayload;
  }
}

function RenderPage({ payload, canvas, safe }: { payload: FlyerPayload; canvas: CanvasId; safe: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    prepareFlyer(ref.current!)
      .then((report) => {
        window.__FLYER_FIT = report;
        window.__FLYER_READY = true;
      })
      .catch((e) => (window.__FLYER_ERROR = String(e)));
  }, []);
  return <Flyer ref={ref} data={payload.flyer.data} canvas={canvas} hostel={payload.hostel} photo={payload.photo} showSafeZones={safe} />;
}

async function main() {
  const params = new URLSearchParams(location.search);
  // Never fall back silently: a story drawn for a WhatsApp export would still fill the screenshot.
  const canvas = params.get('canvas') ?? 'story';
  if (!isCanvasId(canvas)) throw new Error(`Unknown canvas "${canvas}"`);
  let payload = window.__FLYER_PAYLOAD;
  if (!payload) {
    const res = await fetch(apiUrl(`flyers/${encodeURIComponent(params.get('id') || '')}`));
    if (!res.ok) throw new Error(`GET flyer ${params.get('id')}: ${res.status}`);
    payload = (await res.json()) as FlyerPayload;
  }
  createRoot(document.getElementById('root')!).render(<RenderPage payload={payload} canvas={canvas} safe={params.get('safe') === '1'} />);
}

main().catch((e) => (window.__FLYER_ERROR = String(e)));
