/* From a picture to a flyer in three steps, on the AI page (the owner's sketch, 2026-10-06: "Numbered steps"). After a
   read the page shows the idea box, which is also where it starts, and that read as a step back: the steps say it is
   the next one. They show under the page's two ways in from the first tap on From a photo (his answer), and in their
   place once the picture is read. */

/** Where the staff member is: choosing the picture, on its words, or at the flyer made from them. */
export type AiStep = 1 | 2 | 3;

/** What a read leaves in the idea box: the picture's words, or none (a picture that announces no event). */
export type Found = 'words' | 'none';

/** The steps' names, the owner's. The second is named after what the picture's read found: with no words to check,
    the event is written by hand. */
const SECOND: Record<Found, string> = { words: 'Check the words', none: 'Write the event' };
const names = (found: Found) => ['Picture', SECOND[found], 'Flyer'];

export function AiSteps({ at, found }: { at: AiStep; found: Found }) {
  return (
    // The role is said aloud: a list drawn without its markers is no list to Safari's screen reader.
    <ol className="ai-steps" role="list">
      {names(found).map((name, i) => {
        const n = i + 1;
        return (
          <li key={n} className={n < at ? 'done' : n === at ? 'on' : undefined} aria-current={n === at ? 'step' : undefined}>
            {/* The eye's number: a screen reader has the list's own. */}
            <span className="ai-step-n" aria-hidden="true">
              {n}
            </span>
            <span className="ai-step-name">
              {name}
              {n < at && ' ✓'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
