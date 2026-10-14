/* What the tests' own build loads before the app (vite.proof.config.ts): the proof look, and its face, which the
   release's src/flyer/fonts.css never imports. */
import './register.js';
import './fonts.css';
