import { MorphType } from "../types/pairing";

export const GENE_GROUPS: Record<string, string[]> = {
  Recessive: [
    "210 Hypo","Albino","Atomic","Axanthic","Axanthic (GCR)","Axanthic (Jolliff)","Axanthic (MJ)","Axanthic (TSK)","Axanthic (VPI)",
    "Bengal","Black Axanthic","Black Lace","Candy","Caramel Albino","Clown","Cryptic","Desert Ghost","Enhancer","Genetic Stripe",
    "Ghost (Vesper)","Hypo","Lavender Albino","Maple","Metal Flake","Migraine","Monarch","Monsoon","Moray","Orange Crush",
    "Orange Ghost","Paint","Patternless","Piebald","Puzzle","Rainbow","Sahara","Sandstorm","Sunset","Tornado","Tri-stripe",
    "Ultramel","Whitewash","Zebra"
  ],
  "Incomplete Dominant": [
    "Acid","Ajax","Alloy","Ambush","Arcane","Arroyo","Asphalt","Astro","Bald","Bambino","Bamboo","Banana","Bang","Black Head","Black Pastel",
    "Blade","Bongo","Butter","Cafe","Calico","Carbon","Carnivore","Champagne","Chino","Chocolate","Cinder","Cinnamon","Circle","Citron",
    "Coffee","Copper","Creed","Cypress","Dark Viking","Diesel","Disco","Dot","EMG","Enchi","Epic","Exo-lbb","Fire","Flame","FNR Vanilla",
    "Furrow","Fusion","Gaia","Gallium","GeneX","GHI","Glossy","Gobi","Granite","Gravel","Grim","Het Red Axanthic","Hidden Gene Woma",
    "Hieroglyphic","High Intensity OD","Honey","Huffman","Hydra","Jaguar","Java","Jedi","Jolliff Tiger","Jolt","Joppa","Jungle Woma","KRG",
    "Lace","LC Black Magic","Lemonback","Lesser","Mahogany","Mario","Marvel","Mckenzie","Melt","Microscale","Mocha","Mojave","Mosaic","Motley",
    "Mystic","Nanny","Nico","Nr Mandarin","Nyala","Odium","OFY","Orange Dream","Orbit","Panther","Pastel","Peach","Phantom","Phenomenon",
    "Pixel","Quake","Rain","RAR","Raven","Razor","Reaper","Red Gene","Red Stripe","Rhino","Russo","Saar","Sable","Sandblast","Sapphire",
    "Satin","Scaleless Head","Scrambler","Shadow","Sherg","Shrapnel","Shredder","Smuggler","Spark","Special","Specter","Spider","Splatter",
    "Spotnose","Stranger","Striker","Sulfur","Surge","Taronja","The Darkling","Trick","Trident","Trojan","Twister","Vanilla","Vudoo",
    "Web","Woma","Wookie","Wrecking Ball","X-treme Gene","X-tremist","Yellow Belly","Zuwadi"
  ],
  Dominant: [
    "Adder","AHI","Ashen","Black Belly","Confusion","Congo","Desert","Eramosa","Frost","Gold Blush","Harlequin","Het Daddy","Josie","Leopard",
    "Mordor","Nova","Oriole","Pinstripe","Redhead","Shatter","Splash","Static","Sunrise","Vesper","Zip Belly"
  ],
  Polygenic: ["Brown Back","Fader","Genetic Black Back","Genetic Reduced"],
  Other: ["Dinker","Hybrid","Normal","Paradox","RECO","Ringer","Ringer Mark"],
  Locality: ["Volta"],
};

export const PRIMARY_GENE_GROUPS = ["Recessive", "Incomplete Dominant", "Dominant", "Other"] as const;

export const GENE_ALIASES: Record<string, string> = {
  ultramelanistic: "Ultramel",
};

const RAW_GENE_GROUP_LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  Object.entries(GENE_GROUPS).forEach(([group, genes]) => {
    genes.forEach((gene) => {
      if (!gene) return;
      map.set(String(gene).trim().toLowerCase(), group);
    });
  });
  return map;
})();

export function normalizeGeneCandidate(raw: unknown): string {
  if (!raw) return "";
  return String(raw).trim().toLowerCase();
}

export function getGeneGroupFromDatabase(rawGene: unknown): string | null {
  if (!rawGene) return null;
  const seen = new Set<string>();
  const enqueue = (value: unknown) => {
    if (!value) return;
    const trimmed = String(value).trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
    }
  };

  const original = String(rawGene).trim();
  if (!original) return null;
  enqueue(original);

  const noParens = original.replace(/\(.*?\)/g, "").trim();
  if (noParens && noParens !== original) enqueue(noParens);

  const stripSuper = noParens.replace(/^super[\s-]+/i, "").trim();
  if (stripSuper && stripSuper !== noParens) enqueue(stripSuper);

  const camelSuper = noParens.match(/^super([A-Z].*)$/);
  if (camelSuper && camelSuper[1]) enqueue(camelSuper[1]);

  const aliasExpanded = GENE_ALIASES[noParens.toLowerCase()];
  if (aliasExpanded) enqueue(aliasExpanded);

  const axanthicVariant = original.match(/^\s*axanthic\s*\(([^)]+)\)/i);
  if (axanthicVariant && axanthicVariant[1]) {
    const variantRaw = axanthicVariant[1].replace(/\s+/g, " ").trim();
    if (variantRaw) {
      const lower = variantRaw.toLowerCase();
      const variantAliases = [
        { match: /tsk/, canonical: "TSK" },
        { match: /gcr/, canonical: "GCR" },
        { match: /jol(l|liff)/, canonical: "Jolliff" },
        { match: /mj/, canonical: "MJ" },
        { match: /vpi/, canonical: "VPI" },
      ];
      let canonicalVariant: string | null = null;
      for (const { match, canonical } of variantAliases) {
        if (match.test(lower)) {
          canonicalVariant = canonical;
          break;
        }
      }
      if (!canonicalVariant) {
        canonicalVariant = variantRaw.replace(/\s*line$/i, "").trim();
      }
      if (canonicalVariant) {
        enqueue(`Axanthic (${canonicalVariant})`);
      }
      enqueue("Axanthic");
    }
  }

  const stripLeadingHet = stripSuper.replace(/^(?:\d{1,3}%\s+)?(?:pos(?:s?i?a?ble)?\s+)?het\s+/i, "").trim();
  if (stripLeadingHet && stripLeadingHet !== stripSuper) enqueue(stripLeadingHet);

  const stripPercent = stripLeadingHet.replace(/^(?:\d{1,3}%\s*)/i, "").trim();
  if (stripPercent && stripPercent !== stripLeadingHet) enqueue(stripPercent);

  for (const candidate of seen) {
    const alias = GENE_ALIASES[candidate];
    if (alias) enqueue(alias);
  }

  for (const candidate of seen) {
    const key = normalizeGeneCandidate(candidate);
    if (RAW_GENE_GROUP_LOOKUP.has(key)) {
      return RAW_GENE_GROUP_LOOKUP.get(key) || null;
    }
  }
  return null;
}

export function normalizePrimaryGeneGroup(group: string | null | undefined): string {
  if (!group) return "Other";
  if (group === "Polygenic" || group === "Locality") return "Other";
  if (!PRIMARY_GENE_GROUPS.includes(group as typeof PRIMARY_GENE_GROUPS[number])) return "Other";
  return group;
}

export function getGeneDisplayGroup(rawGene: string | null | undefined): string {
  const group = getGeneGroupFromDatabase(rawGene);
  return normalizePrimaryGeneGroup(group);
}

export function inferMorphType(rawGene: string | null | undefined): MorphType {
  const group = getGeneDisplayGroup(rawGene);
  if (group === "Recessive") return "recessive";
  if (group === "Incomplete Dominant") return "co-dom";
  if (group === "Dominant") return "dominant";
  return "polygenic";
}
