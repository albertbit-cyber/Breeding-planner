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

export type LabProfile = {
  name: string;
  address: LabAddress;
  logoUrl?: string | null;
};

/**
 * Used only when an order carries no laboratory — historical orders placed
 * before breeders chose a lab, essentially. Deliberately blank rather than a
 * real laboratory's details: a document that cannot say who ran the test must
 * say nothing, not name the wrong lab.
 *
 * This replaces a hardcoded constant naming one specific laboratory, which was
 * rendered onto every vendor's shipping labels and certificates.
 */
export const UNKNOWN_LAB_PROFILE: LabProfile = {
  name: "",
  address: { line1: "", city: "", postalCode: "", country: "" },
  logoUrl: null,
};

/**
 * The signed-in laboratory's own profile, as fetched from `/lab/my/profile`.
 * Cached here so label and certificate rendering stays synchronous.
 */
let activeLabProfile: LabProfile | null = null;

export const setActiveLabProfile = (profile: LabProfile | null): void => {
  activeLabProfile = profile;
};

export const getActiveLabProfile = (): LabProfile | null => activeLabProfile;

type OrderLabOrganization = {
  name?: string;
  labAccount?: {
    labName?: string | null;
    contactPerson?: string | null;
    contactEmail?: string | null;
    phone?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    postalCode?: string | null;
    country?: string | null;
    logoUrl?: string | null;
  } | null;
};

/**
 * The identity a document should be issued under: the laboratory that actually
 * received the order, taken from the order itself.
 *
 * Falls back to the signed-in lab's own profile (the common case inside the Lab
 * Portal, where the order's lab *is* the acting lab) and finally to the blank
 * profile above — never to another laboratory's details.
 */
export const resolveLabProfileForOrder = (order: unknown): LabProfile => {
  const organization = (order as { labOrganization?: OrderLabOrganization } | null)?.labOrganization;
  const account = organization?.labAccount;

  if (account) {
    return {
      name: account.labName || organization?.name || "",
      address: {
        contactName: account.contactPerson || undefined,
        line1: account.addressLine1 || "",
        line2: account.addressLine2 || undefined,
        city: account.city || "",
        postalCode: account.postalCode || "",
        country: account.country || "",
        phone: account.phone || undefined,
      },
      logoUrl: account.logoUrl || null,
    };
  }

  return activeLabProfile || UNKNOWN_LAB_PROFILE;
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
