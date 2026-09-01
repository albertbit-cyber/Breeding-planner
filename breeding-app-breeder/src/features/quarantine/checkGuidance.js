// What to look at, how to look at it, and how to tell good from bad.
//
// The observation fields elsewhere in this feature ask a breeder to answer "mites: none or seen?".
// That question is only useful if they know where mites hide and what they look like. This is the
// answer to that, attached to a "?" beside every field.
//
// `point` places the check on the illustrations in SnakeCheckMap. There are two drawings, both on
// the same 2945x1362 canvas but not registered to each other: `body` is the whole animal from
// above, `head` is the head in profile. A check can appear on either or both, and `prefer` says
// which view to show when it is selected -- the head drawing has a real eye, nostril and labial
// scales, so anything you assess up close belongs there, while length-wise checks belong on the
// body. Within each view, `at` is the anatomical spot and `label` is where the numbered marker
// sits, off the drawing, with a hairline leading back. Checks with no point (stool) are still
// explained, they just have nowhere sensible to pin.

export const CHECK_GUIDANCE = [
  {
    key: 'mites',
    title: 'Mites',
    point: {
      n: '1',
      prefer: 'head',
      body: { at: [650, 665], label: [575, 1090] },
      head: { at: [1271, 883], label: [1430, 1235] },
    },
    lookFor: 'Pinhead-sized black or dark red specks that move, plus the grey ash-like dust of their droppings on the scales.',
    howTo: [
      'Check the eye rim first — mites collect in the crease around the spectacle where they cannot be dislodged.',
      'Run a thumb under the chin and along the throat grooves.',
      'Lift the animal and look at the vent and the scale seams either side of it.',
      'Wipe the snake with a white paper towel — specks show up against white that you will never see against a patterned snake.',
      'Look at the water bowl. Drowned mites float, and are often the first sign anyone sees.',
    ],
    normal: 'Clean scale seams. Nothing on the towel, nothing in the water.',
    concerning: 'Moving specks around the eye or vent, dark grit in scale seams, or black dots floating in the water bowl.',
    urgency: 'act',
    note: 'Mites are the single most common thing quarantine catches. Finding them means treating and restarting the clock — you are now timing the treatment, not the settling in.',
  },
  {
    key: 'eyes',
    title: 'Eyes',
    point: {
      n: '2',
      prefer: 'head',
      body: { at: [470, 612], label: [285, 350] },
      head: { at: [1189, 817], label: [955, 355] },
    },
    lookFor: 'Both eyes equally full, round and clear, with the spectacle smooth and unwrinkled.',
    howTo: [
      'Look at both eyes from the side, at the animal’s own level rather than from above.',
      'Compare left to right — asymmetry is easier to spot than a subtle change in both.',
      'A uniform blue-grey haze across both eyes with no other signs is almost always the shed cycle, not illness.',
    ],
    normal: 'Clear, convex and glossy. Or evenly blue during the shed cycle.',
    concerning: 'Sunken or wrinkled eyes (dehydration), one eye cloudy while the other is clear, retained spectacle from a previous shed, or discharge.',
    urgency: 'watch',
  },
  {
    key: 'breathing',
    title: 'Breathing',
    point: {
      n: '3',
      prefer: 'head',
      body: { at: [295, 672], label: [200, 1105] },
      head: { at: [949, 891], label: [545, 1065] },
    },
    lookFor: 'Silent breathing with a closed mouth and clean, dry nostrils.',
    howTo: [
      'Hold the animal near your ear in a quiet room for fifteen seconds and simply listen.',
      'Look at the nostrils for bubbles, crusting or discharge.',
      'Watch how it rests. A snake that holds its head raised, or stretches its neck to breathe, is working at it.',
      'Open-mouth breathing in a snake at normal temperature is never normal.',
    ],
    normal: 'Nothing to hear. Nostrils clean and dry, mouth closed, head resting normally.',
    concerning: 'Clicking, whistling or wheezing; bubbles or mucus at the nostrils or mouth; gaping; head held up to breathe; excess saliva.',
    urgency: 'act',
    note: 'In pythons this is the sign that raises the serpentovirus question. Worth a vet call rather than a wait-and-see.',
  },
  {
    key: 'condition',
    title: 'Body condition',
    point: {
      n: '4',
      prefer: 'body',
      body: { at: [1290, 1150], label: [700, 1235] },
    },
    lookFor: 'A rounded body in cross-section, with the spine palpable but not standing proud.',
    howTo: [
      'Feel along the mid-body with a flat hand rather than judging by eye — patterning hides a lot.',
      'A healthy snake is a rounded loaf shape in cross-section, not a triangle and not a tube.',
      'Weigh weekly and trust the trend over the impression. Fifty grams lost over a month is invisible to the eye and obvious in a column of numbers.',
    ],
    normal: 'Rounded cross-section, spine felt but not ridged, no loose folds of skin along the flanks.',
    concerning: 'A pronounced spinal ridge with the body triangular in section, hip bones or ribs showing, loose skin, or a localised swelling anywhere along the body.',
    urgency: 'watch',
  },
  {
    key: 'vent',
    title: 'Vent',
    point: {
      n: '5',
      prefer: 'body',
      body: { at: [2450, 655], label: [2375, 960] },
    },
    lookFor: 'A clean, flat, closed vent with normal scales either side.',
    howTo: [
      'Turn the animal over and look at the vent scale directly.',
      'Check the seams either side — a favourite place for mites and for stuck shed.',
      'Note any smearing, and whether it is fresh.',
    ],
    normal: 'Clean, dry and flat, with the scales either side lying smooth.',
    concerning: 'Swelling, redness, smeared or pasted faeces, prolapsed tissue, or stuck shed rings around the tail base.',
    urgency: 'act',
  },
  {
    key: 'skin',
    title: 'Skin and scales',
    point: {
      n: '6',
      prefer: 'body',
      body: { at: [1900, 420], label: [2350, 175] },
      head: { at: [1620, 500], label: [2265, 330] },
    },
    lookFor: 'Even, intact scale rows with no raised, discoloured or missing scales.',
    howTo: [
      'Run the animal slowly through your hands and look at the whole length, belly included.',
      'Belly scales are where damage shows first — check them against the substrate the animal came off.',
      'Note anything raised, blistered, crusted or discoloured, and photograph it with the date.',
    ],
    normal: 'Smooth, even, intact scales. Belly scales flat and uniformly coloured.',
    concerning: 'Blisters, brown or yellow discolouration on belly scales, raised or crusted lesions, or scales lifting at the edges.',
    urgency: 'act',
    note: 'A dated photograph of a lesion is worth more than any description. If it changes, you will have the comparison.',
  },
  {
    key: 'shed',
    title: 'Shed',
    point: {
      n: '7',
      prefer: 'body',
      body: { at: [2660, 672], label: [2690, 385] },
    },
    lookFor: 'A shed that comes off in one piece, including the eye caps and the tail tip.',
    howTo: [
      'Find the shed and hold it up rather than glancing at it in the tub.',
      'Look for the two clear eye caps — if they are missing from the shed, they are still on the snake.',
      'Check the tail tip, which is where retained rings do real damage.',
    ],
    normal: 'One complete piece, inside out, with both eye caps and an intact tail tip.',
    concerning: 'Shed coming off in fragments, missing eye caps, or a retained ring around the tail. Repeated bad sheds point at humidity, hydration or an underlying problem.',
    urgency: 'watch',
  },
  {
    key: 'stool',
    title: 'Stool and urates',
    point: null,
    lookFor: 'Formed, dark faeces with a firm white urate — and passed on a schedule that matches what the animal is eating.',
    howTo: [
      'Note the date every time something is passed. The gap between them is the useful number.',
      'Look at the urate as well as the faeces — chalky white and firm is right.',
      'If a sample is going to the vet, collect it fresh and keep it cool. A four-day-old sample answers a different question.',
    ],
    normal: 'Formed and dark, with a firm white urate, appearing a few days after each meal.',
    concerning: 'Watery or mucoid stool, undigested prey, a foul smell beyond the usual, yellow or green urates, blood, or nothing passed at all for weeks while the animal is eating.',
    urgency: 'act',
    note: 'This is the observation that decides whether a faecal sample is worth sending, so it is worth logging even when nothing has happened.',
  },
];

export const GUIDANCE_BY_KEY = Object.fromEntries(CHECK_GUIDANCE.map(entry => [entry.key, entry]));

export function getGuidance(key) {
  return GUIDANCE_BY_KEY[key] || null;
}

export const MAPPED_CHECKS = CHECK_GUIDANCE.filter(entry => entry.point);

/** Checks that appear on a given drawing, in listed order. */
export function getChecksForView(view) {
  return MAPPED_CHECKS.filter(entry => entry.point[view]);
}

/** Which drawing to show for a check — the head plate for anything assessed up close. */
export function getPreferredView(key) {
  const entry = GUIDANCE_BY_KEY[key];
  if (!entry?.point) return null;
  const preferred = entry.point.prefer;
  if (preferred && entry.point[preferred]) return preferred;
  return entry.point.body ? 'body' : 'head';
}
