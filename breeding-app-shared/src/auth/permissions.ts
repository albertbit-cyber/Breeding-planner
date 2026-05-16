import type { AppRole } from "./roles";

export const APP_PERMISSIONS = [
  "auth.session.read",
  "admin.users.read",
  "admin.users.role.update",
  "breeder.snapshot.read",
  "breeder.snapshot.write",
  "lab.order.create",
  "lab.order.read",
  "lab.order.status.update",
  "lab.result.draft",
  "lab.result.finalize",
  "marketplace.listing.public.read",
  "marketplace.listing.create",
  "marketplace.inquiry.create",
  "subscriptions.access.read",
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AppRole, readonly AppPermission[]> = {
  super_admin: APP_PERMISSIONS,
  admin: [
    "auth.session.read",
    "admin.users.read",
    "breeder.snapshot.read",
    "lab.order.create",
    "lab.order.read",
    "lab.order.status.update",
    "lab.result.draft",
    "lab.result.finalize",
    "marketplace.listing.public.read",
    "marketplace.listing.create",
    "subscriptions.access.read",
  ],
  breeder: [
    "auth.session.read",
    "breeder.snapshot.read",
    "breeder.snapshot.write",
    "lab.order.create",
    "lab.order.read",
    "marketplace.listing.public.read",
    "marketplace.listing.create",
    "marketplace.inquiry.create",
    "subscriptions.access.read",
  ],
  lab_owner: [
    "auth.session.read",
    "lab.order.read",
    "lab.order.status.update",
    "lab.result.draft",
    "lab.result.finalize",
    "subscriptions.access.read",
  ],
  lab_staff: [
    "auth.session.read",
    "lab.order.read",
    "lab.order.status.update",
    "lab.result.draft",
    "lab.result.finalize",
  ],
  buyer: [
    "auth.session.read",
    "marketplace.listing.public.read",
    "marketplace.inquiry.create",
    "subscriptions.access.read",
  ],
  viewer: ["auth.session.read", "breeder.snapshot.read", "lab.order.read", "marketplace.listing.public.read"],
};

export const roleHasPermission = (role: AppRole, permission: AppPermission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission);
