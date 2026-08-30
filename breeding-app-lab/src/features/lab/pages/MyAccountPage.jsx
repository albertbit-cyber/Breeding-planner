import React, { useEffect, useState } from "react";
import { apiRequest, getCurrentUser } from "../../../shared/apiClient";

/**
 * The signed-in person's own account — name, email address, password.
 *
 * Separate from Laboratory settings on purpose: this is the individual, that is
 * the business. A technician who moves between employers keeps this; the
 * laboratory's identity stays with the laboratory.
 *
 * A platform admin cannot change any of it. The backend endpoints behind this
 * page all act on the authenticated user (`/auth/me/...`) and take no user id.
 */
export default function MyAccountPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [emailForm, setEmailForm] = useState({ email: "", currentPassword: "" });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    getCurrentUser()
      .then((data) => {
        setUser(data?.user || null);
        setEmailForm((prev) => ({ ...prev, email: String(data?.user?.email || "") }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load your account."))
      .finally(() => setLoading(false));
  }, []);

  const submitEmail = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/auth/me/email", {
        method: "PATCH",
        body: JSON.stringify({
          newEmail: emailForm.email.trim(),
          currentPassword: emailForm.currentPassword,
        }),
      });
      // The change only takes effect once the new address is confirmed, so the
      // page must not pretend it already has.
      setMessage("Check your new address for a confirmation link. Your email changes once you confirm it.");
      setEmailForm((prev) => ({ ...prev, currentPassword: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your email address.");
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("Those passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/auth/me/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      setMessage("Password changed.");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your password.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-neutral-500">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">My account</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Your personal sign-in details. Your laboratory's own details live under Laboratory
          settings.
        </p>
      </div>

      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Signed in as</h2>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-24 text-neutral-500">Name</dt>
            <dd>{user?.fullName || "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 text-neutral-500">Email</dt>
            <dd>{user?.email}</dd>
          </div>
          {user?.pendingEmail ? (
            <div className="flex gap-2">
              <dt className="w-24 text-neutral-500">Pending</dt>
              <dd className="text-amber-700">{user.pendingEmail} — awaiting confirmation</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Change email address</h2>
        <form onSubmit={submitEmail} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-neutral-700">New email address</span>
            <input
              type="email"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              value={emailForm.email}
              onChange={(e) => setEmailForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-700">Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              value={emailForm.currentPassword}
              onChange={(e) => setEmailForm((p) => ({ ...p, currentPassword: e.target.value }))}
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Change email
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Change password</h2>
        <form onSubmit={submitPassword} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-neutral-700">Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-700">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-neutral-700">Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Change password
          </button>
        </form>
      </section>
    </div>
  );
}
