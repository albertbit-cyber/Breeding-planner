// Species taxonomy transcribed from the MorphMarket Categories menu, captured 2026-08-09.
//
// Shape: group -> species -> variants (localities, subspecies, or market sub-categories).
// Only the `species` level is a breedable selection in the app; `variants` exist so a
// keeper can record "Coastal Carpet Python" without us minting a separate trait table
// for every locality.
//
// AMPHIBIANS is not from the category tree -- that document covers reptiles only. Axolotls
// carry a Morphpedia trait table, so they need a home; grouping them under Amphibians keeps
// the reptile taxonomy faithful to its source rather than bending it to fit.

export const TAXONOMY = [
  {
    id: 'pythons',
    name: 'Pythons',
    species: [
      { id: 'ball-python', name: 'Ball Pythons' },
      { id: 'reticulated-python', name: 'Reticulated Pythons' },
      { id: 'burmese-python', name: 'Burmese Pythons' },
      {
        id: 'short-tailed-python',
        name: 'Short-Tailed Pythons',
        variants: ['Blood Pythons', 'Borneo Short-Tailed Pythons', 'Sumatran Short-Tailed Pythons'],
      },
      { id: 'green-tree-python', name: 'Green Tree Pythons' },
      {
        id: 'carpet-python',
        name: 'Carpet Pythons',
        variants: [
          'Inland Carpet Pythons', 'Coastal Carpet Pythons', 'Diamond Carpet Pythons',
          'Centralian Carpet Pythons', 'Darwin Carpet Pythons', 'Irian Jaya Carpet Pythons',
          'Jungle Carpet Pythons', 'Southern Carpet Pythons', 'Other Carpet Pythons',
        ],
      },
      {
        id: 'other-pythons',
        name: 'Other Pythons',
        variants: [
          'Spotted Pythons', 'Angolan Pythons', 'Black-Headed Pythons', 'Olive Pythons',
          'Woma Pythons', "Children's Pythons", 'White-Lipped Pythons', "Macklot's Pythons",
          'Rough-Scaled Pythons', 'Scrub Pythons', 'Water Pythons', 'Pygmy Pythons',
          "Stimson's Pythons", 'Rock Pythons', 'Timor Pythons', "Boelen's Pythons",
          'Hybrid Pythons', 'More Pythons',
        ],
      },
    ],
  },
  {
    id: 'boas',
    name: 'Boas',
    species: [
      {
        id: 'boa-constrictor',
        name: 'Boa Constrictors',
        variants: [
          'Peruvian Long-Tailed Boa Constrictors', 'Short-Tailed Boa Constrictors',
          'Boa Constrictors (Common)', 'Argentine Boa Constrictors',
          'Pearl Island Boa Constrictors', 'True Red-Tailed Boa Constrictors',
        ],
      },
      {
        id: 'rainbow-boa',
        name: 'Rainbow Boas',
        variants: ['Argentine Rainbow Boas', 'Brazilian Rainbow Boas', 'Colombian Rainbow Boas'],
      },
      {
        id: 'sand-boa',
        name: 'Sand Boas',
        variants: [
          'Indian Sand Boas', 'Javelin Sand Boas', 'Rough-Scaled Sand Boas', 'Saharan Sand Boas',
          'Tartar Sand Boas', 'Other Sand Boas', 'Russian Sand Boas', 'Kenyan Sand Boas',
          'Arabian Sand Boas', 'Central Asian Sand Boas',
        ],
      },
      {
        id: 'tree-boa',
        name: 'Tree Boas',
        variants: [
          'Amazon Basin Tree Boas', 'Annulated Tree Boas', 'Central American Tree Boas',
          'Grenadian Tree Boas', 'Northern Emerald Tree Boas', 'Amazon Tree Boas',
          'Other Tree Boas',
        ],
      },
      { id: 'dumerils-boa', name: "Dumeril's Boas" },
      { id: 'rosy-boa', name: 'Rosy Boas' },
      {
        id: 'other-boas',
        name: 'Other Boas',
        variants: [
          'Hispaniolan Boas', 'Viper Boas', 'Solomon Island Boas', 'Anacondas', 'Rubber Boas',
          'Hybrid Boas', 'More Boas',
        ],
      },
    ],
  },
  {
    id: 'colubrids',
    name: 'Colubrids',
    species: [
      {
        id: 'hognose-snake',
        name: 'Hognose Snakes',
        variants: [
          'Eastern Hognose', 'Malagasy Giant Hognose', 'Ringed Hognose', 'South American Hognose',
          'Speckled Hognose', 'Tri-Color Hognose', 'Blonde Hognose', 'Mexican Hognose',
          'Southern Hognose', 'Other Hognose', 'Western Hognose', "Jan's Hognose",
        ],
      },
      {
        id: 'kingsnake',
        name: 'Kingsnakes',
        variants: [
          'California Kingsnakes', 'Mexican Black Kingsnakes', 'Florida Kingsnakes',
          'Arizona Mountain Kingsnakes', "Brooks' Kingsnakes", 'Gray-Banded Kingsnakes',
          'Nuevo Leon Kingsnakes', 'San Luis Potosi Kingsnakes', 'Apalachicola Kingsnakes',
          'Speckled Kingsnakes', 'Eastern Kingsnakes', 'Desert Kingsnakes',
          "Ruthven's Kingsnakes", 'Baja Cape Kingsnakes', 'Eastern Black Kingsnakes',
          'Lampropeltis Webbi Kingsnakes', 'Coast Mountain Kingsnakes',
          'Durango Mountain Kingsnakes', 'Sierra Mountain Kingsnakes', 'South Florida Kingsnakes',
          'St. Helena Kingsnakes', 'Chihuahua Mountain Kingsnakes',
          'Lampropeltis Zonata Kingsnakes', 'Mole Kingsnakes', 'Todos Santos Island Kingsnakes',
          'Utah Mountain Kingsnakes', 'Prairie Kingsnakes', 'San Bernardino Mountain Kingsnakes',
          'San Diego Mountain Kingsnakes', 'San Pedro Kingsnakes', 'Scarlet Kingsnakes',
          'Isla Santa Catalina Kingsnakes',
        ],
      },
      {
        id: 'milk-snake',
        name: 'Milk Snakes',
        variants: [
          'Honduran Milk Snakes', 'Pueblan Milk Snakes', "Nelson's Milk Snakes",
          'Black Milk Snakes', 'Sinaloan Milk Snakes', 'Eastern Milk Snakes',
          'Ecuadoran Milk Snakes', 'Guatemalan Milk Snakes', 'Louisiana Milk Snakes',
          'New Mexico Milk Snakes', 'Pacific American Milk Snakes', "Smith's Milk Snakes",
          "Stuart's Milk Snakes", 'Utah Milk Snakes', "Blanchard's Milk Snakes",
          'Mexican Milk Snakes', 'Red Milk Snakes', 'Andean Milk Snakes',
          'Atlantic Central American Milk Snakes', 'Central Plains Milk Snakes',
          'Jalisco Milk Snakes', 'Coastal Plains Milk Snakes', 'Pale Milk Snakes',
          "Conant's Milk Snakes", "Dixon's Milk Snakes",
        ],
      },
      { id: 'corn-snake', name: 'Corn Snakes' },
      {
        id: 'rat-snake',
        name: 'Rat Snakes',
        variants: [
          'Red-Tailed Green Rat Snakes', 'Trans-Pecos Rat Snakes', 'Western Rat Snakes',
          'Gray Rat Snakes', 'Mandarin Rat Snakes', 'Other Rat Snakes', 'Eastern Rat Snakes',
          'Bamboo Rat Snakes', 'Beauty Rat Snakes', "Baird's Rat Snakes", 'Green Rat Snakes',
        ],
      },
      { id: 'bullsnake', name: 'Bullsnakes' },
      { id: 'garter-snake', name: 'Garter Snakes' },
      { id: 'gopher-snake', name: 'Gopher Snakes' },
      { id: 'house-snake', name: 'House Snakes' },
      { id: 'pine-snake', name: 'Pine Snakes' },
      {
        id: 'other-colubrids',
        name: 'Other Colubrids',
        variants: [
          'Cribo & Indigo Snakes', 'Coachwhips', 'Ribbon Snakes', 'Water Snakes',
          'False Water Cobras', 'Hybrid Colubrids', 'More Colubrids',
        ],
      },
    ],
  },
  {
    id: 'geckos',
    name: 'Geckos',
    species: [
      { id: 'crested-gecko', name: 'Crested Geckos' },
      { id: 'leopard-gecko', name: 'Leopard Geckos' },
      { id: 'gargoyle-gecko', name: 'Gargoyle Geckos' },
      { id: 'leachianus-gecko', name: 'Leachianus Geckos' },
      { id: 'african-fat-tailed-gecko', name: 'African Fat-Tailed Geckos' },
      { id: 'chahoua-gecko', name: 'Chahoua Geckos' },
      { id: 'day-gecko', name: 'Day Geckos' },
      { id: 'knob-tailed-gecko', name: 'Knob-Tailed Geckos' },
      { id: 'tokay-gecko', name: 'Tokay Geckos' },
      {
        id: 'other-geckos',
        name: 'Other Geckos',
        variants: [
          'Leaf-Tailed Geckos', 'Chameleon Geckos', 'Mourning Geckos', 'Cave Geckos',
          'Banded Geckos', 'Viper Geckos', 'More Geckos',
        ],
      },
    ],
  },
  {
    id: 'lizards',
    name: 'Lizards',
    species: [
      {
        id: 'bearded-dragon',
        name: 'Bearded Dragons',
        variants: [
          'Dwarf Bearded Dragons', "Rankin's Dragons", 'Central Bearded Dragons',
          'Eastern Bearded Dragons',
        ],
      },
      {
        id: 'skink',
        name: 'Skinks',
        variants: [
          'Northern Blue-Tongued Skinks', 'Eastern Blue-Tongued Skinks',
          'Halmahera Blue-Tongued Skinks', 'Indonesian Blue-Tongued Skinks',
          'Irian Jaya Blue-Tongued Skinks', 'Kei Island Blue-Tongued Skinks',
          'Merauke Blue-Tongued Skinks', 'Other Blue-Tongued Skinks',
          'Tanimbar Blue-Tongued Skinks', 'Western Blue-Tongued Skinks', 'Fire Skinks',
          'Monkey-Tailed Skinks', 'Pink-Tongued Skinks', 'More Skinks',
        ],
      },
      {
        id: 'tegu',
        name: 'Tegus',
        variants: [
          'Other Tegus', 'Argentine Tegus', 'Columbian Tegus', 'Crocodile Tegus',
          'Caiman Lizards', 'Whiptail Lizards',
        ],
      },
      {
        id: 'monitor',
        name: 'Monitors',
        variants: [
          'Ackie Monitors', 'Savannah Monitors', 'Black-Throated Monitors', 'Mangrove Monitors',
          'Nile Monitors', 'Other Monitors', 'Water Monitors', 'Crocodile Monitors',
          "Dumeril's Monitors", 'Black Roughneck Monitors', 'Blue Tree Monitors',
          'Green Tree Monitors', 'Biak Tree Monitors', 'Black Tree Monitors',
          'Golden-Spotted Tree Monitors', 'Yellow Tree Monitors', 'White-Throated Monitors',
        ],
      },
      {
        id: 'iguana',
        name: 'Iguanas',
        variants: [
          'Green Iguanas', 'Central American Iguanas', 'Grenadines Horned Iguanas',
          'Lesser Antillean Iguanas', 'Saban Black Iguanas', 'Other Iguanas',
        ],
      },
      {
        id: 'chameleon',
        name: 'Chameleons',
        variants: [
          'Bearded Pygmy Chameleons', 'Spectral Pygmy Chameleons', 'Usambara Chameleons',
          'More Chameleons', "Jackson's Chameleons", 'Panther Chameleons', "Parson's Chameleons",
          'Veiled Chameleons',
        ],
      },
      { id: 'anole', name: 'Anoles' },
      { id: 'uromastyx', name: 'Uromastyx' },
      {
        id: 'other-lizards',
        name: 'Other Lizards',
        variants: [
          'Collared Lizards', 'Frilled Lizards', 'Gila Monsters', 'Lacertas', 'Legless Lizards',
          'Sailfin Dragons', 'Chinese Water Dragons', 'Eastern Water Dragons',
          'Gippsland Water Dragons', 'Australian Water Dragons', 'Agamas', 'Alligator Lizards',
          'Beaded Lizards', 'More Lizards',
        ],
      },
    ],
  },
  {
    id: 'tortoises',
    name: 'Tortoises',
    species: [
      { id: 'aldabra-tortoise', name: 'Aldabra Tortoises' },
      { id: 'galapagos-tortoise', name: 'Galapagos Tortoises' },
      { id: 'greek-tortoise', name: 'Greek Tortoises' },
      { id: 'hermanns-tortoise', name: "Hermann's Tortoises" },
      { id: 'star-tortoise', name: 'Star Tortoises' },
      { id: 'leopard-tortoise', name: 'Leopard Tortoises' },
      { id: 'red-footed-tortoise', name: 'Red-Footed Tortoises' },
      { id: 'russian-tortoise', name: 'Russian Tortoises' },
      { id: 'sulcata-tortoise', name: 'Sulcata Tortoises' },
      {
        id: 'other-tortoises',
        name: 'Other Tortoises',
        variants: [
          'Asian Brown Tortoises', "Bell's Hingeback Tortoises", 'Elongated Tortoises',
          'Forest Hinge-Back Tortoises', "Forsten's Tortoises", "Home's Hinge-Back Tortoises",
          'Impressed Tortoises', 'Marginated Tortoises', 'Pancake Tortoises',
          'Radiated Tortoises', "Speke's Hinge-Back Tortoises", 'Travancore Tortoises',
          'Yellow-Footed Tortoises', 'Egyptian Tortoises', 'Gopher Tortoises', 'More Tortoises',
        ],
      },
    ],
  },
  {
    id: 'turtles',
    name: 'Turtles',
    species: [
      { id: 'slider-turtle', name: 'Slider Turtles' },
      { id: 'box-turtle', name: 'Box Turtles' },
      { id: 'terrapin', name: 'Terrapins' },
      { id: 'snake-necked-turtle', name: 'Snake-Necked Turtles' },
      { id: 'side-necked-turtle', name: 'Side-Necked Turtles' },
      { id: 'mud-musk-turtle', name: 'Mud & Musk Turtles' },
      { id: 'pond-turtle', name: 'Pond Turtles' },
      { id: 'softshell-turtle', name: 'Softshell Turtles' },
      {
        id: 'other-turtles',
        name: 'Other Turtles',
        variants: [
          'Map Turtles', 'Painted Turtles', 'Snapping Turtles', 'Wood Turtles',
          'Fly River Turtles', 'More Turtles',
        ],
      },
    ],
  },
  {
    id: 'amphibians',
    name: 'Amphibians',
    sourceNote: 'Not present in the MorphMarket category tree; added to host Axolotls.',
    species: [
      { id: 'axolotl', name: 'Axolotls' },
    ],
  },
];

// Scientific names are not in either source document. Filled in only for the species that
// carry a trait table, so the app can show a latin name where it already shows morphs.
export const SCIENTIFIC_NAMES = {
  'ball-python': 'Python regius',
  'reticulated-python': 'Malayopython reticulatus',
  'burmese-python': 'Python bivittatus',
  'short-tailed-python': 'Python brongersmai',
  'green-tree-python': 'Morelia viridis',
  'carpet-python': 'Morelia spilota',
  'boa-constrictor': 'Boa constrictor',
  'rainbow-boa': 'Epicrates cenchria',
  'sand-boa': 'Eryx colubrinus',
  'hognose-snake': 'Heterodon nasicus',
  'kingsnake': 'Lampropeltis getula',
  'milk-snake': 'Lampropeltis triangulum',
  'corn-snake': 'Pantherophis guttatus',
  'crested-gecko': 'Correlophus ciliatus',
  'leopard-gecko': 'Eublepharis macularius',
  'gargoyle-gecko': 'Rhacodactylus auriculatus',
  'leachianus-gecko': 'Rhacodactylus leachianus',
  'african-fat-tailed-gecko': 'Hemitheconyx caudicinctus',
  'chahoua-gecko': 'Mniarogekko chahoua',
  'bearded-dragon': 'Pogona vitticeps',
  'axolotl': 'Ambystoma mexicanum',
};

// Reproduction mode drives clutch-vs-litter wording and whether incubation applies.
// Boas and garter snakes are live-bearing; everything else here lays eggs.
export const LIVE_BEARING_SPECIES = new Set([
  'boa-constrictor',
  'rainbow-boa',
  'sand-boa',
  'tree-boa',
  'dumerils-boa',
  'rosy-boa',
  'other-boas',
  'garter-snake',
]);
