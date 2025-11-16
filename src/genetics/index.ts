import { Animal, Outcome } from "../types/pairing";
import { punnettCross } from "./punnett";

export const cross = (a: Animal, b: Animal): Outcome[] => {
  return punnettCross(a, b);
};
