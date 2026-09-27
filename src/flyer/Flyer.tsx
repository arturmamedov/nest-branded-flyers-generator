import { Fragment, type CSSProperties, type Ref } from 'react';
import { deriveChips, DEFAULT_CHIP_ORDER } from '../shared/chips';
import { BRIGHT_TEAL, MUTED, PHOTO_PLACEHOLDER, resolveDoodles, type ArtPlacement } from '../shared/defaults';
import { BODY_FONT, HEADLINE_FONT } from '../shared/fonts';
import { CANVASES, artAnchors, photoFrame, placeArt, safeBox, type ArtAnchor, type ArtPoint, type CanvasId, type Rect } from '../shared/layout';
import { coverRect } from '../shared/photo';
import type { FlyerData, Hostel, PhotoInfo } from '../shared/schema';
import './fonts.css';
import { artUrl as art, assetUrl } from './urls';

/* THE renderer. The editor preview and the Playwright export both mount this
   component, so they cannot drift. The markup and styles are transcribed 1:1
   from design/Nest Flyer Story Templates.dc.html — keep them that way.
   Positions come from src/shared/layout.ts, per output canvas, and the art
   from defaults.ts, which record where the team's design pass departs from
   the prototype. */

export const WONKY_PATH =
  'M46 9 C 200 4 380 13 540 7 C 700 2 830 12 914 8 C 944 7 954 26 951 54 C 954 96 949 142 952 164 C 954 186 932 197 902 193 C 690 198 410 189 154 195 C 84 197 9 192 11 166 C 7 122 13 72 9 48 C 7 22 22 10 46 9 Z';

/** The code-drawn wonky frame: one path, non-scaling 5px stroke. */
export function WonkyBox({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <svg
      viewBox="0 0 960 200"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: fill === 'none' ? 'none' : undefined,
      }}
    >
      <path d={WONKY_PATH} fill={fill} stroke={stroke} strokeWidth={5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const HL: CSSProperties = { fontFamily: HEADLINE_FONT };
const BODY: CSSProperties = { fontFamily: BODY_FONT };

function doodleStyle(d: ArtPlacement, anchors: Record<ArtAnchor, ArtPoint>): CSSProperties {
  const t = [d.flipX ? 'scaleX(-1)' : '', d.rot ? `rotate(${d.rot}deg)` : ''].filter(Boolean).join(' ');
  return { position: 'absolute', ...placeArt(d, anchors), transform: t || undefined, opacity: d.opacity };
}

function logoUrl(hostel: Hostel | null): string {
  return assetUrl(hostel?.logoPath || 'assets/nest-logo-teal.png');
}

/** A block's horizontal edges as left/right insets, the way the story has always been written. */
const across = (r: Rect, width: number) => ({ left: r.left, right: width - r.left - r.width });

export interface FlyerProps {
  data: FlyerData;
  /** Which output canvas to draw (src/shared/layout.ts). No default: every caller says. */
  canvas: CanvasId;
  hostel: Hostel | null;
  photo: PhotoInfo | null;
  showSafeZones?: boolean;
  ref?: Ref<HTMLDivElement>;
}

export function Flyer({ data, canvas, hostel, photo, showSafeZones = false, ref }: FlyerProps) {
  const { ink, accent, bg } = data.colors;
  const t = data.text;
  const mode = data.photoMode;
  const { width: W, height: H, activity: A } = CANVASES[canvas];
  const anchors = artAnchors(canvas, mode);
  const chips = deriveChips(data.chips, hostel?.name ?? null, data.overrides.chips?.order ?? DEFAULT_CHIP_ORDER);
  const extras = data.extras.map((e) => e.trim()).filter(Boolean);
  const head = mode === 'none' ? A.headlineNoPhoto : A.headline;
  const frame = photoFrame(canvas, mode);
  const img =
    photo && frame ? (
      <img
        src={assetUrl(photo.url)}
        alt=""
        draggable={false}
        style={{ position: 'absolute', maxWidth: 'none', ...coverRect(photo, frame, data.photoCrop) }}
      />
    ) : null;
  // Behind a zoomed-out photo the flyer ground shows; the beige is only for an empty slot.
  const photoGround = img ? bg : PHOTO_PLACEHOLDER;
  const mark = art('mark-yellow');
  const pillText: CSSProperties = { ...HL, fontWeight: 700, fontSize: 34, letterSpacing: '0.04em', color: '#ffffff', lineHeight: 1 };

  return (
    <div
      ref={ref}
      data-flyer=""
      data-canvas={canvas}
      style={{
        position: 'relative',
        width: W,
        height: H,
        overflow: 'hidden',
        background: bg,
        color: ink,
        ...BODY,
        // Isolate from whatever page hosts the flyer: preview must equal export.
        fontSize: 16,
        fontWeight: 400,
        fontStyle: 'normal',
        lineHeight: 'normal',
        letterSpacing: 'normal',
        textTransform: 'none',
        textAlign: 'left',
        whiteSpace: 'normal',
        boxSizing: 'content-box',
      }}
    >
      {resolveDoodles(data.doodles).map((d, i) => (
        <img key={i} data-art="" src={art(d.slug)} alt="" style={doodleStyle(d, anchors)} />
      ))}

      <div
        data-group="eyebrow"
        style={{ position: 'absolute', ...across(A.eyebrow, W), top: A.eyebrow.top, height: A.eyebrow.height, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: '0 0 auto' }}>
          <img src={art('icon-calendar')} alt="" style={{ height: 62, width: 'auto' }} />
          {t.eyebrow && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ ...HL, fontWeight: 700, fontSize: 36, letterSpacing: '0.1em', color: ink, lineHeight: 1, whiteSpace: 'nowrap' }}>{t.eyebrow}</div>
              <div style={{ height: 16, background: `url(${art('rule-teal-wide')}) left center/100% 100% no-repeat` }} />
            </div>
          )}
        </div>
        <img src={logoUrl(hostel)} alt="Nests Hostels" style={{ height: 56, width: 'auto', flex: '0 0 auto', marginTop: 6 }} />
      </div>

      <div data-group="headline" data-fit-box="1" style={{ position: 'absolute', ...across(head, W), top: head.top, height: head.height, overflow: 'hidden' }}>
        {t.headline1 && (
          <div data-fit="92" data-fit-min="0.5" style={{ ...HL, fontWeight: 800, fontSize: 92, lineHeight: 1.04, color: ink, whiteSpace: 'nowrap' }}>{t.headline1}</div>
        )}
        {t.headline2 && (
          <div data-fit="124" data-fit-min="0.5" style={{ ...HL, fontWeight: 800, fontSize: 124, lineHeight: 1, color: accent, whiteSpace: 'nowrap' }}>{t.headline2}</div>
        )}
        {t.headlineEs && (
          <div data-fit="36" data-fit-min="0.8" style={{ ...BODY, fontWeight: 600, fontSize: 36, lineHeight: 1.26, color: MUTED, marginTop: 16 }}>{t.headlineEs}</div>
        )}
      </div>

      {mode === 'bleed' && (
        <div data-group="photo" style={{ position: 'absolute', ...across(A.photoBleed, W), top: A.photoBleed.top, height: A.photoBleed.height, overflow: 'hidden', background: photoGround }}>
          {img}
        </div>
      )}
      {mode === 'band' && (
        <div data-group="photo" style={{ position: 'absolute', ...across(A.photoBand, W), top: A.photoBand.top, height: A.photoBand.height }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 40, overflow: 'hidden', background: photoGround }}>{img}</div>
          <WonkyBox fill="none" stroke={ink} />
        </div>
      )}
      {mode === 'none' && (
        <div
          data-group="photo"
          style={{ position: 'absolute', ...across(A.noPhotoRule, W), top: A.noPhotoRule.top, height: A.noPhotoRule.height, background: `url(${art('rule-teal-wide')}) center/100% 100% no-repeat` }}
        />
      )}

      {chips.length > 0 && (
        <div
          data-group="chips"
          style={{ position: 'absolute', ...across(A.chips, W), top: A.chips.top, height: A.chips.height, display: 'grid', gridTemplateColumns: `repeat(${chips.length},minmax(0,1fr))`, gap: A.chipGap }}
        >
          {chips.map((chip) => {
            const when = chip.key === 'when';
            const icon = chip.key === 'when' ? art('icon-calendar') : chip.key === 'where' ? art('icon-pin') : null;
            return (
              <div key={chip.key} data-fit-box="1" style={{ position: 'relative', height: A.chips.height, overflow: 'hidden' }}>
                <WonkyBox fill="#ffffff" stroke={ink} />
                <div style={{ position: 'relative', zIndex: 1, padding: '24px 26px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36 }}>
                    {icon && <img src={icon} alt="" style={{ height: 32, width: 'auto' }} />}
                    {!icon && <span style={{ ...HL, fontWeight: 800, fontSize: 36, lineHeight: 1, color: accent }}>€</span>}
                    <span style={{ ...BODY, fontWeight: 700, fontSize: 26, letterSpacing: '0.13em', textTransform: 'uppercase', color: accent }}>{chip.label}</span>
                  </div>
                  {when ? (
                    <div data-fit="46" data-fit-min="0.6" style={{ ...HL, fontWeight: 700, fontSize: 46, lineHeight: 1.3, color: ink }}>
                      <span
                        style={{
                          backgroundImage: `url(${mark})`,
                          backgroundSize: '100% 100%',
                          backgroundRepeat: 'no-repeat',
                          padding: '2px 10px 4px',
                          marginLeft: -8,
                          WebkitBoxDecorationBreak: 'clone',
                          boxDecorationBreak: 'clone',
                        }}
                      >
                        {chip.big}
                      </span>
                    </div>
                  ) : (
                    <div data-fit="46" data-fit-min="0.6" style={{ ...HL, fontWeight: 700, fontSize: 46, lineHeight: 1.1, color: ink }}>{chip.big}</div>
                  )}
                  {chip.sub && when && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img src={art('icon-clock')} alt="" style={{ height: 36, width: 'auto', flex: '0 0 auto' }} />
                      <div data-fit="40" data-fit-min="0.7" style={{ ...HL, fontWeight: 700, fontSize: 40, lineHeight: 1.1, color: ink }}>{chip.sub}</div>
                    </div>
                  )}
                  {chip.sub && !when && (
                    <div data-fit="32" data-fit-min="0.7" style={{ ...BODY, fontWeight: 600, fontSize: 32, lineHeight: 1.22, color: ink }}>{chip.sub}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {extras.length > 0 && (
        <div
          data-group="extras"
          data-fit="30"
          data-fit-gap="16"
          data-fit-min="0.8"
          style={{ position: 'absolute', ...across(A.extras, W), top: A.extras.top, height: A.extras.height, display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 16, ...HL, fontWeight: 700, fontSize: 30, letterSpacing: '0.02em', textTransform: 'uppercase', color: ink, whiteSpace: 'nowrap', overflow: 'hidden' }}
        >
          {extras.map((text, i) => (
            <Fragment key={i}>
              {i > 0 && <span style={{ color: accent }}>·</span>}
              <span>{text}</span>
            </Fragment>
          ))}
        </div>
      )}

      {(t.askEn || t.askEs) && (
        <div data-group="ask" style={{ position: 'absolute', ...across(A.ask, W), top: A.ask.top, height: A.ask.height }}>
          <div style={{ display: 'inline-block', maxWidth: 760 }}>
            {t.askEn && (
              <div data-fit="62" data-fit-min="0.66" style={{ ...HL, fontWeight: 800, fontSize: 62, lineHeight: 1.08, color: ink, whiteSpace: 'nowrap' }}>{t.askEn}</div>
            )}
            <div style={{ height: 22, marginTop: 2, background: `url(${art('rule-teal-ask')}) left center/100% 100% no-repeat` }} />
            {t.askEs && (
              <div data-fit="34" data-fit-min="0.8" style={{ ...BODY, fontWeight: 600, fontSize: 34, lineHeight: 1.2, color: MUTED, marginTop: 10, whiteSpace: 'nowrap' }}>{t.askEs}</div>
            )}
          </div>
          <img data-art="" src={art('doodle-pencil')} alt="" style={{ position: 'absolute', right: 20, top: 6, width: 104, transform: 'rotate(-4deg)' }} />
        </div>
      )}

      {data.showPill && (t.handle || t.tag) && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: A.pill.top, display: 'flex', justifyContent: 'center' }}>
          <div
            data-group="pill"
            style={{ display: 'flex', alignItems: 'center', gap: 18, background: accent, borderRadius: 20, padding: '17px 38px 19px', transform: 'rotate(-0.6deg)' }}
          >
            {t.handle && <span style={pillText}>{t.handle}</span>}
            {t.handle && t.tag && <span style={{ width: 14, height: 14, borderRadius: '50%', background: BRIGHT_TEAL }} />}
            {t.tag && <span style={pillText}>{t.tag}</span>}
          </div>
        </div>
      )}

      {showSafeZones && <SafeZoneOverlay canvas={canvas} />}
    </div>
  );
}

/** Editor chrome, never exported. Orange here is deliberate: it is not flyer ink. */
function SafeZoneOverlay({ canvas }: { canvas: CanvasId }) {
  const { safe } = CANVASES[canvas];
  const box = safeBox(canvas);
  const common: CSSProperties = { position: 'absolute', pointerEvents: 'none' };
  return (
    <>
      <div style={{ ...common, left: 0, right: 0, top: 0, height: safe.top, background: 'rgba(234,88,12,0.14)', borderBottom: '2px dashed rgba(234,88,12,0.75)' }} />
      <div style={{ ...common, left: 0, right: 0, bottom: 0, height: safe.bottom, background: 'rgba(234,88,12,0.14)', borderTop: '2px dashed rgba(234,88,12,0.75)' }} />
      <div style={{ ...common, left: 0, top: safe.top, bottom: safe.bottom, width: safe.side, background: 'rgba(234,88,12,0.1)', borderRight: '2px dashed rgba(234,88,12,0.6)' }} />
      <div style={{ ...common, right: 0, top: safe.top, bottom: safe.bottom, width: safe.side, background: 'rgba(234,88,12,0.1)', borderLeft: '2px dashed rgba(234,88,12,0.6)' }} />
      <div style={{ ...common, left: box.left + 8, top: box.top + 8, ...BODY, fontWeight: 700, fontSize: 22, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#B03A06' }}>
        {`Safe zone · ${box.width} × ${box.height}`}
      </div>
    </>
  );
}
