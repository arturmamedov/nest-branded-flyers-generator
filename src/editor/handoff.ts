import type { FlyerData } from '../shared/schema';

/* The AI page hands the flyer it made to the editor in memory: never the URL (a brief is long and holds staff text),
   never storage (a try that nobody saves must leave nothing behind). "Open in editor" offers it and moves to #/new;
   the editor that mounts there takes it, once, so a reload or a later "New flyer" starts blank. */

/** What the editor starts from: its own draft's fields, minus the photo an AI flyer never has. */
export interface AiDraft {
  title: string;
  hostel: string | null;
  data: FlyerData;
}

export interface Handoff {
  draft: AiDraft;
  /** The staff member's text the flyer came from: "Write with AI" sends it along. */
  idea: string;
}

let offered: Handoff | null = null;

export function offerDraft(draft: AiDraft, idea: string): void {
  offered = { draft, idea };
}

/** The offered draft, to the first caller only. */
export function takeDraft(): Handoff | null {
  const taken = offered;
  offered = null;
  return taken;
}
