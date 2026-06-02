export type MorphType = "dominant"|"co-dom"|"recessive"|"polygenic";

export type Morph = { name:string; type:MorphType };
export type Animal = { id:string; sex:"M"|"F"; morphs:Morph[]; hets:string[]; possibleHets?:string[] };

export type Outcome = { genotype:string[]; prob:number; flags:string[] };
export type Source = { title:string; url:string };
export type Demand = { index:number; priceBand:[number,number]|null; signals:string[]; sources:Source[] };

export type Goal = {
  id:string; name:string;
  requireAll:string[];
  requireAny?:string[];
  avoid?:string[];
  recessiveState?: "visual"|"het"|"possibleHet";
  minProb?:number;
  minOffspringCount?:number;
  weight?:number;
};

export type PlanStep = {
  generation: number;
  title: string;
  summary: string;
  maleId?: string;
  femaleId?: string;
  focusTraits?: string[];
  successProb?: number;
  prerequisiteProb?: number;
};

export type PlanProbabilityEntry = {
  label: string;
  probability: number;
  isGoal?: boolean;
};

export type PlanHoldbackSelection = {
  id: string;
  generation: number;
  pairingTitle: string;
  sourcePairingNodeId?: string;
  sourceOutcomeNodeId?: string;
  maleId?: string;
  femaleId?: string;
  traits: string[];
  probability: number;
  matchedGenes?: string[];
};

export type BreedingFlowchartNode = {
  id: string;
  generation: number;
  kind: "collection" | "pairing" | "outcome";
  title: string;
  subtitle?: string;
  animalId?: string;
  maleId?: string;
  femaleId?: string;
  expectedGenetics?: string[];
  probabilities?: PlanProbabilityEntry[];
  goalProbability?: number;
  isGoal?: boolean;
  isSelected?: boolean;
  matchedGenes?: string[];
  holdbackTraits?: string[];
};

export type BreedingFlowchartEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type BreedingFlowchartGraph = {
  nodes: BreedingFlowchartNode[];
  edges: BreedingFlowchartEdge[];
};

export type MultiGenPlan = {
  strategy: "direct" | "multi";
  steps: PlanStep[];
  cumulativeProb: number;
  holdbackTraits?: string[];
  holdbackProb?: number;
  matchedGenes?: string[];
  selectedHoldbacks?: PlanHoldbackSelection[];
  threshold?: number;
  generationLimit?: number;
  goalReached?: boolean;
  goalReachedGeneration?: number | null;
  flowchart?: BreedingFlowchartGraph;
};

export type Suggestion = {
  maleId:string; femaleId:string;
  outcomes:Outcome[];
  score:number;
  demand:Demand;
  risks:string[];
  sources:Source[];
  rationale:string;
  goalProb?:number;
  goalFit?:number;
  plan?:MultiGenPlan;
};

export type PairingExportMode = "default" | "byPairing";

export type PairingExportRow = {
  maleCode: string;
  maleName: string;
  femaleCode: string;
  femaleName: string;
  pairingOrder: number | string;
  status: string;
  seasonName?: string;
  startDate?: string;
  notes?: string;
  sortIndex?: number | null;
  orderWarning?: string | null;
};
