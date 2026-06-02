import { Animal, Outcome } from "../types/pairing";
import { punnettCross } from "./punnett";
export * from "./geneDatabase";

export const cross = (a: Animal, b: Animal): Outcome[] => {
  return punnettCross(a, b);
};
