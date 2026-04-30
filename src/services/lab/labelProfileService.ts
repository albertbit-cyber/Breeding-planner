import type { TestOrder } from "../../types/lab";
import type { LabAddress } from "../../types/labShipmentLabels";
import { LAB_LABEL_DEBUG_STORAGE_KEY } from "../../features/lab/utils/labelLayout";

const BREEDER_INFO_STORAGE_KEY = "breedingPlannerBreederInfo";

type ElectronBridge = {
  loadData?: () => Promise<Record<string, unknown> | null>;
};

type StoredSnake = {
  id: string;
  name?: string;
  code?: string;
  displayId?: string;
  externalId?: string;
  sex?: string;
  status?: string;
  morph?: string;
  genetics?: string;
  morphs?: unknown;
  hets?: unknown;
  possibleHets?: unknown;
};

export type BreederInfo = {
  name?: string;
  businessName?: string;
  email?: string;
  phone?: string;
  street?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  stateOrRegion?: string;
  postalCode?: string;
  country?: string;
  labLabelSettings?: unknown;
};

export const LAB_PROFILE = {
  name: "ProHerper Genetics Laboratory",
  address: {
    line1: "123 Lab Lane",
    city: "Phoenix",
    stateOrRegion: "AZ",
    postalCode: "85001",
    country: "US",
  } satisfies LabAddress,
};

const readBridge = (): ElectronBridge | null => {
  if (typeof window === "undefined") return null;
  const typedWindow = window as typeof window & { electronAPI?: ElectronBridge };
  return typedWindow.electronAPI || null;
};

export const loadSnakeById = async (animalId: string): Promise<StoredSnake | null> => {
  const bridge = readBridge();
  if (bridge?.loadData) {
    const payload = await bridge.loadData();
    const snakes = Array.isArray(payload?.snakes) ? payload.snakes : [];
    const match = snakes.find(
      (entry) => entry && typeof entry === "object" && String((entry as Record<string, unknown>).id ?? "") === animalId
    );
    return (match as StoredSnake) || null;
  }

  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem("breedingPlannerSnakes");
      const rows = raw ? JSON.parse(raw) : [];
      const snakes = Array.isArray(rows) ? rows : [];
      const match = snakes.find((entry) => String(entry?.id ?? "") === animalId);
      return (match as StoredSnake) || null;
    } catch {
      return null;
    }
  }

  return null;
};

export const loadBreederInfo = async (): Promise<BreederInfo> => {
  const bridge = readBridge();
  if (bridge?.loadData) {
    const payload = await bridge.loadData();
    const info = payload?.breederInfo;
    if (info && typeof info === "object") {
      return info as BreederInfo;
    }
  }

  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(BREEDER_INFO_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        return parsed as BreederInfo;
      }
    } catch {
      return {};
    }
  }

  return {};
};

export const toBreederAddress = (info: BreederInfo): LabAddress | undefined => {
  const line1 = String(info.addressLine1 || info.street || "").trim();
  const postalCode = String(info.postalCode || "").trim();
  const city = String(info.city || "").trim();
  const country = String(info.country || "").trim();
  if (!line1 && !city && !postalCode && !country) return undefined;
  return {
    line1: line1 || "-",
    line2: String(info.addressLine2 || "").trim() || undefined,
    city: city || "-",
    stateOrRegion: String(info.stateOrRegion || info.state || "").trim() || undefined,
    postalCode: postalCode || "-",
    country: country || "-",
  };
};

export const resolveBreederDisplayName = (order: TestOrder, breederInfo: BreederInfo): string =>
  String(
    breederInfo.name ||
    breederInfo.businessName ||
    order.breederUserId ||
    order.requestedByUserId ||
    "Breeder"
  ).trim() || "Breeder";

export const isLabLabelDebugEnabled = async (): Promise<boolean> => {
  if (typeof localStorage !== "undefined") {
    try {
      return localStorage.getItem(LAB_LABEL_DEBUG_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }
  return false;
};
