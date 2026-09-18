import { newFlyerData } from './defaults.js';
import type { FlyerData } from './schema.js';

/* The records from design/flyer-data.js, as seed flyers. "Long copy · stress
   test" exercises every worst case at once — keep it as a seed record and a
   visual regression fixture. */

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

export const SAMPLE_FLYERS: SampleFlyer[] = SOURCES.map((s) => {
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
});
