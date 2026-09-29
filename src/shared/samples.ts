import { newFlyerData, weekTitle } from './defaults.js';
import type { FlyerData, WeekRow } from './schema.js';

/* The records from design/flyer-data.js, as seed flyers, then three This week
   flyers made of the same events. "Long copy · stress test" exercises every
   worst case of the Activity template at once, "This week · stress test"
   every worst case of a week row — keep both as seed records and visual
   regression fixtures. The week ones come last: other suites take the first
   sample, and the first with a photo, as an Activity flyer. */

export interface SampleFlyer {
  title: string;
  hostel: string | null;
  photo: string | null; // file in fixtures/photos
  data: FlyerData;
}

interface Src {
  title: string;
  hostel: string | null;
  photo: string | null;
  headline1: string;
  headline2: string;
  headlineEs: string;
  when: string;
  where: string;
  cost: string;
  extras: string[];
}

const SOURCES: Src[] = [
  {
    title: 'Pool party',
    hostel: 'duque-nest',
    photo: 'flyer-pool-party.png',
    headline1: 'Saturday is a',
    headline2: 'pool party.',
    headlineEs: 'El sábado toca fiesta en la piscina.',
    when: 'Saturday 19/9 · 15:00',
    where: 'The pool · Duque Nest',
    cost: 'Free · food & drinks',
    extras: ['Everyone welcome', 'Bring a towel'],
  },
  {
    title: 'Pizza night',
    hostel: 'duque-nest',
    photo: 'flyer-pizza-night.png',
    headline1: 'Family dinner,',
    headline2: 'pizza night.',
    headlineEs: 'Cena en familia — pizza para todos.',
    when: 'Tonight · 20:30',
    where: 'The terrace',
    cost: '8€ with a drink',
    extras: ['Vegan option', 'Everyone welcome'],
  },
  {
    title: 'Surf lesson',
    hostel: null,
    photo: 'flyer-surf-lesson.png',
    headline1: 'Two hours',
    headline2: 'of fun waves.',
    headlineEs: 'Tu primera ola es esta tarde.',
    when: 'Fridays · 15:00',
    where: 'Pick-up · 14:30',
    cost: '40€ a class',
    extras: ['Gear included', 'Beginner friendly'],
  },
  {
    title: 'Long copy · stress test',
    hostel: 'los-amigos-nest',
    photo: null,
    headline1: 'Sunrise hike above',
    headline2: 'the sea of clouds.',
    headlineEs:
      'Excursión al amanecer por encima del mar de nubes del Teide, con guía local y desayuno arriba.',
    when: 'Saturday 27/9 · 05:30',
    where: 'Playa de las Américas · Av. Rafael Puig 12',
    cost: '25€ with breakfast · 18€ without',
    extras: ['Six hours', 'Bring a jacket', 'Twelve seats', 'Moderate walk'],
  },
  {
    title: 'Paragliding',
    hostel: 'duque-nest',
    photo: null,
    headline1: 'Step off',
    headline2: 'and fly.',
    headlineEs: 'Vuela sobre el sur de Tenerife.',
    when: 'Most mornings',
    where: 'Meet at reception',
    cost: '90€',
    extras: ['Tandem flight', 'Photos included'],
  },
  {
    title: 'Pizza · weekly',
    hostel: 'duque-nest',
    photo: 'flyer-pizza-night.png',
    headline1: 'Family dinner,',
    headline2: 'every Friday.',
    headlineEs: 'Cena en familia — todos los viernes.',
    when: 'Fridays · 20:30',
    where: 'The terrace',
    cost: '8€ with a drink',
    extras: ['Vegan option', 'Everyone welcome'],
  },
];

interface WeekSrc {
  title: string;
  hostel: string | null;
  /** The hostel's name as seed/hostels.json spells it, for the Spanish title line (shared.test.ts checks it). */
  hostelName: string | null;
  /** Keys in the schema's order (day, name, time, cost, shortName): PHP round-trips samples byte for byte. */
  rows: WeekRow[];
}

const WEEK_SOURCES: WeekSrc[] = [
  {
    title: 'This week · Duque Nest',
    hostel: 'duque-nest',
    hostelName: 'Duque Nest',
    rows: [
      { day: 'Fridays', name: 'Two hours of fun waves', time: '15:00', cost: '40€ a class' },
      { day: 'Fridays', name: 'Family dinner, every Friday', time: '20:30', cost: '8€ with a drink' },
      { day: 'Saturday 19/9', name: 'Saturday is a pool party', time: '15:00', cost: 'Free · food & drinks' },
      { day: 'Most mornings', name: 'Step off and fly', time: '', cost: '90€' },
    ],
  },
  {
    // Every row a worst case: the handoff's own wrapping name with a two-line price; a name too long for
    // any row, with its short name, on a two-line day; a long time; no day; no time; no price.
    title: 'This week · stress test',
    hostel: 'los-amigos-nest',
    hostelName: 'Los Amigos Nest',
    rows: [
      { day: 'Saturday 27/9', name: 'Sunrise hike above the sea of clouds', time: '05:30', cost: '25€ · 18€ without breakfast' },
      {
        day: 'Saturdays and Sundays',
        name: 'Sunset catamaran along the Los Gigantes cliffs with snorkelling and dinner',
        time: '18:30',
        cost: '55€',
        shortName: 'Catamaran to Los Gigantes',
      },
      { day: 'Every day', name: 'Beach volleyball and paddle boarding', time: '10:00 – 13:00', cost: '' },
      { day: '', name: 'Open mic night', time: '21:00', cost: 'Free' },
      { day: 'Most mornings', name: 'Step off and fly', time: '', cost: '90€' },
    ],
  },
  {
    title: 'This week · sparse',
    hostel: null,
    hostelName: null,
    rows: [
      { day: 'Fridays', name: 'Two hours of fun waves', time: '', cost: '40€ a class' },
      { day: 'Most mornings', name: 'Step off and fly', time: '', cost: '90€' },
    ],
  },
];

export const SAMPLE_FLYERS: SampleFlyer[] = [
  ...SOURCES.map((s) => {
    const data = newFlyerData('activity');
    data.photoMode = s.photo ? 'bleed' : 'none';
    data.text = { ...data.text, headline1: s.headline1, headline2: s.headline2, headlineEs: s.headlineEs };
    data.chips = [
      { key: 'when', label: 'When', value: s.when },
      { key: 'where', label: 'Where', value: s.where },
      { key: 'cost', label: 'Cost', value: s.cost },
    ];
    data.extras = [...s.extras];
    return { title: s.title, hostel: s.hostel, photo: s.photo, data };
  }),
  ...WEEK_SOURCES.map((s) => {
    const data = newFlyerData('week');
    data.text = { ...data.text, ...weekTitle(s.hostelName) };
    data.week = s.rows.map((r) => ({ ...r }));
    return { title: s.title, hostel: s.hostel, photo: null, data };
  }),
];
