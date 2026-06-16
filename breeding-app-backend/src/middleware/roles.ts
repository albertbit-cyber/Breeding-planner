import type { NextFunction, Request, Response } from "express";
import { normalizePersistedRole } from "../auth/identity";
import type { AppRole, PersistedAppRole } from "../types/auth";

export const requireRole = (...roles: PersistedAppRole[]) => {
  const normalizedRoles = Array.from(
    new Set(
      roles.flatMap((role) => {
        if (role === "lab") return ["lab_owner", "lab_staff"] satisfies AppRole[];
        if (role === "admin") return ["super_admin", "admin"] satisfies AppRole[];
        return [normalizePersistedRole(role)];
      })
    )
  );

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!normalizedRoles.includes(req.user.role as AppRole)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    next();
  };
};

export const requireAnyRole = requireRole;
