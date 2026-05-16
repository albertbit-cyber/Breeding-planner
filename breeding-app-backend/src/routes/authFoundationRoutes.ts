import { Router } from "express";
import { isAdminRole, isBreederRole } from "../auth/identity";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const authFoundationRoutes = Router();

authFoundationRoutes.get("/protected", requireAuth, (req, res) => {
  res.status(200).json({ ok: true, user: req.user });
});

authFoundationRoutes.get("/admin-only", requireAuth, requireRole("super_admin", "admin"), (_req, res) => {
  res.status(200).json({ ok: true, scope: "admin" });
});

authFoundationRoutes.get("/breeder-only", requireAuth, requireRole("super_admin", "admin", "breeder"), (_req, res) => {
  res.status(200).json({ ok: true, scope: "breeder" });
});

authFoundationRoutes.get("/identity", requireAuth, (req, res) => {
  const role = req.user?.role;
  res.status(200).json({
    ok: true,
    user: req.user,
    access: {
      admin: role ? isAdminRole(role) : false,
      breeder: role ? isBreederRole(role) : false,
    },
  });
});
