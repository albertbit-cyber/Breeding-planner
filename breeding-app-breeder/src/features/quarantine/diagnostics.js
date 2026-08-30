// Reference data for quarantine diagnostics: what the tests are, what each one actually rules in
// or out, and where samples can be sent.
//
// This is a static reference, deliberately separate from the ProHerper lab catalog in
// src/data/testCatalog.ts. That catalog is a priced, orderable list of *genetic* tests wired to
// the lab ordering pipeline. These are *health* tests, ordered through a vet, and the app has no
// business quoting prices or taking orders for them. Everything here is information only.
//
// Nothing in this file is medical advice, and the app never tells a breeder to run a test. It
// tells them what exists so they can have a better conversation with their vet.

export const SAMPLE_TYPES = {
  feces: 'Fresh faeces',
  cloacalSwab: 'Cloacal swab',
  oralSwab: 'Oral / tracheal swab',
  tracheal: 'Tracheal wash',
  skin: 'Skin swab or shed',
  blood: 'Blood',
};

/**
 * Ordered roughly by how early in a quarantine a breeder is likely to reach for them.
 * `whenTypical` maps onto the phase model: what a normal quarantine actually schedules.
 */
export const QUARANTINE_TESTS = [
  {
    key: 'fecal-float',
    name: 'Faecal flotation',
    short: 'Faecal float',
    method: 'Microscopy',
    detects: 'Nematode and cestode eggs, coccidia oocysts — the common gut parasites.',
    samples: ['feces'],
    turnaround: '1–2 business days',
    whenTypical: 'Weeks 2–3, then roughly every 4 weeks',
    limitation: 'Parasites shed intermittently, so one clean float proves very little. Centrifugal flotation is more sensitive than a simple float — worth asking which your vet runs.',
    tier: 'baseline',
  },
  {
    key: 'direct-smear',
    name: 'Direct faecal smear',
    short: 'Direct smear',
    method: 'Microscopy',
    detects: 'Motile protozoa (flagellates, amoebae, Giardia) in their active feeding stage.',
    samples: ['feces'],
    turnaround: 'Same day',
    whenTypical: 'Alongside the first faecal float',
    limitation: 'Must be genuinely fresh and kept warm — motile organisms stop moving and become invisible within minutes to hours.',
    tier: 'baseline',
  },
  {
    key: 'acid-fast',
    name: 'Acid-fast stain',
    short: 'Acid-fast',
    method: 'Stained microscopy',
    detects: 'Cryptosporidium oocysts.',
    samples: ['feces'],
    turnaround: '1–2 business days',
    whenTypical: 'When regurgitation or a mid-body swelling raises the question',
    limitation: 'Much less sensitive than PCR, and cannot distinguish the snake-pathogenic C. serpentis from harmless rodent Cryptosporidium passing through from a meal.',
    tier: 'baseline',
  },
  {
    key: 'crypto-pcr',
    name: 'Cryptosporidium PCR',
    short: 'Crypto PCR',
    method: 'qPCR',
    detects: 'C. serpentis and C. varanii specifically, separating true infection from rodent-prey pass-through.',
    samples: ['feces', 'cloacalSwab'],
    turnaround: '3–5 business days',
    whenTypical: 'On suspicion, or as part of an intake panel for higher-risk sources',
    limitation: 'Sampling site matters a great deal: in comparison studies a cloacal swab reached about 72% sensitivity where gastric samples reached 100%. A negative cloacal swab is weaker evidence than it looks.',
    tier: 'molecular',
  },
  {
    key: 'serpentovirus-pcr',
    name: 'Serpentovirus (nidovirus) PCR',
    short: 'Serpentovirus PCR',
    method: 'RT-PCR',
    detects: 'Serpentoviruses — the respiratory pathogen behind most python nidovirus outbreaks.',
    samples: ['oralSwab', 'tracheal'],
    turnaround: '3–7 business days',
    whenTypical: 'Intake panel for pythons; immediately on any respiratory sign',
    limitation: 'Deep tracheal swabs or a tracheal wash are the preferred clinical samples — a shallow mouth swab can miss it. Infection can persist and shed intermittently, which is the entire argument for long python quarantines.',
    tier: 'molecular',
  },
  {
    key: 'arenavirus-pcr',
    name: 'Reptarenavirus PCR (IBD)',
    short: 'IBD PCR',
    method: 'RT-PCR',
    detects: 'Reptarenaviruses associated with inclusion body disease.',
    samples: ['blood', 'oralSwab'],
    turnaround: '5–10 business days',
    whenTypical: 'Boas and pythons from unknown sources; any neurological sign',
    limitation: 'A negative does not clear an animal — the virus is not always detectable in blood, and the classic confirmation is inclusion bodies on biopsy. Neurological signs outweigh a negative result.',
    tier: 'molecular',
  },
  {
    key: 'adenovirus-pcr',
    name: 'Adenovirus PCR',
    short: 'Adenovirus PCR',
    method: 'PCR',
    detects: 'Reptile adenoviruses, most associated with hepatitis and enteritis.',
    samples: ['feces', 'cloacalSwab', 'oralSwab'],
    turnaround: '3–7 business days',
    whenTypical: 'Unexplained wasting, hepatic signs, or sudden juvenile deaths',
    limitation: 'Shedding is intermittent, so a single negative on a suspect animal is worth repeating.',
    tier: 'molecular',
  },
  {
    key: 'ophidiomyces-pcr',
    name: 'Ophidiomyces PCR',
    short: 'SFD PCR',
    method: 'qPCR',
    detects: 'Ophidiomyces ophiodiicola — snake fungal disease.',
    samples: ['skin'],
    turnaround: '3–5 business days',
    whenTypical: 'Any crusting, blistering or unexplained scale lesion',
    limitation: 'A skin swab of a lesion is far more informative than a swab of clean scales. Shed skin can also be submitted.',
    tier: 'molecular',
  },
  {
    key: 'culture',
    name: 'Bacterial culture and sensitivity',
    short: 'Culture & sens.',
    method: 'Culture',
    detects: 'Bacterial overgrowth and which antibiotics it responds to.',
    samples: ['oralSwab', 'cloacalSwab', 'skin'],
    turnaround: '3–7 business days',
    whenTypical: 'Mouth rot, respiratory infection, or an infected lesion',
    limitation: 'Reptiles carry a normal bacterial flora, so a positive culture needs clinical signs alongside it to mean anything.',
    tier: 'targeted',
  },
  {
    key: 'exam',
    name: 'Veterinary examination',
    short: 'Vet exam',
    method: 'Clinical',
    detects: 'Everything a photograph and a spreadsheet cannot — hydration, body condition, oral cavity, palpation.',
    samples: [],
    turnaround: 'Same day',
    whenTypical: 'Once during quarantine at minimum; twice for high-risk sources',
    limitation: 'Find a vet who actually sees reptiles. A general small-animal practice will do its best and miss things.',
    tier: 'baseline',
  },
];

export const TEST_TIERS = {
  baseline: { label: 'Baseline', note: 'What most quarantines run as a matter of course.' },
  molecular: { label: 'Molecular (PCR)', note: 'Sent to a specialist lab. Higher sensitivity, higher cost, longer wait.' },
  targeted: { label: 'On suspicion', note: 'Run in response to a specific finding rather than routinely.' },
};

/**
 * Labs known to run reptile diagnostics. Deliberately not exhaustive and deliberately unpriced --
 * this is a starting point for a conversation with a vet, not a shopping list. Most of these
 * require submission through a veterinarian rather than direct from a keeper.
 */
export const DIAGNOSTIC_LABS = [
  {
    key: 'zoologix',
    name: 'Zoologix',
    region: 'United States (accepts international)',
    url: 'https://www.zoologix.com/',
    offers: ['crypto-pcr', 'ophidiomyces-pcr', 'adenovirus-pcr', 'serpentovirus-pcr', 'arenavirus-pcr'],
    note: 'Runs a dedicated snake and lizard quarantine PCR panel (Ophidiomyces, C. serpentis, C. varanii and Cryptosporidium spp.) with a roughly 3 business day turnaround. Accepts faeces plus a skin swab, shed skin, or an enclosure surface swab.',
    direct: true,
  },
  {
    key: 'ral',
    name: 'Research Associates Laboratory',
    region: 'United States',
    url: 'https://www.vetdna.com/',
    offers: ['crypto-pcr', 'serpentovirus-pcr', 'adenovirus-pcr', 'arenavirus-pcr'],
    note: 'Long-standing reptile and amphibian panel provider, widely used by keepers and breeders. Supplies collection kits for submissions.',
    direct: true,
  },
  {
    key: 'uf',
    name: 'University of Florida, College of Veterinary Medicine',
    region: 'United States',
    url: 'https://www.vetmed.ufl.edu/',
    offers: ['serpentovirus-pcr', 'arenavirus-pcr', 'adenovirus-pcr'],
    note: 'Much of the published serpentovirus work came out of here. A reference option for unusual or contested results.',
    direct: false,
  },
  {
    key: 'illinois',
    name: 'University of Illinois Veterinary Diagnostic Laboratory',
    region: 'United States',
    url: 'https://vdl.vetmed.illinois.edu/wildlife-epidemiology',
    offers: ['serpentovirus-pcr', 'crypto-pcr', 'ophidiomyces-pcr'],
    note: 'Wildlife Epidemiology lab runs real-time PCR for serpentovirus in snakes and consensus PCR across species.',
    direct: false,
  },
  {
    key: 'guelph',
    name: 'Animal Health Laboratory, University of Guelph',
    region: 'Canada',
    url: 'https://www.uoguelph.ca/ahl/services/serpentovirus-reptile-nidovirus-pcr',
    offers: ['serpentovirus-pcr', 'crypto-pcr'],
    note: 'Developed and publishes its own real-time serpentovirus RT-PCR assay.',
    direct: false,
  },
  {
    key: 'laboklin',
    name: 'LABOKLIN',
    region: 'Germany, with branches across Europe and the UK',
    url: 'https://laboklin.com/en/',
    offers: ['crypto-pcr', 'adenovirus-pcr', 'serpentovirus-pcr', 'ophidiomyces-pcr', 'culture'],
    note: 'The most accessible option for European breeders. Broad reptile PCR range including adenovirus and combined-swab pathogen screens; submission is normally through a veterinarian.',
    direct: false,
  },
];

export function getTestByKey(key) {
  return QUARANTINE_TESTS.find(test => test.key === key) || null;
}

export function getLabsOfferingTest(key) {
  return DIAGNOSTIC_LABS.filter(lab => lab.offers.includes(key));
}

export function getTestsByTier(tier) {
  return QUARANTINE_TESTS.filter(test => test.tier === tier);
}
