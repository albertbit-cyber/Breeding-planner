import { Goal } from "../types/pairing";
export const GOAL_PRESETS: Goal[] = [
  { id:"visual-clown", name:"Make Visual Clown", requireAll:["Clown"], recessiveState:"visual", minProb:0.125, weight:2 },
  { id:"dg-het-hypo", name:"Make DG het Hypo", requireAll:["Desert Ghost","het Hypo"], minProb:0.25, weight:1 }
];
