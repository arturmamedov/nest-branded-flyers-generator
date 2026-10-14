import { Fragment, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { deriveChips, DEFAULT_CHIP_ORDER } from '../shared/chips';
import { marksFor } from '../shared/defaults';
import { printedExtras } from '../shared/extras';
import { BODY_FONT } from '../shared/fonts';
import { ASK_MAX_WIDTH, CANVASES, artAnchors, bodyOf, boxesOf, photoFrame, pillBox, placeArt, safeBox, type ArtAnchor, type ArtPoint, type CanvasId, type Rect, type WeekBoxes } from '../shared/layout';
import { lookOf, type ArtPlacement, type LineType, type Look, type Palette } from '../shared/looks';
import { coverRect } from '../shared/photo';
import type { FlyerData, FlyerText, Hostel, PhotoInfo } from '../shared/schema';
import { printedRows, type PrintedRow } from '../shared/week';
import './fonts.css';
import { artUrl as art, assetUrl } from './urls';

/* THE renderer. The editor preview and the Playwright export both mount this
   component, so they cannot drift. The markup and styles are transcribed 1:1
   from design/Nest Flyer Story Templates.dc.html — keep them that way; the
   week row departs from it in three places, each explained where it happens
   (WeekRow). Positions come from src/shared/layout.ts, per output canvas, and
   the art from defaults.ts, which record where the team's design pass departs
   from the prototype. */

/** The look's frame round a box: one path stretched to the box, its stroke never scaled with it. */
export function WonkyBox({ frame, fill, stroke }: { frame: Look['frame']; fill: string; stroke: string }) {
  return (
    <svg
      data-deco="frame"
      viewBox={frame.viewBox}
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
      <path d={frame.path} fill={fill} stroke={stroke} strokeWidth={frame.stroke} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A line of copy as its look sets it, in the look's colours. */
function typeStyle(line: LineType, paint: Palette): CSSProperties {
  return {
    fontFamily: line.font,
    fontWeight: line.weight,
    fontSize: line.size,
    lineHeight: line.lineHeight,
    letterSpacing: line.spacing,
    textTransform: line.upper ? 'uppercase' : undefined,
    color: paint[line.ink],
  };
}

/** A fitted line's start and floor, for fit.ts: its size is where the fit starts. */
const fitOf = (line: LineType) => ({ 'data-fit': String(line.size), 'data-fit-min': String(line.floor) });

type Lines = Look['type'];

/** How a piece is turned and flipped about its own centre, and how solid it is: the same wherever it hangs. */
function doodleLook(d: ArtPlacement): CSSProperties {
  const t = [d.flipX ? 'scaleX(-1)' : '', d.rot ? `rotate(${d.rot}deg)` : ''].filter(Boolean).join(' ');
  return { position: 'absolute', transform: t || undefined, opacity: d.opacity };
}

function doodleStyle(d: ArtPlacement, anchors: Record<ArtAnchor, ArtPoint>): CSSProperties {
  return { ...doodleLook(d), ...placeArt(d, anchors) };
}

/** A piece that hangs from the end of the block it is drawn with: the pill (pillEnd), or the ask's copy (askEnd). Its
    offsets are from that block's right end and top. The block is as wide as its copy, known only once the letters are
    fitted, so the browser places the piece: nothing is measured, and the art follows the copy as it grows (Artur,
    2026-10-12). At the widest pill its ink is still on the canvas (shared.test.ts). */
function followStyle(d: ArtPlacement): CSSProperties {
  return { ...doodleLook(d), left: `calc(100% + ${d.x}px)`, top: d.y, width: d.w };
}

/** A mark at the eyebrow's right: 56 px tall, the Nests wordmark's size. A long eyebrow leaves the marks less room than
    they need (18 of the widest letters): they shrink in their row, their art contained, rather than leave the box. */
const MARK: CSSProperties = { height: 56, width: 'auto', flex: '0 1 auto', minWidth: 0, objectFit: 'contain', marginTop: 6 };

/** The eyebrow's marks, as the setting in defaults.ts asks: the Nests wordmark, the hostel's badge, or the badge beside
    the wordmark. A badge that fails to load drops out, so an export never shows a broken image; ready.ts waits for
    the wordmark that may then come in its place. */
function Marks({ hostel, wordmark }: { hostel: Hostel | null; wordmark: string }) {
  const badge = hostel?.logoPath ? assetUrl(hostel.logoPath) : null;
  const [failed, setFailed] = useState<string | null>(null);
  const marks = marksFor(badge !== null && failed !== badge).map((m) =>
    m === 'badge' ? (
      <img key="badge" data-logo="hostel" src={badge!} alt={hostel!.name} onError={() => setFailed(badge)} style={{ ...MARK, width: 56 }} />
    ) : (
      <img key="nests" data-logo="nests" src={assetUrl(wordmark)} alt="Nests Hostels" style={MARK} />
    ),
  );
  // One mark sits in the eyebrow row where the wordmark always has; two share a row of their own, 20 px apart.
  return marks.length === 1 ? marks[0] : <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flex: '0 1 auto', minWidth: 0 }}>{marks}</div>;
}

/** A block's horizontal edges as left/right insets, the way the story has always been written. */
const across = (r: Rect, width: number) => ({ left: r.left, right: width - r.left - r.width });

/** The headline's three lines: the Activity headline, and the week's title in its own box. */
function Headline({ group, box, W, t, type, paint }: { group: 'headline' | 'title'; box: Rect; W: number; t: FlyerText; type: Lines; paint: Palette }) {
  return (
    <div data-group={group} data-fit-box="1" style={{ position: 'absolute', ...across(box, W), top: box.top, height: box.height, overflow: 'hidden' }}>
      {t.headline1 && (
        <div {...fitOf(type.headline1)} style={{ ...typeStyle(type.headline1, paint), whiteSpace: 'nowrap' }}>{t.headline1}</div>
      )}
      {t.headline2 && (
        <div {...fitOf(type.headline2)} style={{ ...typeStyle(type.headline2, paint), whiteSpace: 'nowrap' }}>{t.headline2}</div>
      )}
      {t.headlineEs && (
        <div {...fitOf(type.spanish)} style={{ ...typeStyle(type.spanish, paint), marginTop: 16 }}>{t.headlineEs}</div>
      )}
    </div>
  );
}

/** Copy on the highlighter's stroke, the look's file: the WHEN chip's big line, and a week row's day. */
function Highlight({ file, children }: { file: string; children: ReactNode }) {
  return (
    <span
      data-deco="highlighter"
      style={{
        backgroundImage: `url(${art(file)})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        padding: '2px 10px 4px',
        marginLeft: -8,
        WebkitBoxDecorationBreak: 'clone',
        boxDecorationBreak: 'clone',
      }}
    >
      {children}
    </span>
  );
}

/** How far inside its column the pill's width is held. The pill is tilted -0.6°, which lifts a corner of one as wide as
    its column by 0.36 px past the safe edge; one pixel less keeps the tilted pill inside it, the zone being a hard limit. */
const PILL_TILT_ROOM = 1;

/** A week row's fixed day column (the prototype's), and the cap on its right-hand time and price. */
const DAY_WIDTH = 250;
/** The day's fit box, about three lines at 34 px. The highlighter's stroke reaches past its line boxes, and the height
    pass measures it, so a third line already shrinks a little (to 30.6 px) and keeps the stroke inside the row's frame;
    one or two lines keep 34 px. Centred in a 122 px row, with 122 − 114 even, so they land on the same pixels as
    before the box. */
const DAY_BOX = 114;

/** One row of the This week template (.dc.html's isWeek block). Every cell collapses when it has
    nothing to print: an empty highlighter or a lone clock would print as a mark with no copy. */
function WeekRow({ slot, row, height, type, inline, frame, paint }: { slot: number; row: PrintedRow; height: number; type: Lines; inline: Look['inline']; frame: Look['frame']; paint: Palette }) {
  return (
    <div data-row={slot} style={{ position: 'relative', height }}>
      <WonkyBox frame={frame} fill={paint.surface} stroke={paint.ink} />
      <div style={{ position: 'relative', zIndex: 1, height: '100%', boxSizing: 'border-box', padding: '0 34px', display: 'flex', alignItems: 'center', gap: 26 }}>
        {row.day && (
          /* The day wraps too, in its own box (a departure): a day too tall for it shrinks through the height pass
             instead of spilling out of the row, and one still too tall reaches the editor's cut-off note. The box
             doesn't clip, since the highlighter reaches 8 px left of the cell, and the cell keeps the column's width,
             so the width pass still sees a word too long for it. */
          <div data-fit-box="day" style={{ flex: `0 0 ${DAY_WIDTH}px`, height: DAY_BOX, display: 'flex', alignItems: 'center' }}>
            <div data-cell="day" {...fitOf(type.weekDay)} style={{ flex: `0 0 ${DAY_WIDTH}px`, ...typeStyle(type.weekDay, paint) }}>
              <Highlight file={inline.highlighter}>{row.day}</Highlight>
            </div>
          </div>
        )}
        {/* The name wraps, in its own 96 px box (the prototype's): two lines fit, a third shrinks through the height pass (§2). */}
        <div data-fit-box="name" style={{ flex: '1 1 auto', minWidth: 0, height: 96, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
          {row.name && (
            /* minWidth 0 on the name itself (a departure): a flex item otherwise grows to its longest word, so a
               word too long for the box would be clipped by it with no width pass and no cut-off warning. */
            <div data-cell="name" {...fitOf(type.weekName)} style={{ ...typeStyle(type.weekName, paint), textWrap: 'pretty', minWidth: 0 }}>
              {row.name}
            </div>
          )}
        </div>
        {(row.time || row.cost.length > 0) && (
          /* The time and price, capped at the day's width (a departure): sized to their copy, as the
             prototype has them, a long time or price squeezed the name to nothing and no pass could
             shrink them. Capped, each line is the one that overflows, so the width pass shrinks it to
             its floor; past that the column clips it (§5: "it stops at the floor and the box clips"),
             sideways only, so no glyph loses its top, and the editor says it is cut off. */
          <div data-cell="right" style={{ flex: '0 0 auto', maxWidth: DAY_WIDTH, overflowX: 'clip', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            {row.time && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
                <img data-deco="clock" src={art(inline.clock)} alt="" style={{ height: 30, width: 'auto', flex: '0 0 auto' }} />
                <div data-cell="time" {...fitOf(type.weekTime)} style={{ ...typeStyle(type.weekTime, paint), whiteSpace: 'nowrap', minWidth: 0 }}>
                  {row.time}
                </div>
              </div>
            )}
            {/* A price with a · takes two lines, as the COST chip's big and small line (the owner's call, 2026-09-29). */}
            {row.cost.map((line, i) => (
              <div key={i} data-cell="cost" {...fitOf(type.weekPrice)} style={{ ...typeStyle(type.weekPrice, paint), whiteSpace: 'nowrap', maxWidth: '100%' }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The week's rows, top-aligned in the five-row box (the owner's call, 2026-09-29). */
function WeekRows({ rows, boxes, W, type, inline, frame, paint }: { rows: PrintedRow[]; boxes: WeekBoxes; W: number; type: Lines; inline: Look['inline']; frame: Look['frame']; paint: Palette }) {
  if (!rows.length) return null;
  const box = boxes.rows;
  return (
    <div data-group="rows" style={{ position: 'absolute', ...across(box, W), top: box.top, height: box.height, display: 'flex', flexDirection: 'column', gap: boxes.rowGap }}>
      {rows.map((row, slot) => (
        <WeekRow key={slot} slot={slot} row={row} height={boxes.rowHeight} type={type} inline={inline} frame={frame} paint={paint} />
      ))}
    </div>
  );
}

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
  const look = lookOf(data);
  const paint = look.palette(data);
  const type = look.type;
  const t = data.text;
  const mode = data.photoMode;
  // A week flyer keeps its photo mode and photo for switching back, and draws neither.
  const body = bodyOf(data);
  const { width: W, height: H } = CANVASES[canvas];
  // The boxes the flyer's look draws in.
  const geometry = look.geometry;
  const { activity: A, week: WK } = boxesOf(canvas, geometry);
  const anchors = artAnchors(canvas, body, geometry);
  const chips = deriveChips(data.chips, hostel?.name ?? null, data.overrides.chips?.order ?? DEFAULT_CHIP_ORDER);
  const extras = printedExtras(data.extras);
  const head = mode === 'none' ? A.headlineNoPhoto : A.headline;
  const frame = photoFrame(canvas, body, geometry);
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
  const photoGround = img ? paint.ground : paint.placeholder;
  const pillPrints = data.showPill && !!(t.handle || t.tag);
  // The art that hangs from the pill's end is drawn with the pill, and only with it: a flyer that prints no pill
  // prints no spark off the end of nothing (Artur, 2026-10-13; it was kept where the default pill would end).
  const pieces = look.art(data);
  const pillArt = pieces.filter((d) => d.anchor === 'pillEnd');
  // The art at the end of the ask's copy is drawn with the ask, and only with it (the hand-drawn look's pencil).
  const askArt = pieces.filter((d) => d.anchor === 'askEnd');

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
        background: paint.ground,
        color: paint.ink,
        fontFamily: look.body,
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
      {pieces.map((d, i) => (pillArt.includes(d) || askArt.includes(d) ? null : <img key={i} data-art="" data-anchor={d.anchor ?? 'canvas'} src={art(d.slug)} alt="" style={doodleStyle(d, anchors)} />))}

      <div
        data-group="eyebrow"
        style={{ position: 'absolute', ...across(A.eyebrow, W), top: A.eyebrow.top, height: A.eyebrow.height, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: '0 0 auto' }}>
          <img data-deco="icon" src={art(look.inline.eyebrowIcon)} alt="" style={{ height: 62, width: 'auto' }} />
          {t.eyebrow && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ ...typeStyle(type.eyebrow, paint), whiteSpace: 'nowrap' }}>{t.eyebrow}</div>
              <div data-deco="rule" style={{ height: 16, background: `url(${art(look.inline.eyebrowRule)}) left center/100% 100% no-repeat` }} />
            </div>
          )}
        </div>
        <Marks hostel={hostel} wordmark={look.wordmark} />
      </div>

      {body === 'week' ? (
        <>
          <Headline group="title" box={WK.title} W={W} t={t} type={type} paint={paint} />
          <WeekRows rows={printedRows(data.week)} boxes={WK} W={W} type={type} inline={look.inline} frame={look.frame} paint={paint} />
        </>
      ) : (
        <>
          <Headline group="headline" box={head} W={W} t={t} type={type} paint={paint} />

          {mode === 'bleed' && (
            <div data-group="photo" style={{ position: 'absolute', ...across(A.photoBleed, W), top: A.photoBleed.top, height: A.photoBleed.height, overflow: 'hidden', background: photoGround }}>
              {img}
            </div>
          )}
          {mode === 'band' && (
            <div data-group="photo" style={{ position: 'absolute', ...across(A.photoBand, W), top: A.photoBand.top, height: A.photoBand.height }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: look.frame.photoRadius, overflow: 'hidden', background: photoGround }}>{img}</div>
              <WonkyBox frame={look.frame} fill="none" stroke={paint.ink} />
            </div>
          )}
          {mode === 'none' && (
            <div
              data-group="photo"
              data-deco="rule"
              style={{ position: 'absolute', ...across(A.noPhotoRule, W), top: A.noPhotoRule.top, height: A.noPhotoRule.height, background: `url(${art(look.inline.photoRule)}) center/100% 100% no-repeat` }}
            />
          )}

          {chips.length > 0 && (
            <div
              data-group="chips"
              style={{ position: 'absolute', ...across(A.chips, W), top: A.chips.top, height: A.chips.height, display: 'grid', gridTemplateColumns: `repeat(${chips.length},minmax(0,1fr))`, gap: A.chipGap }}
            >
              {chips.map((chip) => {
                const when = chip.key === 'when';
                const icon = chip.key === 'when' ? art(look.inline.whenIcon) : chip.key === 'where' ? art(look.inline.whereIcon) : null;
                return (
                  <div key={chip.key} data-chip={chip.key} data-fit-box="1" style={{ position: 'relative', height: A.chips.height, overflow: 'hidden' }}>
                    <WonkyBox frame={look.frame} fill={paint.surface} stroke={paint.ink} />
                    <div style={{ position: 'relative', zIndex: 1, padding: '24px 26px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36 }}>
                        {icon && <img data-deco="icon" src={icon} alt="" style={{ height: 32, width: 'auto' }} />}
                        {!icon && <span data-deco="icon" style={typeStyle(type.costGlyph, paint)}>€</span>}
                        <span style={typeStyle(type.chipLabel, paint)}>{chip.label}</span>
                      </div>
                      {when ? (
                        <div {...fitOf(type.chipBigMarked)} style={typeStyle(type.chipBigMarked, paint)}>
                          <Highlight file={look.inline.highlighter}>{chip.big}</Highlight>
                        </div>
                      ) : (
                        <div {...fitOf(type.chipBig)} style={typeStyle(type.chipBig, paint)}>{chip.big}</div>
                      )}
                      {chip.sub && when && (
                        /* The time is one line that shrinks, as a week row's is: left to wrap, a browser could break a
                           range after its hyphen ("09:15-" over "14:00") and the chip clipped the second line. */
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <img data-deco="clock" src={art(look.inline.clock)} alt="" style={{ height: 36, width: 'auto', flex: '0 0 auto' }} />
                          <div {...fitOf(type.chipTime)} style={{ ...typeStyle(type.chipTime, paint), whiteSpace: 'nowrap', minWidth: 0 }}>{chip.sub}</div>
                        </div>
                      )}
                      {chip.sub && !when && (
                        <div {...fitOf(type.chipSmall)} style={typeStyle(type.chipSmall, paint)}>{chip.sub}</div>
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
              {...fitOf(type.extras)}
              data-fit-gap={String(type.extras.gap)}
              style={{ position: 'absolute', ...across(A.extras, W), top: A.extras.top, height: A.extras.height, display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: type.extras.gap, ...typeStyle(type.extras, paint), whiteSpace: 'nowrap', overflow: 'hidden' }}
            >
              {extras.map((text, i) => (
                <Fragment key={i}>
                  {i > 0 && <span style={{ color: paint.accent }}>·</span>}
                  <span>{text}</span>
                </Fragment>
              ))}
            </div>
          )}
        </>
      )}

      {(t.askEn || t.askEs) && (
        <div data-group="ask" style={{ position: 'absolute', ...across(A.ask, W), top: A.ask.top, height: A.ask.height }}>
          {/* The block is as wide as the longer of its two lines, and the underline with it. */}
          <div style={{ position: 'relative', display: 'inline-block', maxWidth: ASK_MAX_WIDTH }}>
            {t.askEn && (
              <div {...fitOf(type.askEn)} style={{ ...typeStyle(type.askEn, paint), whiteSpace: 'nowrap' }}>{t.askEn}</div>
            )}
            <div data-deco="rule" style={{ height: 22, marginTop: 2, background: `url(${art(look.inline.askRule)}) left center/100% 100% no-repeat` }} />
            {t.askEs && (
              <div {...fitOf(type.askEs)} style={{ ...typeStyle(type.askEs, paint), marginTop: 10, whiteSpace: 'nowrap' }}>{t.askEs}</div>
            )}
            {/* The art at the end of the copy hangs from the block's end, not the English line's: the pencil is taller
                than that line, and under a short one it would lie on a longer Spanish line. It is a child of the block
                and of neither line, so it takes no room from their fit. */}
            {askArt.map((d, i) => (
              <img key={i} data-art="" data-anchor="askEnd" src={art(d.slug)} alt="" style={followStyle(d)} />
            ))}
          </div>
        </div>
      )}

      {pillPrints && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: A.pill.top, display: 'flex', justifyContent: 'center' }}>
          {/* The pill's own box, before its tilt: what the art off its end hangs from. The art comes first, so the
              pill is drawn over it, as it was over the art on the flyer. */}
          <div style={{ position: 'relative', display: 'flex' }}>
            {pillArt.map((d, i) => (
              <img key={i} data-art="" data-anchor="pillEnd" src={art(d.slug)} alt="" style={followStyle(d)} />
            ))}
            {/* The pill is as wide as its copy up to its column, and the handle and the tag are one fitted line: a pill
                that fits is drawn as it always was, a wider one shrinks its letters (the editor's UX round, Part 4).
                The padding, the gaps and the dot keep their size. Past the floor the line is cut at the pill's edge,
                sideways only (as a week row's time is), so nothing prints outside the safe column, and the width
                pass reports it for the editor's cut-off note. */}
            <div
              data-group="pill"
              style={{ display: 'flex', alignItems: 'center', boxSizing: 'border-box', maxWidth: pillBox(canvas, geometry).width - PILL_TILT_ROOM, overflowX: 'clip', background: paint.accent, borderRadius: 20, padding: '17px 38px 19px', transform: 'rotate(-0.6deg)' }}
            >
              <div {...fitOf(type.pill)} style={{ ...typeStyle(type.pill, paint), display: 'flex', alignItems: 'center', gap: 18, minWidth: 0, whiteSpace: 'nowrap' }}>
                {t.handle && <span>{t.handle}</span>}
                {t.handle && t.tag && <span data-deco="dot" style={{ flex: '0 0 auto', width: 14, height: 14, borderRadius: '50%', background: paint.pillDot }} />}
                {t.tag && <span>{t.tag}</span>}
              </div>
            </div>
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
      <div style={{ ...common, left: box.left + 8, top: box.top + 8, fontFamily: BODY_FONT, fontWeight: 700, fontSize: 22, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#B03A06' }}>
        {`Safe zone · ${box.width} × ${box.height}`}
      </div>
    </>
  );
}
