/** The proof look's id: a word no release file holds, so a walk of a release (scripts/build-php.ts) or of dist/
    (tests/render/looks.spec.ts) finds it only where the proof look leaked. Its own file, with nothing imported: a
    release script reads it without loading the look. */
export const PROOF_LOOK_ID = 'proof-look';
