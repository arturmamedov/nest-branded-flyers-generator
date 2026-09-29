/* Which language a field is written in, as a flag beside its label (the owner's call, 2026-09-29:
   so nobody mixes up where the English goes and where the Spanish does). Drawn, never emoji:
   Windows shows flag emoji as two letters. No text inside, so a label still reads as its words,
   to screen readers and to the browser specs. Editor chrome only; nothing here reaches a flyer. */

export type Lang = 'en' | 'es';

export function LangFlag({ lang }: { lang: Lang }) {
  if (lang === 'es')
    return (
      <svg className="flag" data-lang="es" viewBox="0 0 3 2" aria-hidden="true" focusable="false">
        <rect width="3" height="2" fill="#AA151B" />
        <rect y="0.5" width="3" height="1" fill="#F1BF00" />
      </svg>
    );
  // The Union flag, simplified to be legible at 12 px tall.
  return (
    <svg className="flag" data-lang="en" viewBox="0 0 60 30" aria-hidden="true" focusable="false">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="2" />
      <path d="M30,0 V30 M0,15 H60" stroke="#FFFFFF" strokeWidth="10" />
      <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}
