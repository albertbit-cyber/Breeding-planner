import { createSharedApiConfig } from "breeding-app-shared/config/api";

export { DEFAULT_SHARED_API_TIMEOUT_MS } from "breeding-app-shared/config/api";

// The breeder app's two departures from the shared defaults: `vite preview`
// may land on 4174 when 4173 is taken, and a bad URL is not echoed back to
// the person using the app.
export const { isProductionBuild, validateSharedApiUrl, getSharedApiConfig } = createSharedApiConfig({
  devPorts: ["5173", "4173", "4174"],
  invalidUrlMessage: () => "Backend configuration is invalid. Expected a full API URL.",
});
