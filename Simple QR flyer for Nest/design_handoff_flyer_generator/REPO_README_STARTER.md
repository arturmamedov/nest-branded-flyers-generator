# Nest Branded Flyers Generator

Internal mini-app: staff pick a flyer template, fill in the event details, drop a photo, and
download an Instagram-story-ready image (1080 × 1920). Flyers are saved to a shared library
and can be reopened and edited later.

Built from a design handoff — **read `design_handoff_flyer_generator/README.md` first.** It
carries exact geometry, colours, type, the text-fitting behaviour, the data model, the API
surface and the export pipeline. The `design/` folder in it holds working HTML prototypes of
the flyer; they are references, not the app.

## Stack

- Node on a small VPS the team controls
- SQLite (`better-sqlite3`) — single file, easy backup
- Playwright (Chromium) for the 1080 × 1920 PNG/JPG export
- Self-hosted Shantell Sans + Montserrat (do not hot-link Google Fonts — export timing)

## Access

No login by design. **Bind to the office network or put it behind a firewall / reverse-proxy
allow-list.** It must not be reachable from the public internet.

## First run

1. Complete `seed/hostels.json` — three of the 13 hostels are filled in; Artur has the rest.
2. Seed the database, then verify the Activity template renders pixel-matched to
   `design/Nest Flyer Story Templates.dc.html`.
3. Work through the export checklist in the handoff README §9 before shipping.

## Ground rules

- Instagram safe zones are hard limits: 250px top, 300px bottom, 70px sides. Text and info
  blocks clamp inside them; only hand-drawn art may sit in the margins.
- `#53CED1` (bright teal) is never used for text on cream — it fails contrast. Text teal is
  `#0D6F82`.
- Orange `#EA580C` belongs to the website's "Book Now" button. Never a flyer accent.
- Preview and export share one renderer. If they can drift, they will.
