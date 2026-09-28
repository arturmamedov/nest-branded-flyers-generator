import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/* <nest-nav>, the top bar every Nests tool shares: a custom element defined by
   https://nestpass.ai/kit/nest-nav.js (the nestpass-tools repo). `tool` is an id from that
   file's registry. It is a plain string so the registry is not copied here. */
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'nest-nav': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { tool?: string };
    }
  }
}
