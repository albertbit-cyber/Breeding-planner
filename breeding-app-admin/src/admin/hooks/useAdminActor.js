import { useEffect, useState } from "react";
import { normalizeRole } from "../../features/auth/portalAccess";

const ADMIN_SESSION_KEY = "breedingPlannerAdminAuthSession";

const readStoredRole = () => {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return normalizeRole(parsed?.role || parsed?.profile?.role || "");
  } catch {
    return "";
  }
};

/**
 * Who is looking at the console.
 *
 * Used only to decide what to *show*. Every rule this shapes is enforced on the
 * server as well — a moderator who reaches a hidden control anyway gets a 403,
 * not a silent success. Hiding it is about not offering someone a button that
 * cannot work, which is the difference between a role and a wall of errors.
 */
export default function useAdminActor() {
  const [role, setRole] = useState(readStoredRole);

  useEffect(() => {
    // Another tab signing in or out changes who this is.
    const onStorage = (event) => {
      if (!event.key || event.key === ADMIN_SESSION_KEY) setRole(readStoredRole());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isModerator = role === "moderator";
  const isOwner = role === "admin" || role === "super_admin";

  return {
    role,
    isOwner,
    isModerator,
    /** True when the viewer may change things. Moderators may not. */
    canWrite: isOwner,
  };
}
