/**
 * Where the portal should send a URL it was opened on, or null to leave it be.
 *
 * Everything is rooted at `/lab`, except an invitation link. Rewriting
 * `#/accept-invite?token=…` to `#/lab` used to happen before the AuthGate read
 * the token, so every invitation email opened the plain sign-in screen and an
 * invited laboratory had no way to accept.
 */
export const entryHashFor = (rawHash) => {
  const hash = String(rawHash || "").replace(/^#/, "").trim();
  if (hash.startsWith("/lab") || hash.startsWith("/admin") || hash.startsWith("/accept-invite")) {
    return null;
  }
  return "#/lab";
};
