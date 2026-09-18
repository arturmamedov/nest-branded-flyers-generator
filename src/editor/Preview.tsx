import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { fitFlyer, type FitReport } from '../flyer/fit';
import { Flyer } from '../flyer/Flyer';
import { ACTIVITY, CANVAS, photoFrame } from '../shared/layout';
import { panCrop } from '../shared/photo';
import type { Crop, FlyerData, Hostel, PhotoInfo } from '../shared/schema';

/* The live preview IS the export renderer: the same <Flyer> at true
   1080×1920, scaled with transform (never CSS zoom, which would change the
   measurements the fit pass relies on). */

interface Props {
  data: FlyerData;
  hostel: Hostel | null;
  photo: PhotoInfo | null;
  showSafeZones: boolean;
  actualSize: boolean;
  onFit: (report: FitReport) => void;
  onCrop: (crop: Crop) => void;
  onDropFile: (file: File) => void;
}

export function Preview({ data, hostel, photo, showSafeZones, actualSize, onFit, onCrop, onDropFile }: Props) {
  const flyerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.3);
  const [dragOver, setDragOver] = useState(false);
  const scale = actualSize ? 1 : fitScale;

  useLayoutEffect(() => {
    const el = stageRef.current!;
    const measure = () => {
      const pad = 48;
      setFitScale(Math.max(0.15, Math.min((el.clientWidth - pad) / CANVAS.width, (el.clientHeight - pad) / CANVAS.height)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const refit = useCallback(() => {
    if (flyerRef.current) onFit(fitFlyer(flyerRef.current));
  }, [onFit]);

  // Re-fit after every content change, and whenever a font subset arrives.
  useLayoutEffect(refit, [data, hostel, refit]);
  useEffect(() => {
    document.fonts.ready.then(refit);
    document.fonts.addEventListener('loadingdone', refit);
    return () => document.fonts.removeEventListener('loadingdone', refit);
  }, [refit]);

  const frame = photoFrame(data.photoMode);
  const frameBox = data.photoMode === 'bleed' ? ACTIVITY.photoBleed : ACTIVITY.photoBand;
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!photo || !frame) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, crop: data.photoCrop };
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
    onCrop(panCrop(data.photoCrop, dir[0] * step, dir[1] * step, photo, frame, false));
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
      <div className="stage-canvas" style={{ width: CANVAS.width * scale, height: CANVAS.height * scale }}>
        <div style={{ width: CANVAS.width, height: CANVAS.height, transform: `scale(${scale})`, transformOrigin: '0 0', position: 'relative' }}>
          <Flyer ref={flyerRef} data={data} hostel={hostel} photo={photo} showSafeZones={showSafeZones} />
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
    </div>
  );
}
