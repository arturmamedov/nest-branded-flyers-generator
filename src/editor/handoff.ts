import type { Draft } from './Editor';

/* The AI page hands the flyer it made to the editor in memory: never the URL (a brief is long and holds staff text),
   never storage (a try that nobody saves must leave nothing behind). "Open in editor" offers it and moves to #/new;
   the editor that mounts there takes it, once, so a reload or a later "New flyer" starts blank. */

export interface Handoff {
  /** What the editor starts from: its own draft, whole. An AI flyer has no photo of its own, so `photo` is null,
      unless the staff member took along the picture the idea was read from: that one is uploaded on the way, and the
      flyer is as a photo lands on it (withPhoto). */
  draft: Draft;
  /** The staff member's text the flyer came from: "Write with AI" sends it along. */
  idea: string;
}

let offered: Handoff | null = null;

export function offerDraft(draft: Draft, idea: string): void {
  offered = { draft, idea };
}

/** The offered draft, to the first caller only. */
export function takeDraft(): Handoff | null {
  const taken = offered;
  offered = null;
  return taken;
}
