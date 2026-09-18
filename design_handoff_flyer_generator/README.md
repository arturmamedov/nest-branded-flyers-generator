# Handoff: Nest Branded Flyers Generator

An internal mini-app that lets non-technical Nests Hostels staff produce a branded,
hand-drawn-style activity flyer for Instagram Stories (1080 × 1920) without a designer.
Pick a template, fill in the fields, drop a photo, drag things a little, download a PNG.

**Repo:** `arturmamedov/nest-branded-flyers-generator` (branch `main`, currently empty — greenfield)
**Target host:** small VPS the team controls, Node installable, office-network access, no login
**Design language:** hand-drawn flyer style originally made in Canva by a Nests colleague;
the doodles in this bundle are that person's real artwork, extracted to transparent PNG.

---

## About the design files

The `design/` folder holds **design references created in HTML** — working prototypes that
show the intended look, the layout maths, and the text-fitting behaviour. They are **not the
app** and should not be shipped as-is.

Your job is to **recreate these designs inside a real app** (Node + a front end of your
choosing) and wrap them in an editor. The HTML is the specification of what the output must
look like; the README is the specification of how the app around it behaves.

Open them in a browser to see them work:

| File | What it is |
|---|---|
| `design/Nest Flyer Story Templates.dc.html` | **The one that matters.** 1080 × 1920 story canvas, both templates, three photo modes, safe-zone overlay. This is what the app renders. |
| `design/Nest Activity Flyer Hand-Drawn.dc.html` | The earlier 1080 × 1350 version. Same visual language, useful as a second reference; its `Code-drawn` frame mode is the one carried into the story design. |
| `design/flyer-data.js` | The content model, written as a plain commented file that a receptionist could edit. The app replaces this with a database, but **the field names and the `·` splitting convention should survive**. |

Both HTML files are self-contained apart from `support.js`, `image-slot.js` and `assets/`,
all included here. They need an internet connection for Google Fonts.

## Fidelity

**High fidelity.** Colours, type sizes, positions and spacing in the design files are final
and measured — reproduce them exactly. Every number in the "Story canvas" section below was
taken from the working file, not estimated.

---

## 1. What the app must do

A single-page editor with a live preview, and a small library of saved flyers.

1. **Pick a template** — `Activity` (one event) or `This week` (a list of up to 5).
2. **Fill in text fields** — every string on the flyer is editable. Empty optional fields
   collapse and the layout closes up; nothing renders as a blank gap or a placeholder.
3. **Drop a photo** — drag-and-drop or file picker, with reposition/zoom inside its frame.
4. **Choose a photo mode** — full bleed (default), inside a drawn frame, or no photo.
5. **Adjust** — per-element font size, per-element X/Y nudge, brand colours, block order.
6. **Preview** at true 1080 × 1920 proportions, with a toggle for the Instagram safe zones.
7. **Download** a PNG (default) or JPG at exactly 1080 × 1920.
8. **Save** to a shared library, tagged by hostel, reopenable and editable later.

### Explicitly out of scope
Login/accounts, scheduling or posting to Instagram, multi-language logic beyond "type
whatever you want in the two lines", PDF export, per-user private flyers.

---

## 2. Story canvas — exact geometry

Canvas: **1080 × 1920**, background `#F8F4E8`.

### Safe zones (hard rule)

| Edge | Reserved | Why |
|---|---|---|
| Top | 250px | Instagram's header / close button |
| Bottom | 300px | reply bar, sticker tray |
| Left / right | 70px | thumb reach, general margin |

Usable content box: **x 70 → 1010, y 250 → 1620 (940 × 1370).**

All text, info blocks and the CTA must stay inside that box. **Only hand-drawn art may sit in
the margins** — that's the chosen treatment: cream margins with doodles drifting in
(sparks top, blobs and a clock bottom). Dragging must clamp text and blocks to the safe box
while letting decorative art move freely.

### Activity template — element positions

Positions are `top` from the canvas edge; left/right are the 70px margins unless stated.

| # | Element | Top | Height | Notes |
|---|---|---|---|---|
| 1 | Eyebrow row | 250 | 104 | Calendar icon 62px + `NEXT ACTIVITY` (Shantell 700, 36px, 0.1em) over the teal brush rule (16px tall); Nests wordmark right, 56px tall |
| 2 | Headline block | 382 | 300 | `headline1` Shantell 800 / 92px / lh 1.04 black; `headline2` Shantell 800 / 124px / lh 1.0 `#0D6F82`; Spanish line Montserrat 600 / 36px / lh 1.26 `#3A3A34`, 16px above-gap |
| 3 | Photo | 712 | 380 | **Full bleed:** x 0 → 1080, no frame, no radius. **In frame:** x 70 → 1010, radius 40px, wonky SVG stroke on top. **No photo:** replaced by a teal brush rule, x 240 → 840, top 900, 32px tall — and the headline block grows to top 398 / height 460 |
| 4 | Info blocks | 1110 | 206 | 3-column grid, 20px gap, order **WHEN · WHERE · COST** |
| 5 | Extras line | 1318 | 40 | Shantell 700 / 30px uppercase, items joined by a teal `·`, 16px gap, single line, never wraps |
| 6 | Ask block | 1382 | 150 | `askEn` Shantell 800 / 62px; teal brush rule 22px; `askEs` Montserrat 600 / 34px. Pencil doodle 104px wide, right 20px, rotate −4° |
| 7 | Tag pill | 1544 | ~72 | Centred, `#0D6F82`, radius 20px, padding 17/38/19, rotate −0.6°. `@NESTSHOSTELS` + 14px `#53CED1` dot + `¡TAG US!`, both Shantell 700 / 34px white |

**The bottom of the canvas is allocated upward from the 1620 floor, not downward from the
photo.** Pill 1544→1616, ask 1382→1532, extras 1318→1358, blocks 1110→1316. The pill cannot be
pushed lower — it is already 4px off the floor — so if anything above it grows, the stack moves
up, never down. Build these as fixed offsets and assert no two boxes overlap: an earlier draft
placed the pill 38px inside the ask block's own span and it sat on top of the Spanish line.

### Info block internals

Each block: white fill, wonky black stroke (see §4), `padding: 24px 26px 20px`,
`flex-direction: column`, `gap: 8px`.

- **Label row** (36px tall, 10px gap): icon 32px (calendar for WHEN, pin for WHERE) or a
  Shantell 800 / 36px `€` glyph for COST, then the label in Montserrat 700 / 26px /
  `letter-spacing: 0.13em` / uppercase / `#0D6F82`.
- **Big line:** Shantell 700 / 46px. WHEN's big line sits on the yellow highlighter stroke
  (`mark-yellow.png`, `background-size: 100% 100%`, padding `2px 10px 4px`,
  `margin-left: -8px`, `box-decoration-break: clone`) and uses `line-height: 1.3` to clear it.
- **Sub line:** WHEN gets the clock icon (36px) + Shantell 700 / 40px — the hour is
  deliberately the second-largest thing in the row of blocks. WHERE and COST get
  Montserrat 600 / 32px.

### WHERE block content rule

The hostel name is the big line, the spot underneath:

```
Duque Nest        ← hostel, Shantell 46px
The terrace       ← venue, Montserrat 32px
```

If the venue text already contains the hostel name, drop the duplicate.

### This week template

Same eyebrow (label reads `THIS WEEK`), same ask and pill. Between them:

- Title block, top 398, height 250: `What's on` / `this week.` / Spanish line.
- Up to 5 rows from top 700, `flex-column`, **15px gap, each row 122px tall**, same wonky
  white box. Row layout: day (fixed 250px, Shantell 34px on the yellow stroke) · event name
  (flex, Shantell 800 / 44px, `#0D6F82`) · right group (clock 30px + time Shantell 34px,
  cost Montserrat 26px `#3A3A34` beneath).
- **The event name wraps; it must never be a single nowrap line.** Give it its own 96px-tall
  fit box with `overflow: hidden` and let it run to two lines at `line-height: 1.06`; the
  height pass then shrinks a three-line name until it fits. With nowrap, a name like
  "Sunrise hike above the sea of clouds" hits the shrink floor and still spills ~200px through
  the time and cost beside it. The activity template's headlines are full-width so they don't
  need this; the week row does.
- No photo, no extras line.

**Five rows must end by 1370.** 5 × 122 + 4 × 15 = 670, so the rows run 700 → 1370 and clear
the ask block at 1382 with 12px to spare. Those numbers are a constraint, not a suggestion: at
an earlier 138px/22px the fifth row reached 1478 and the ask headline crossed its frame stroke.
To allow more than five events, shrink the rows further or paginate — never encroach on the
ask. With fewer than five, leave them top-aligned at 700 or centre them in the space.

---

## 3. Design tokens

### Colour

| Token | Hex | Use |
|---|---|---|
| Cream ground | `#F8F4E8` | flyer background — the whole identity rests on this |
| Ink | `#141414` | all primary text, wonky strokes |
| Deep teal | `#0D6F82` | accent headline line, labels, tag pill, `·` separators |
| Bright teal | `#53CED1` | brush rules, dots, fills **only** — never small text |
| Highlighter yellow | `#FAC213` | the WHEN stroke and the corner blob |
| Muted ink | `#3A3A34` | Spanish secondary lines |
| Photo placeholder | `#E7E0CE` | empty photo area |

**Contrast rule, non-negotiable:** bright teal `#53CED1` on cream measures ≈1.9:1 and fails
even the 3:1 headline allowance. Deep teal `#0D6F82` is ≈6:1 and is the only teal allowed for
text. If the app lets staff pick accent colours, validate the chosen colour against the
background and refuse (or warn loudly) below 4.5:1 for body text and 3:1 for headline-scale.

**Orange `#EA580C` is reserved** by the Nests web design system for the single strongest
conversion action ("Book Now"). Do not offer it as a flyer accent. The safe-zone overlay in
the design file uses orange deliberately — that's editor chrome, not flyer ink.

### Type

| Role | Font | Weight | Notes |
|---|---|---|---|
| Headline / marker | **Shantell Sans** | 700–800 | Google Fonts, OFL — free to ship. Stands in for Canva's **More Sugar Regular** (Brittney Murphy Design), which the original flyer used and which the team does **not** hold a licence for outside Canva. Chosen by the team from four candidates as the closest free match. |
| Body / labels | **Montserrat** | 500–700 | Google Fonts; matches the Nests website body face |

Never below 26px on the flyer. Self-host both fonts on the VPS rather than hot-linking
Google Fonts — the export renderer must not depend on network timing.

### Geometry

Radii: 40px (framed photo), 20px (tag pill), 34px (drawn-frame interior).
Grid gap: 20px between info blocks, 22px between week rows.
Rotations, deliberate and small: pill −0.6°, pencil −4°, sparks −8°/+9°/+14°.

---

## 4. The two frame styles

The design file has both; **the app should ship the code-drawn one** (the team's choice).

**Code-drawn (use this).** One SVG path, `preserveAspectRatio="none"`, `viewBox="0 0 960 200"`,
`stroke: #141414`, `stroke-width: 5`, `stroke-linejoin: round`, and critically
**`vector-effect: non-scaling-stroke`** so the line stays 5px however the box is stretched:

```html
<svg viewBox="0 0 960 200" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
  <path d="M46 9 C 200 4 380 13 540 7 C 700 2 830 12 914 8 C 944 7 954 26 951 54 C 954 96 949 142 952 164 C 954 186 932 197 902 193 C 690 198 410 189 154 195 C 84 197 9 192 11 166 C 7 122 13 72 9 48 C 7 22 22 10 46 9 Z"
        fill="#ffffff" stroke="#141414" stroke-width="5" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>
</svg>
```

**Drawn art (reference only).** `frame-box.png` / `-sm` / `-wide` are the real Canva strokes,
re-tiled from the original corners at natural size. They look better at one fixed size and
wash out when scaled — which is exactly why an app whose boxes resize with the copy should use
the code-drawn path instead. Keep the PNGs in the repo; a future fixed-size print template can
use them.

---

## 5. Text fitting — port this behaviour

Staff copy is unpredictable: 4–5-word event names, Spanish lines twice the English length,
two-line prices, `Playa de las Américas`. The design solves it with a two-pass shrink-to-fit,
implemented in `_fit()` in both design files. Port it; don't reinvent it.

1. **Reset** every fitted element to its authored size.
2. **Width pass** — while the element overflows its width, shrink its font size by 2.5%
   steps down to a floor (`data-fit-min`, typically 0.5–0.8 of base). Flex rows with a
   `data-fit-gap` shrink their gap first, to 30%.
3. **Height pass** — for each group box, while its content overflows the box height, scale
   every fitted child inside it by a further 2.5% step, down to 55%.

Consequences the app must preserve: element positions never move because copy got long, and
text never becomes unreadably small — it stops at the floor and the box clips. Run the passes
after fonts load (`document.fonts.ready`) **and** before any export, or the PNG will not match
the preview.

The "Long copy · stress test" record in `flyer-data.js` exists to exercise all four worst
cases at once. Keep it as a seed record and as a visual regression fixture.

---

## 6. Editing model

### Fields

| Field | Template | Notes |
|---|---|---|
| `hostel` | both | from the hostel list; drives the WHERE block and the flyer's tag |
| `headline1`, `headline2` | activity | two lines; `headline2` is the teal one. ~18 / ~15 chars before shrinking starts |
| `headlineEs` | activity | optional. Empty → the line disappears, no gap |
| `chips[]` | activity | exactly three: WHEN, WHERE, COST. Each has `label` + `value` |
| `extras[]` | activity | 0–4 short nice-to-knows. Empty → the line disappears |
| `askEn`, `askEs` | both | one ask. `askEs` optional |
| `week[]` | this week | up to 5 rows: `day`, `name`, `time`, `cost`. `name` is the **whole** event name — when a row is derived from an activity record join `headline1 + headline2`, never `headline2` alone, or rows read "of fun waves" instead of "Two hours of fun waves". Give the row its own short-name override in the editor for long joins |
| `photo` | activity | uploaded file + crop/zoom offsets |

**The `·` convention.** A middle dot inside a chip value splits big line from sub line:
`Saturday 19/9 · 15:00` → big `Saturday 19/9`, sub `15:00`. Keep it. It is how a receptionist
writes two facts in one field without learning a form. Show the rule as helper text next to
each field, and render a live preview so the split is visible as they type.

**Optional fields collapse, they never placeholder.** If a staff member leaves the Spanish
line, the extras, or a sub-value empty, the element is removed and the layout closes up. No
"Lorem", no empty box, no dangling `·`.

### Controls

- **Per-element font size** — a slider or ± stepper, expressed as a multiplier (0.6–1.4) of
  the authored size, not absolute px. Shrink-to-fit still applies on top.
- **Per-element X/Y** — drag with the mouse *and* numeric inputs. 8px grid snapping, snap
  lines to the 70px margins, the canvas centre, and neighbouring elements' edges.
  **Clamp to the safe box.** Decorative art is exempt.
- **Block order** — drag to reorder WHEN / WHERE / COST. Default WHEN · WHERE · COST.
- **Colours** — background, ink, accent (deep teal), highlight (yellow) as curated swatches,
  not a free colour picker. Offer 3–4 valid options per slot, all contrast-checked.
- **Reset to template** — always visible, one click, restores every position, size and colour
  for the current flyer. This is the safety net that makes free dragging acceptable.

---

## 7. Data model

SQLite via `better-sqlite3` (single file, trivially backed up, no daemon):

```sql
CREATE TABLE hostel (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,          -- as it should print on a flyer
  island      TEXT NOT NULL,          -- Tenerife | Gran Canaria | Ibiza
  logo_path   TEXT,                   -- per-hostel logo variant, nullable
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE flyer (
  id           INTEGER PRIMARY KEY,
  hostel_id    INTEGER REFERENCES hostel(id),
  template     TEXT NOT NULL,         -- 'activity' | 'week'
  title        TEXT NOT NULL,         -- library label, e.g. "Pool party 19/9"
  data         TEXT NOT NULL,         -- JSON: all content + overrides (below)
  photo_id     INTEGER REFERENCES photo(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  archived     INTEGER DEFAULT 0
);

CREATE TABLE photo (
  id          INTEGER PRIMARY KEY,
  path        TEXT NOT NULL,          -- uploads/2026/09/xxxx.jpg
  width       INTEGER, height INTEGER,
  focal_x     REAL DEFAULT 0.5,       -- crop centre, 0..1
  focal_y     REAL DEFAULT 0.5,
  zoom        REAL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE doodle (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,          -- "Calendar", "Teal spark"
  path        TEXT NOT NULL,
  kind        TEXT NOT NULL,          -- 'icon' | 'spark' | 'blob' | 'rule' | 'mark' | 'frame'
  builtin     INTEGER DEFAULT 1       -- 0 for staff uploads
);
```

`flyer.data` JSON, one shape for both templates:

```json
{
  "template": "activity",
  "photoMode": "bleed",
  "text": {
    "eyebrow": "NEXT ACTIVITY",
    "headline1": "Saturday is a",
    "headline2": "pool party.",
    "headlineEs": "El sábado toca fiesta en la piscina.",
    "askEn": "Sign up at reception.",
    "askEs": "Apúntate en recepción.",
    "handle": "@NESTSHOSTELS",
    "tag": "¡TAG US!"
  },
  "chips": [
    { "label": "When",  "value": "Saturday 19/9 · 15:00" },
    { "label": "Where", "value": "The terrace" },
    { "label": "Cost",  "value": "Free · food & drinks" }
  ],
  "extras": ["Everyone welcome", "Bring a towel"],
  "week": [],
  "colors": { "bg": "#F8F4E8", "ink": "#141414", "accent": "#0D6F82", "mark": "#FAC213" },
  "overrides": {
    "headline": { "dx": 0, "dy": 0, "scale": 1 },
    "chips":    { "dx": 0, "dy": 0, "scale": 1, "order": ["when", "where", "cost"] },
    "ask":      { "dx": 0, "dy": 0, "scale": 1 },
    "pill":     { "dx": 0, "dy": 0, "scale": 1 }
  },
  "doodles": [
    { "slug": "spark-teal",   "x": 52,  "y": 74,   "w": 104, "rot": -8 },
    { "slug": "spark-yellow", "x": 918, "y": 112,  "w": 88,  "rot": 9 }
  ]
}
```

Storing content and overrides as one JSON blob keeps the schema stable while the template
evolves; the columns outside it are only what the library needs to list and filter.

**Seed data.** `seed/hostels.json` in this bundle has the three hostels confirmed so far plus
the island split. **Artur will give you the full list of 13 names directly** — take it from him
and complete the file before first run; don't invent hostel names.

---

## 8. API

Small REST surface, JSON in / JSON out:

```
GET    /api/hostels
GET    /api/flyers?hostel=duque-nest&template=activity   → library list, newest first
POST   /api/flyers                                       → create, returns id
GET    /api/flyers/:id
PUT    /api/flyers/:id
DELETE /api/flyers/:id                                   → soft delete (archived = 1)
POST   /api/photos            multipart                  → { id, path, width, height }
GET    /api/doodles
POST   /api/doodles           multipart                  → staff-uploaded art
POST   /api/render/:id        { format: "png" | "jpg" }   → the 1080×1920 image
```

No auth. Bind to the office network / behind the VPS firewall or a reverse-proxy allow-list,
and say so in the repo README so nobody exposes it publicly by accident.

---

## 9. Export pipeline

The preview and the export **must** be the same renderer, or they will drift.

Recommended: render the flyer as a real 1080 × 1920 DOM node and screenshot it server-side
with **Playwright** (Chromium) at `deviceScaleFactor: 1`, `clip` to exactly 1080 × 1920.

1. Client saves the flyer, then calls `POST /api/render/:id`.
2. Server loads the same template route in headless Chromium with the saved JSON.
3. Wait for `document.fonts.ready`, wait for the photo to decode, run the fit passes,
   then screenshot.
4. PNG by default; JPG at quality 0.9 for the "smaller file" option.
5. Return the file for download and cache it next to the flyer record (invalidate on save).

Reasons not to do it client-side: `html-to-image` and friends mis-render `background-size`
stretched art, `box-decoration-break` on the highlighter stroke, and `vector-effect` strokes —
all three are load-bearing here. The design already lost `border-image` once for exactly this
reason; that's why every piece of art is now a plain `background-image` or an `<img>`.

**Export checklist** — verify each before calling it done:
- Output is exactly 1080 × 1920, no scrollbar, no scaling artefacts.
- Yellow highlighter stroke sits behind the WHEN line, full width, letters legible.
- Wonky strokes are 5px everywhere, not 3px on wide boxes and 8px on narrow ones.
- Fonts are the real Shantell Sans / Montserrat, not a system fallback.
- Nothing that isn't art crosses into the 250 / 300 / 70 margins.
- The stress-test record renders with no clipped or overlapping text.

---

## 10. Assets in this bundle

`assets/art/` — the colleague's hand-drawn artwork, extracted from their Canva PDF export,
cream unmixed to transparency, cleaned and tightly cropped. Ship these as the built-in doodle
library:

| File | What it is |
|---|---|
| `icon-calendar.png` | calendar — WHEN label |
| `icon-pin.png` | map pin — WHERE label |
| `icon-clock.png` | clock — the hour, and a bottom-margin doodle |
| `doodle-pencil.png` | pencil — next to the ask |
| `spark-teal.png`, `spark-yellow.png` | sparkle bursts — margins |
| `blob-teal.png`, `blob-yellow.png` | corner blobs — bottom margin |
| `rule-teal-wide.png`, `rule-teal-ask.png` | brush underlines |
| `mark-yellow.png` | highlighter stroke behind the WHEN line |
| `frame-box.png`, `frame-box-sm.png`, `frame-box-wide.png` | drawn frames (reference; prefer the SVG path) |

`assets/nest-logo-white.png` / `nest-logo-teal.png` — the Nests wordmark. White for dark or
photo grounds, deep teal for cream. Per-hostel logo variants upload into `uploads/logos/`.

`assets/flyer-*.png` — three sample event photos for development. **Not licensed stock;
placeholders only.**

**Doodle folder contract.** The colleague is exporting a larger set. Spec a watched folder —
`assets/art/` for built-ins, `uploads/doodles/` for staff uploads — where any transparent PNG
dropped in appears in the picker, using its filename as the label (`spark-teal.png` →
"Spark teal"). Staff can also upload from the UI. Both paths land in the `doodle` table;
`builtin` distinguishes them.

---

## 11. Build order

1. Node + SQLite + the schema, seeded with the 13 hostels and the built-in doodles.
2. Static render of the Activity template at 1080 × 1920 from a JSON record — no editor yet.
   Get it pixel-matching `design/Nest Flyer Story Templates.dc.html` first; everything else is
   easier afterwards.
3. Playwright export. Verify the checklist in §9.
4. Text fields + live preview + the fit passes.
5. Photo upload, three photo modes, focal point and zoom.
6. Library: save, list, filter by hostel, reopen, duplicate.
7. Drag / nudge / font-size / colour controls, snapping, clamping, Reset to template.
8. This week template.
9. Doodle picker and uploads.

Ship after 6 if time is short — steps 7–9 are quality of life; 1–6 are the product.

---

## 12. Copy rules the app should enforce

From the Nests brand voice (and worth encoding as helper text or gentle validation):

- **One exclamation mark per flyer, maximum.** The `¡TAG US!` pill already spends it.
- English leads, Spanish sits underneath. Either can be empty; both empty is fine too.
- Separators are `·` and `—`. Never bullets, never slashes.
- Sentence case for headlines. Uppercase only for the eyebrow, labels and the extras line.
- Never "book now" on a flyer — that phrase and the colour orange belong to the website's
  booking button.
- One ask. The flyer's job is reception, not a link.

---

## 13. Known gaps

- **Hostel names** — only three confirmed (`seed/hostels.json`). Artur has the rest.
- **Photos** — the three in `assets/` are development placeholders, not licensed images.
- **More Sugar** — the original Canva font. Shantell Sans ships; if a licence is ever bought,
  swapping is a single font-family change, so keep the family in one constant.
- **Per-hostel logos** — the upload path is specced but no real variants were supplied.
- **Nests web design system** — the site forbids hand-drawn illustration motifs. This flyer
  deliberately departs from it because a story in a guest WhatsApp group is a different
  surface; it holds the palette (minus orange), the fonts for body copy, the voice and the
  separators. Don't "fix" it toward the website style.
