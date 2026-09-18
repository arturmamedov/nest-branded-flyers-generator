/* ==========================================================================
   NEST EVENT FLYERS — the only file you need to edit
   Output size: 1080 × 1350 (WhatsApp / Instagram portrait)
   --------------------------------------------------------------------------
   HOW TO ADD A NEW FLYER (no code knowledge needed)

   1. Copy one whole block below — from `{` down to its matching `},`.
   2. Paste it at the end of the list, just before the final `];`.
   3. Change the text inside the quotes. Keep the quotes and the commas.
   4. Save. The new flyer appears in the switcher at the top of every
      flyer file.

   WHAT EACH LINE DOES
      id        a short nickname, lowercase, no spaces. Must be unique —
                it is what keeps your dropped photo attached to this flyer.
      label     the name shown on the switcher button.
      hostel    the hostel this flyer is for. Leave as "" for a
                chain-wide flyer.
      headline1 first headline line, black ink. Keep it under ~18 characters.
      headline2 second headline line, big and teal. Keep it under ~15
                characters or it will be shrunk to fit.
      headlineEs the Spanish line underneath. One or two lines.
      chips     the three big blocks. Always three, always in this order:
                WHEN, COST, WHERE. Put a · in the middle of a value and the
                part before it becomes the big highlighted line and the rest
                sits underneath — "Saturday 19/9 · 15:00" reads exactly like
                your handwritten flyers.
      extras    the thin line under the blocks — the nice-to-knows. 2–4
                short items. Do NOT type the dots, they are added for you.
                Leave as [] to hide the line.
      askEn     the one ask, in English. One short sentence.
      askEs     the same ask in Spanish.
      ctaEn/Es  the longer link-first ask. Only the dark/link flyers use it.
      url       the link. Only the dark/link flyers print it.

   HOUSE RULES
      · One exclamation mark per flyer, maximum — the ¡TAG US! pill at the
        bottom already spends it, so keep the rest of the copy calm.
      · English leads, Spanish sits underneath.
      · Use · and — as separators, never bullets or slashes.
      · Never write "book now" here — orange is reserved for that button
        on the website.

   THE PHOTO
      Drag an image straight onto the photo area. Double-click a dropped
      image to move or zoom it. Your drops stay put, per flyer, even
      after you close the file.
      Check that faces land inside the visible band — a wide group shot
      usually needs nudging. If you add a NEW photo file and set it on
      `photo:` below, tell Claude to register it for publishing.
   ========================================================================== */

window.NEST_FLYERS = [
  {
    id: 'pool-party',
    label: 'Pool party',
    hostel: 'Duque Nest',
    headline1: 'Saturday is a',
    headline2: 'pool party.',
    headlineEs: 'El sábado toca fiesta en la piscina.',
    chips: [
      { label: 'When', value: 'Saturday 19/9 · 15:00' },
      { label: 'Cost', value: 'Free · food & drinks' },
      { label: 'Where', value: 'The pool · Duque Nest' }
    ],
    extras: ['Everyone welcome', 'Bring a towel'],
    askEn: 'Sign up at reception.',
    askEs: 'Apúntate en recepción.',
    ctaEn: 'Follow the link or ask at reception.',
    ctaEs: 'Sigue el link o pregunta en recepción.',
    url: 'nestshostels.com/events',
    photo: 'assets/flyer-pool-party.png'
  },
  {
    id: 'pizza-night',
    label: 'Pizza night',
    hostel: 'Duque Nest',
    headline1: 'Family dinner,',
    headline2: 'pizza night.',
    headlineEs: 'Cena en familia — pizza para todos.',
    chips: [
      { label: 'When', value: 'Tonight · 20:30' },
      { label: 'Cost', value: '8€ with a drink' },
      { label: 'Where', value: 'The terrace' }
    ],
    extras: ['Vegan option', 'Everyone welcome'],
    askEn: 'Sign up at reception.',
    askEs: 'Apúntate en recepción.',
    ctaEn: 'Follow the link or ask at reception.',
    ctaEs: 'Sigue el link o pregunta en recepción.',
    url: 'nestshostels.com/events',
    photo: 'assets/flyer-pizza-night.png'
  },
  {
    id: 'surf-lesson',
    label: 'Surf lesson',
    hostel: '',
    headline1: 'Two hours',
    headline2: 'of fun waves.',
    headlineEs: 'Tu primera ola es esta tarde.',
    chips: [
      { label: 'When', value: 'Fridays · 15:00' },
      { label: 'Cost', value: '40€ a class' },
      { label: 'Where', value: 'Pick-up · 14:30' }
    ],
    extras: ['Gear included', 'Beginner friendly'],
    askEn: 'Sign up at reception.',
    askEs: 'Apúntate en recepción.',
    ctaEn: 'Follow the link or ask at reception.',
    ctaEs: 'Sigue el link o pregunta en recepción.',
    url: 'nestshostels.com/events',
    photo: 'assets/flyer-surf-lesson.png'
  },
  {
    /* The stress test: a 4-word headline, a Spanish line twice the English
       length, a two-line price and a long venue name. If the template holds
       here it holds anywhere. */
    id: 'sunrise-hike',
    label: 'Long copy · stress test',
    hostel: 'Los Amigos Nest',
    headline1: 'Sunrise hike above',
    headline2: 'the sea of clouds.',
    headlineEs: 'Excursión al amanecer por encima del mar de nubes del Teide, con guía local y desayuno arriba.',
    chips: [
      { label: 'When', value: 'Saturday 27/9 · 05:30' },
      { label: 'Cost', value: '25€ with breakfast · 18€ without' },
      { label: 'Where', value: 'Playa de las Américas · Av. Rafael Puig 12' }
    ],
    extras: ['Six hours', 'Bring a jacket', 'Twelve seats', 'Moderate walk'],
    askEn: 'Sign up at reception.',
    askEs: 'Apúntate en recepción.',
    ctaEn: 'Twelve seats only — follow the link or ask at reception.',
    ctaEs: 'Solo doce plazas. Sigue el link o pregunta en recepción.',
    url: 'nestshostels.com/events'
  },
  {
    id: 'paragliding',
    label: 'Paragliding',
    hostel: 'Duque Nest',
    headline1: 'Step off',
    headline2: 'and fly.',
    headlineEs: 'Vuela sobre el sur de Tenerife.',
    chips: [
      { label: 'When', value: 'Most mornings' },
      { label: 'Cost', value: '90€' },
      { label: 'Where', value: 'Meet at reception' }
    ],
    extras: ['Tandem flight', 'Photos included'],
    askEn: 'Sign up at reception.',
    askEs: 'Apúntate en recepción.',
    ctaEn: 'Follow the link or ask at reception.',
    ctaEs: 'Sigue el link o pregunta en recepción.',
    url: 'nestshostels.com/events'
  },
  {
    id: 'pizza-weekly',
    label: 'Pizza · weekly',
    hostel: 'Duque Nest',
    headline1: 'Family dinner,',
    headline2: 'every Friday.',
    headlineEs: 'Cena en familia — todos los viernes.',
    chips: [
      { label: 'When', value: 'Fridays · 20:30' },
      { label: 'Cost', value: '8€ with a drink' },
      { label: 'Where', value: 'The terrace' }
    ],
    extras: ['Vegan option', 'Everyone welcome'],
    askEn: 'Sign up at reception.',
    askEs: 'Apúntate en recepción.',
    ctaEn: 'Follow the link or ask at reception.',
    ctaEs: 'Sigue el link o pregunta en recepción.',
    url: 'nestshostels.com/events',
    photo: 'assets/flyer-pizza-night.png'
  }
];
