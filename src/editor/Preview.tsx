import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { fitFlyer, type FitReport } from '../flyer/fit';
import { Flyer } from '../flyer/Flyer';
import { CANVASES, CANVAS_IDS, activityGroups, photoFrame, type CanvasId } from '../shared/layout';
import { clampCrop, panCrop } from '../shared/photo';
import type { Crop, FlyerData, Hostel, PhotoInfo } from '../shared/schema';

/* The live preview IS the export renderer: the same <Flyer> at its canvas's
   true size, scaled with transform (never CSS zoom, which would change the
   measurements the fit pass relies on). */

export type FitCallback = (canvas: CanvasId, report: FitReport) => void;

interface Props {
  data: FlyerData;
  canvas: CanvasId;
  hostel: Hostel | null;
  photo: PhotoInfo | null;
  showSafeZones: boolean;
  actualSize: boolean;
  onFit: FitCallback;
  onCrop: (crop: Crop) => void;
  onDropFile: (file: File) => void;
}

/** Refits whenever a font subset arrives (the copy's glyphs change width) and
    returns refit: the caller refits on content changes, before paint on screen,
    deferred offscreen. */
function useFit(ref: RefObject<HTMLDivElement | null>, canvas: CanvasId, onFit: FitCallback) {
  const refit = useCallback(() => {
    if (ref.current) onFit(canvas, fitFlyer(ref.current));
  }, [ref, canvas, onFit]);
  useEffect(() => {
    document.fonts.ready.then(refit);
    document.fonts.addEventListener('loadingdone', refit);
    return () => document.fonts.removeEventListener('loadingdone', refit);
  }, [refit]);
  return refit;
}

export function Preview({ data, canvas, hostel, photo, showSafeZones, actualSize, onFit, onCrop, onDropFile }: Props) {
  const flyerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const { width: W, height: H } = CANVASES[canvas];
  const pad = 48;
  const fitScale = stage ? Math.max(0.15, Math.min((stage.width - pad) / W, (stage.height - pad) / H)) : 0.3;
  const scale = actualSize ? 1 : fitScale;

  useLayoutEffect(() => {
    const el = stageRef.current!;
    const measure = () => setStage({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The canvas on screen fits before paint, so the preview never shows unfitted copy.
  const refit = useFit(flyerRef, canvas, onFit);
  useLayoutEffect(refit, [data, hostel, refit]);

  const frame = photoFrame(canvas, data.photoMode);
  const frameBox = activityGroups(canvas, data.photoMode).photo!;
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);

  // Moves start from the crop as this frame shows it, so a drag never has a dead zone.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!photo || !frame) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, crop: clampCrop(data.photoCrop, photo, frame) };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !photo || !frame) return;
    const d = drag.current;
    onCrop(panCrop(d.crop, (e.clientX - d.x) / scale, (e.clientY - d.y) / scale, photo, frame));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const NUDGE: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = NUDGE[e.key];
    if (!dir || !photo || !frame) return;
    e.preventDefault();
    const step = e.shiftKey ? 40 : 4;
    onCrop(panCrop(clampCrop(data.photoCrop, photo, frame), dir[0] * step, dir[1] * step, photo, frame, false));
  };

  return (
    <div
      ref={stageRef}
      className={'stage' + (actualSize ? ' stage-actual' : '') + (dragOver ? ' stage-dragover' : '')}
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onDropFile(file);
      }}
    >
      <div className="stage-canvas" style={{ width: W * scale, height: H * scale }}>
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'relative' }}>
          <Flyer ref={flyerRef} data={data} canvas={canvas} hostel={hostel} photo={photo} showSafeZones={showSafeZones} />
          {frame && (
            <div
              className={'photo-handle' + (photo ? ' has-photo' : '')}
              style={{ left: frameBox.left, top: frameBox.top, width: frameBox.width, height: frameBox.height, borderRadius: data.photoMode === 'band' ? 40 : 0 }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
              tabIndex={photo ? 0 : -1}
              aria-label={photo ? 'Photo position: drag, or use the arrow keys' : undefined}
              title={photo ? 'Drag to move the photo · arrow keys nudge' : undefined}
            >
              {!photo && <span>Drop the event photo here — faces near the middle</span>}
            </div>
          )}
        </div>
      </div>
      {CANVAS_IDS.filter((c) => c !== canvas).map((c) => (
        <OffscreenFit key={c} canvas={c} data={data} hostel={hostel} photo={photo} onFit={onFit} />
      ))}
    </div>
  );
}

/** A canvas that is not on screen, fitted all the same so the editor can say
    where copy is cut off before anyone switches to it. The same <Flyer>, so no
    second renderer: laid out (visibility, never display:none) but unseen. It
    lags a keystroke behind (deferred), which keeps typing smooth. */
function OffscreenFit({ canvas, data, hostel, photo, onFit }: { canvas: CanvasId; data: FlyerData; hostel: Hostel | null; photo: PhotoInfo | null; onFit: FitCallback }) {
  const ref = useRef<HTMLDivElement>(null);
  const deferred = useDeferredValue(data);
  // Only what can change a fitted size: a photo drag, a zoom or a nudge must not refit (or
  // re-render) a canvas nobody sees. The same element back lets React skip the subtree.
  const key = fitKey(deferred);
  const fitData = useMemo(() => deferred, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const refit = useFit(ref, canvas, onFit);
  useEffect(refit, [fitData, hostel, refit]);
  const flyer = useMemo(() => <Flyer ref={ref} data={fitData} canvas={canvas} hostel={hostel} photo={photo} />, [fitData, canvas, hostel, photo]);
  return (
    <div aria-hidden="true" style={{ position: 'fixed', left: -20000, top: 0, visibility: 'hidden', pointerEvents: 'none' }}>
      {flyer}
    </div>
  );
}

/** The fields a fitted size depends on (the copy, what the chips print, the photo mode's boxes). */
function fitKey(d: FlyerData): string {
  return JSON.stringify([d.text, d.chips, d.extras, d.photoMode, d.showPill, d.overrides]);
}
