import { CANVASES, CANVAS_IDS, activityGroups, boxesOf, inside, overlaps, photoFrame, safeBox, weekGroups, weekRowRect, type Geometry, type Rect } from '../src/shared/layout.js';
import { WEEK_ROWS_MAX } from '../src/shared/week.js';

/* What every look's boxes keep, whatever it moves or sizes (the owner's answers, 2026-10-14: a look may give a box its
   own top and height, the photo's too). With the boxes' sizes fixed these held by construction; now they are checked,
   for every look, canvas and body, and each problem names its box. The registry's tests run them on every look; the
   shared table, which hand-drawn prints, is held to them in shared.test.ts. */

const bottom = (r: { top: number; height: number }) => r.top + r.height;

const BODIES = ['bleed', 'band', 'none', 'week'] as const;

/** The fitted boxes: on another canvas each is at least as tall as on the story, so copy that fits the story is
    rarely cut off there (layout.ts, WhatsApp's note). */
const FITTED = ['headline', 'headlineNoPhoto', 'chips', 'extras', 'ask'] as const;

/** Every way a geometry breaks the rules, as `<canvas>[ / <body>]: <what>`; none for a sound one. */
export function geometryProblems(geometry: Geometry): string[] {
  const out: string[] = [];
  const say = (where: string, ok: boolean, what: string) => {
    if (!ok) out.push(`${where}: ${what}`);
  };
  for (const canvas of CANVAS_IDS) {
    const safe = safeBox(canvas);
    const floor = bottom(safe);
    const { activity: a, week: w } = boxesOf(canvas, geometry);

    for (const body of BODIES) {
      const where = `${canvas} / ${body}`;
      const groups = Object.entries(body === 'week' ? weekGroups(canvas, geometry) : activityGroups(canvas, body, geometry)) as [string, Rect][];
      for (const [name, r] of groups) {
        say(where, r.height > 0, `${name} has no height`);
        if (name === 'photo' && body === 'bleed') {
          // The one sanctioned exception, sideways: edge to edge, and inside the safe zone from top to bottom.
          say(where, r.left === 0 && r.width === CANVASES[canvas].width, 'the bleed photo does not run from edge to edge');
          say(where, inside({ ...r, left: safe.left, width: 1 }, safe), 'photo leaves the safe zone');
          continue;
        }
        say(where, inside(r, safe), `${name} leaves the safe zone`);
      }
      for (let i = 0; i < groups.length; i++)
        for (let j = i + 1; j < groups.length; j++) say(where, !overlaps(groups[i][1], groups[j][1]), `${groups[i][0]} overlaps ${groups[j][0]}`);
    }

    // The bottom of the canvas is allocated upward from the floor, and the pill, tilted, needs 4 px under it.
    say(canvas, bottom(a.pill) + 4 <= floor, `the pill ends at ${bottom(a.pill)} and the floor is ${floor}: its tilt needs 4 px under it`);
    say(canvas, bottom(a.ask) <= a.pill.top, 'the ask runs into the pill');
    say(canvas, bottom(a.extras) <= a.ask.top, 'the extras run into the ask');
    say(canvas, bottom(a.chips) <= a.extras.top, 'the chips run into the extras');
    say(canvas, bottom(a.photoBand) <= a.chips.top, 'the photo runs into the chips');
    say(canvas, bottom(a.photoBleed) === bottom(a.photoBand), 'the bleed and the band end apart: the blocks below them are every photo mode’s');
    say(canvas, a.eyebrow.height >= 62, `the eyebrow is ${a.eyebrow.height} px tall, under its 62 px of icon and words`);
    for (const head of ['headline', 'headlineNoPhoto'] as const) say(canvas, a[head].top >= bottom(a.eyebrow), `${head} starts inside the eyebrow`);
    say(canvas, w.title.top >= bottom(a.eyebrow), 'the week title starts inside the eyebrow');

    // Five rows, the most a week flyer prints, end 12 px above the ask (the handoff §2).
    const last = weekRowRect(canvas, WEEK_ROWS_MAX - 1, geometry);
    say(canvas, bottom(last) + 12 <= a.ask.top, `five rows end at ${bottom(last)}, and the ask starts at ${a.ask.top}: they need 12 px between`);
    say(canvas, w.rowGap >= 0, 'the rows overlap each other');

    // One stored crop shows the same picture on every canvas: each photo mode keeps one shape (layout.ts, photo.ts).
    for (const mode of ['bleed', 'band'] as const) {
      const f = photoFrame(canvas, mode, geometry)!;
      const s = photoFrame('story', mode, geometry)!;
      say(canvas, Math.abs(f.height - (f.width * s.height) / s.width) <= 0.5, `the ${mode} photo's shape is not the story's`);
    }
    const story = boxesOf('story', geometry).activity;
    for (const box of FITTED) say(canvas, a[box].height >= story[box].height, `${box} is shorter than on the story`);
  }
  return out;
}
