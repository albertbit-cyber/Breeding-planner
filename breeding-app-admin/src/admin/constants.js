export const ROLE_OPTIONS = ["buyer", "breeder", "lab", "moderator", "admin", "support"];
export const STATUS_OPTIONS = ["active", "pending", "restricted", "suspended", "banned", "deleted"];
export const VERIFICATION_OPTIONS = ["not_applied", "pending", "approved", "rejected", "revoked", "more_info_requested"];
export const SUBSCRIPTION_OPTIONS = ["free", "hobby", "breeder", "professional", "enterprise"];
export const ACTIVITY_OPTIONS = ["active_today", "active_this_week", "inactive_30_days"];
export const SUBSCRIPTION_STATUS_OPTIONS = ["inactive", "active", "trialing", "past_due", "expired", "cancelled", "lifetime"];
export const PAYMENT_STATUS_OPTIONS = ["none", "paid", "pending", "failed", "waived", "refunded"];
export const REPORT_TYPE_OPTIONS = ["fake_listing", "incorrect_genetics", "scam_suspicion", "abusive_message", "non_payment", "animal_welfare_concern", "spam", "other"];
export const REPORT_STATUS_OPTIONS = ["open", "under_review", "waiting_for_response", "resolved", "dismissed", "escalated"];
export const REPORT_ACTION_OPTIONS = ["warn_user", "restrict_messaging", "remove_listing", "suspend_account", "ban_account", "escalate_report"];
export const VERIFICATION_REQUEST_STATUS_OPTIONS = ["pending_review", "approved", "rejected", "more_info_requested", "revoked"];
export const PERMISSION_LABELS = [
  "can_create_listings",
  "can_publish_marketplace_animals",
  "can_use_lab_system",
  "can_manage_test_orders",
  "can_access_admin_panel",
  "can_moderate_listings",
  "can_message_users",
  "can_create_collaborations",
];
export const REASON_OPTIONS = ["spam", "fake_profile", "payment_issue", "fraud_suspicion", "policy_violation", "user_request", "other"];

export const GDPR_WORKFLOW = {
  data_export_requested: ["data_exported", "rejected"],
  anonymize_requested: ["account_anonymized", "rejected"],
  deletion_requested: ["fully_deleted", "rejected"],
  data_exported: ["completed"],
  account_anonymized: ["completed"],
  fully_deleted: ["completed"],
  rejected: [],
  completed: [],
};

export const rolePermissions = (role) => {
  const n = String(role || "").toLowerCase();
  return {
    can_create_listings: ["breeder", "admin"].includes(n),
    can_publish_marketplace_animals: ["breeder", "admin"].includes(n),
    can_use_lab_system: ["lab", "admin"].includes(n),
    can_manage_test_orders: ["lab", "admin"].includes(n),
    can_access_admin_panel: ["admin", "moderator", "support"].includes(n),
    can_moderate_listings: ["admin", "moderator"].includes(n),
    can_message_users: n !== "banned",
    can_create_collaborations: ["breeder", "admin"].includes(n),
  };
};

export const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
};

export const dateInputValue = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

export const AUTH_STORAGE_KEY = "breedingPlannerAdminAuthSession";

export const readRole = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return String(parsed?.role || parsed?.profile?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};
