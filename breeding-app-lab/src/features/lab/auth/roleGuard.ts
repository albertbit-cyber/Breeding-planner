export type AppRole = "breeder" | "lab_staff" | "admin" | "unknown";

const AUTH_STORAGE_KEY = "breedingPlannerLabAuthSession";

type StoredSession = {
  isAuthenticated?: boolean;
  role?: string;
  profile?: {
    role?: string;
  };
};

const normalizeRole = (value: unknown): AppRole => {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "lab_staff") return "lab_staff";
  if (role === "admin") return "admin";
  if (role === "breeder") return "breeder";
  return "unknown";
};

export const getCurrentAppRole = (): AppRole => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "unknown";

  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return "unknown";
    const session = JSON.parse(raw) as StoredSession;
    if (!session?.isAuthenticated) return "unknown";

    return normalizeRole(session.role ?? session.profile?.role);
  } catch {
    return "unknown";
  }
};

export const canAccessLabApp = (role: AppRole): boolean => role === "lab_staff" || role === "admin";
