/**
 * Demo user seeding for lab/admin development.
 * This creates a demo lab_staff user on first app load if in development mode.
 */

const DEMO_USER_SEEDED_KEY = "breedingPlannerDemoUserSeeded";
const USERS_STORAGE_KEY = "breedingPlannerUsers";

export interface StoredUser {
  fullName: string;
  displayName: string;
  email: string;
  password: string;
  reptileCount?: string;
  registeredAt?: string;
  role?: string;
}

export const DEMO_LAB_STAFF_USER: StoredUser = {
  fullName: "Demo Lab Staff",
  displayName: "lab_demo",
  email: "lab@proherper.dev",
  password: "demo1234",
  reptileCount: "50",
  role: "lab_staff",
  registeredAt: new Date().toISOString(),
};

export const DEMO_ADMIN_USER: StoredUser = {
  fullName: "Demo Admin",
  displayName: "admin_demo",
  email: "admin@breedingplanner.dev",
  password: "admin1234",
  reptileCount: "100",
  role: "admin",
  registeredAt: new Date().toISOString(),
};

/**
 * Seeds demo users if they don't already exist.
 * Call this on app initialization (in AuthGate or similar).
 */
export const seedDemoUsersIfNeeded = (): void => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }

  try {
    const alreadySeeded = localStorage.getItem(DEMO_USER_SEEDED_KEY);
    if (alreadySeeded === "true") {
      return;
    }

    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    const users: StoredUser[] = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(users)) {
      return;
    }

    // Check if demo users already exist
    const hasDemoLabStaff = users.some((u) => u.email === DEMO_LAB_STAFF_USER.email);
    const hasDemoAdmin = users.some((u) => u.email === DEMO_ADMIN_USER.email);

    if (!hasDemoLabStaff) {
      users.push(DEMO_LAB_STAFF_USER);
    }

    if (!hasDemoAdmin) {
      users.push(DEMO_ADMIN_USER);
    }

    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    localStorage.setItem(DEMO_USER_SEEDED_KEY, "true");

    if (!hasDemoLabStaff || !hasDemoAdmin) {
      console.info(
        "[Demo] Lab staff and admin demo users created. Use lab@proherper.dev or admin@BreedingPlanner.dev with password demo1234 / admin1234"
      );
    }
  } catch (error) {
    console.warn("[Demo] Failed to seed demo users", error);
  }
};
