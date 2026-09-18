import { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { FitReport } from '../flyer/fit';
import { Flyer } from '../flyer/Flyer';
import { prepareFlyer } from '../flyer/ready';
import type { FlyerPayload } from '../shared/schema';

/* The export page: one flyer at 1080×1920, nothing else. Headless Chromium
   waits for __FLYER_READY, then screenshots. Tests may inject a payload. */

declare global {
  interface Window {
    __FLYER_READY?: boolean;
    __FLYER_ERROR?: string;
    __FLYER_FIT?: FitReport;
    __FLYER_PAYLOAD?: FlyerPayload;
  }
}

function RenderPage({ payload, safe }: { payload: FlyerPayload; safe: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    prepareFlyer(ref.current!)
      .then((report) => {
        window.__FLYER_FIT = report;
        window.__FLYER_READY = true;
      })
      .catch((e) => (window.__FLYER_ERROR = String(e)));
  }, []);
  return <Flyer ref={ref} data={payload.flyer.data} hostel={payload.hostel} photo={payload.photo} showSafeZones={safe} />;
}

async function main() {
  const params = new URLSearchParams(location.search);
  let payload = window.__FLYER_PAYLOAD;
  if (!payload) {
    const res = await fetch(`/api/flyers/${encodeURIComponent(params.get('id') || '')}`);
    if (!res.ok) throw new Error(`GET flyer ${params.get('id')}: ${res.status}`);
    payload = (await res.json()) as FlyerPayload;
  }
  createRoot(document.getElementById('root')!).render(<RenderPage payload={payload} safe={params.get('safe') === '1'} />);
}

main().catch((e) => (window.__FLYER_ERROR = String(e)));
