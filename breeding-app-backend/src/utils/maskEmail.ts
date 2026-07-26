export const maskEmail = (email: string): string => {
  const [local, domain] = String(email || "").split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
};
