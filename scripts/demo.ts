// @ts-nocheck

import { suggestForCollections } from "../src/features/suggestions/api";

const males = [
  {
    id: "M1",
    sex: "M",
    morphs: [{ name: "Clown", type: "recessive" }],
    hets: [],
    possibleHets: [],
  },
  {
    id: "M2",
    sex: "M",
    morphs: [{ name: "Pastel", type: "co-dom" }],
    hets: ["Clown"],
    possibleHets: [],
  },
];

const females = [
  {
    id: "F1",
    sex: "F",
    morphs: [],
    hets: ["Clown"],
    possibleHets: [],
  },
  {
    id: "F2",
    sex: "F",
    morphs: [{ name: "Enchi", type: "co-dom" }],
    hets: ["Clown"],
    possibleHets: [],
  },
];

const goals = [
  {
    id: "demo-visual-clown",
    name: "Make Visual Clown",
    requireAll: ["Clown"],
    recessiveState: "visual",
    minProb: 0,
    weight: 1,
  },
];

const weights = {
  wDemand: 1,
  wPrice: 0.8,
  wNovelty: 0.4,
  wRisk: 0.5,
  wGoalFit: 1.2,
};

(async () => {
  const suggestions = await suggestForCollections(males, females, goals, weights);
  const topThree = suggestions.slice(0, 3);

  console.log("Top pairings:");
  topThree.forEach((suggestion, index) => {
    const label = `${suggestion.maleId} × ${suggestion.femaleId}`;
    const goalProb = ((suggestion.goalProb ?? 0) * 100).toFixed(1);
    const score = suggestion.score.toFixed(2);
    console.log(`${index + 1}. ${label} — Goal Prob: ${goalProb}%, Score: ${score}`);
  });
})();
