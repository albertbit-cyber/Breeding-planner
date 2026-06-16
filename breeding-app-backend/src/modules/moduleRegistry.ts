export const BACKEND_MODULES = [
  "auth",
  "users",
  "breeders",
  "snakes",
  "pairings",
  "spaces",
  "labOrders",
  "geneticTests",
  "marketplace",
  "messages",
  "subscriptions",
  "admin",
  "auditLogs",
] as const;

export type BackendModuleName = (typeof BACKEND_MODULES)[number];
