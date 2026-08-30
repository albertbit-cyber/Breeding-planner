import React, { useEffect, useState } from "react";
import { fetchMyLabProfile, updateMyLabProfile } from "../../../shared/apiClient";
import { setActiveLabProfile } from "../../../services/lab/labelProfileService";

/**
 * A laboratory's own identity, editable by the laboratory and nobody else.
 *
 * These fields are what appear on the shipping labels and certificates this lab
 * issues, and on its entry in the breeder-facing directory. A platform admin can
 * read all of it and change none of it — there is no admin endpoint that writes
 * here.
 */

const FIELDS = [
  { key: "labName", label: "Laboratory name", required: true },
  { key: "contactPerson", label: "Contact person" },
  { key: "contactEmail", label: "Contact email", type: "email" },
  { key: "phone", label: "Phone" },
  { key: "addressLine1", label: "Address" },
  { key: "addressLine2", label: "Address (line 2)" },
  { key: "postalCode", label: "Postal code" },
  { key: "city", label: "City" },
  { key: "country", label: "Country" },
];

export default function LabSettingsPage() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    fetchMyLabProfile()
      .then((data) => setForm(data?.lab || null))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load your laboratory."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleLogo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 900_000) {
      setError("That logo is too large — please use an image under about 900 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("logoUrl", String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = Object.fromEntries(
        [...FIELDS.map((f) => f.key), "publicDescription", "turnaroundDays", "listedInDirectory", "logoUrl"].map(
          (key) => [key, form?.[key] ?? null]
        )
      );
      const data = await updateMyLabProfile(payload);
      setForm(data?.lab || form);
      // Keep locally-rendered documents in step with what was just saved.
      setActiveLabProfile({
        name: data?.lab?.labName || "",
        address: {
          contactName: data?.lab?.contactPerson || undefined,
          line1: data?.lab?.addressLine1 || "",
          line2: data?.lab?.addressLine2 || undefined,
          city: data?.lab?.city || "",
          postalCode: data?.lab?.postalCode || "",
          country: data?.lab?.country || "",
          phone: data?.lab?.phone || undefined,
        },
        logoUrl: data?.lab?.logoUrl || null,
      });
      setMessage("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your laboratory settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-neutral-500">Loading…</div>;
  if (!form) return <div className="p-6 text-sm text-rose-600">{error || "No laboratory profile."}</div>;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Laboratory settings</h1>
        <p className="mt-1 text-sm text-neutral-600">
          These details appear on the labels and certificates you issue, and on your entry in the
          breeder directory.
        </p>
      </div>

      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <form onSubmit={save} className="space-y-6">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <label key={field.key} className="block text-sm">
              <span className="text-neutral-700">{field.label}</span>
              <input
                type={field.type || "text"}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
                value={form[field.key] ?? ""}
                onChange={(e) => set(field.key, e.target.value)}
                required={field.required}
              />
            </label>
          ))}
        </section>

        <section className="space-y-4">
          <label className="block text-sm">
            <span className="text-neutral-700">Description shown to breeders</span>
            <textarea
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              rows={3}
              maxLength={2000}
              value={form.publicDescription ?? ""}
              onChange={(e) => set("publicDescription", e.target.value)}
            />
          </label>

          <label className="block text-sm sm:w-64">
            <span className="text-neutral-700">Typical turnaround (days)</span>
            <input
              type="number"
              min={0}
              max={365}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              value={form.turnaroundDays ?? ""}
              onChange={(e) => set("turnaroundDays", e.target.value === "" ? null : Number(e.target.value))}
            />
          </label>

          <div className="text-sm">
            <span className="text-neutral-700">Certificate logo</span>
            <div className="mt-2 flex items-center gap-3">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="" className="h-12 w-12 rounded border object-contain" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded border text-[10px] text-neutral-400">
                  none
                </div>
              )}
              <input type="file" accept="image/png,image/jpeg" onChange={handleLogo} />
              {form.logoUrl ? (
                <button type="button" className="text-xs underline" onClick={() => set("logoUrl", null)}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={Boolean(form.listedInDirectory)}
              onChange={(e) => set("listedInDirectory", e.target.checked)}
            />
            <span>
              <span className="text-neutral-800">List my laboratory in the breeder directory</span>
              <span className="block text-xs text-neutral-500">
                Turn this off to stop receiving new orders — for a holiday, say — without closing
                your account. Orders already in progress are unaffected.
              </span>
            </span>
          </label>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
