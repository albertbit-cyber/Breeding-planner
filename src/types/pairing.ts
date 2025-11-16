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

export type MultiGenPlan = {
  strategy: "direct" | "multi";
  steps: PlanStep[];
  cumulativeProb: number;
  holdbackTraits?: string[];
  holdbackProb?: number;
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
