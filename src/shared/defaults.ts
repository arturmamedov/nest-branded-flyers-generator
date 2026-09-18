import type { Colors, DoodlePlacement, FlyerData, FlyerText, Template } from './schema.js';

/* Design tokens (handoff README §3). */
export const CREAM = '#F8F4E8';
export const INK = '#141414';
export const DEEP_TEAL = '#0D6F82'; // the only teal allowed for text
export const BRIGHT_TEAL = '#53CED1'; // rules, dots, fills — never text
export const YELLOW = '#FAC213';
export const MUTED = '#3A3A34';
export const PHOTO_PLACEHOLDER = '#E7E0CE';

export const DEFAULT_COLORS: Colors = { bg: CREAM, ink: INK, accent: DEEP_TEAL, mark: YELLOW };

/* The margin art from the design file: sparks top, blobs and a clock bottom.
   The prototype anchors some by right/bottom; these are the same positions
   converted to top-left using each PNG's natural aspect ratio. */
export const DEFAULT_DOODLES: DoodlePlacement[] = [
  { slug: 'spark-teal', x: 52, y: 74, w: 104, rot: -8 },
  { slug: 'spark-yellow', x: 918, y: 112, w: 88, rot: 9 },
  { slug: 'blob-yellow', x: -26, y: 1704.4474, w: 250, rot: 0 },
  { slug: 'blob-teal', x: 818, y: 1673.6047, w: 290, rot: 0 },
  { slug: 'spark-teal', x: 738, y: 1667.7015, w: 92, rot: 14, flipX: true },
  { slug: 'icon-clock', x: 236, y: 1656.1728, w: 74, rot: -9, opacity: 0.9 },
];

export const DEFAULT_TEXT: FlyerText = {
  eyebrow: 'NEXT ACTIVITY',
  headline1: '',
  headline2: '',
  headlineEs: '',
  askEn: 'Sign up at reception.',
  askEs: 'Apúntate en recepción.',
  handle: '@NESTSHOSTELS',
  tag: '¡TAG US!',
};

export function newFlyerData(template: Template = 'activity'): FlyerData {
  return {
    v: 1,
    template,
    photoMode: 'bleed',
    photoCrop: { x: 0.5, y: 0.5, zoom: 1 },
    showPill: true,
    text: { ...DEFAULT_TEXT, eyebrow: template === 'week' ? 'THIS WEEK' : 'NEXT ACTIVITY' },
    chips: [
      { key: 'when', label: 'When', value: '' },
      { key: 'where', label: 'Where', value: '' },
      { key: 'cost', label: 'Cost', value: '' },
    ],
    extras: [],
    week: [],
    colors: { ...DEFAULT_COLORS },
    overrides: {},
    doodles: DEFAULT_DOODLES.map((d) => ({ ...d })),
  };
}
