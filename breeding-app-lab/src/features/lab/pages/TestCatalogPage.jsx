import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createLabApiClient } from "../api/client";

const PRIORITY_OPTIONS = ["routine", "priority", "urgent"];

const formatEuroFromCents = (value) => {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) / 100);
};

const emptyForm = () => ({
  internalCode: "",
  name: "",
  shortLabel: "",
  description: "",
  geneTarget: "",
  category: "morph",
  pricingType: "morph",
  priceEuro: "",
  currency: "EUR",
  allowedPriorities: ["routine", "priority", "urgent"],
  isActive: true,
  isVisibleToBreeder: true,
  sortOrder: "0",
});

export default function TestCatalogPage() {
  const { t } = useTranslation();
  const [tests, setTests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const loadTests = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const api = createLabApiClient();
      const data = await api.listLabAvailableTests();
      setTests(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load tests.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTests();
  }, []);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError("");
    setSuccessMessage("");
    setShowForm(true);
  };

  const openEditForm = (test) => {
    setEditingId(test.id);
    setForm({
      internalCode: test.internalCode || "",
      name: test.name || "",
      shortLabel: test.shortLabel || "",
      description: test.description || "",
      geneTarget: test.geneTarget || "",
      category: test.category || "morph",
      pricingType: test.pricingType || (String(test.category || "").toLowerCase().includes("sex") ? "sex" : "morph"),
      priceEuro: test.priceCents != null ? (Number(test.priceCents) / 100).toFixed(2) : "",
      currency: "EUR",
      allowedPriorities: Array.isArray(test.allowedPriorities) ? test.allowedPriorities : ["routine", "priority", "urgent"],
      isActive: test.isActive !== false,
      isVisibleToBreeder: test.isVisibleToBreeder !== false,
      sortOrder: String(test.sortOrder ?? 0),
    });
    setFormError("");
    setSuccessMessage("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormError("");
  };

  const handlePriorityToggle = (priority) => {
    setForm((prev) => {
      const current = Array.isArray(prev.allowedPriorities) ? prev.allowedPriorities : [];
      if (current.includes(priority)) {
        return { ...prev, allowedPriorities: current.filter((p) => p !== priority) };
      }
      return { ...prev, allowedPriorities: [...current, priority] };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);
    try {
      const api = createLabApiClient();
      const parsedEuro = form.priceEuro !== "" ? Number(form.priceEuro) : undefined;
      if (parsedEuro !== undefined && (isNaN(parsedEuro) || parsedEuro < 0)) {
        setFormError(t("lab.catalog.invalidPrice", { defaultValue: "Price must be a positive number in EUR." }));
        return;
      }
      const priceCents = parsedEuro !== undefined ? Math.round(parsedEuro * 100) : undefined;

      const payload = {
        internalCode: form.internalCode.trim(),
        name: form.name.trim(),
        shortLabel: form.shortLabel.trim() || undefined,
        description: form.description.trim() || undefined,
        geneTarget: form.geneTarget.trim() || undefined,
        category: form.category.trim() || undefined,
        pricingType: form.pricingType,
        priceCents,
        currency: "EUR",
        allowedPriorities: form.allowedPriorities,
        isActive: form.isActive,
        isVisibleToBreeder: form.isVisibleToBreeder,
        sortOrder: Number(form.sortOrder) || 0,
      };

      if (editingId) {
        await api.updateLabAvailableTest({ id: editingId, labId: "proherper-main-lab", ...payload });
        setSuccessMessage(t("lab.catalog.updated", { defaultValue: "Test updated successfully." }));
      } else {
        await api.createLabAvailableTest({ labId: "proherper-main-lab", ...payload });
        setSuccessMessage(t("lab.catalog.created", { defaultValue: "Test created successfully." }));
      }
      closeForm();
      await loadTests();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (test) => {
    try {
      const api = createLabApiClient();
      await api.setLabAvailableTestActive(test.id, !test.isActive);
      setSuccessMessage(
        test.isActive
          ? t("lab.catalog.deactivated", { defaultValue: "Test deactivated." })
          : t("lab.catalog.activated", { defaultValue: "Test activated." })
      );
      await loadTests();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to update.");
    }
  };

  const handleToggleVisibility = async (test) => {
    try {
      const api = createLabApiClient();
      await api.setLabAvailableTestVisibility(test.id, !test.isVisibleToBreeder);
      setSuccessMessage(
        test.isVisibleToBreeder
          ? t("lab.catalog.hiddenFromBreeders", { defaultValue: "Hidden from breeders." })
          : t("lab.catalog.visibleToBreeders", { defaultValue: "Visible to breeders." })
      );
      await loadTests();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to update.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {t("lab.catalog.title", { defaultValue: "Test Catalog" })}
          </h1>
          <p className="text-sm text-neutral-600">
            {t("lab.catalog.subtitle", { defaultValue: "Manage the genetic tests offered by this laboratory." })}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          {t("lab.catalog.addTest", { defaultValue: "+ Add Test" })}
        </button>
      </div>

      {successMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {successMessage}
          <button
            type="button"
            className="ml-3 text-xs underline"
            onClick={() => setSuccessMessage("")}
          >
            {t("common.dismiss", { defaultValue: "Dismiss" })}
          </button>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {loadError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="py-8 text-center text-sm text-neutral-500">
          {t("common.loading", { defaultValue: "Loading..." })}
        </div>
      ) : tests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 py-12 text-center">
          <p className="text-sm text-neutral-500">
            {t("lab.catalog.empty", { defaultValue: "No tests in catalog yet. Add the first test to get started." })}
          </p>
        </div>
      ) : (
        <div className="overflow-auto rounded-2xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-100 bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2">{t("lab.catalog.colName", { defaultValue: "Name" })}</th>
                <th className="px-3 py-2">{t("lab.catalog.colCode", { defaultValue: "Code" })}</th>
                <th className="px-3 py-2">{t("lab.catalog.colGene", { defaultValue: "Gene" })}</th>
                <th className="px-3 py-2">{t("lab.catalog.colPricingType", { defaultValue: "Pricing Type" })}</th>
                <th className="px-3 py-2">{t("lab.catalog.colPrice", { defaultValue: "Price" })}</th>
                <th className="px-3 py-2">{t("lab.catalog.colActive", { defaultValue: "Active" })}</th>
                <th className="px-3 py-2">{t("lab.catalog.colBreederVisible", { defaultValue: "Breeder Visible" })}</th>
                <th className="px-3 py-2">{t("lab.catalog.colActions", { defaultValue: "Actions" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {tests.map((test) => (
                <tr key={test.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-neutral-900">{test.name}</div>
                    {test.shortLabel ? <div className="text-xs text-neutral-500">{test.shortLabel}</div> : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-600">{test.internalCode}</td>
                  <td className="px-3 py-2 text-xs text-neutral-600">{test.geneTarget || "-"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-600">{test.pricingType || "morph"}</td>
                  <td className="px-3 py-2 text-xs">
                    {formatEuroFromCents(test.priceCents)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(test)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        test.isActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {test.isActive
                        ? t("common.active", { defaultValue: "Active" })
                        : t("common.inactive", { defaultValue: "Inactive" })}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(test)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        test.isVisibleToBreeder
                          ? "bg-sky-100 text-sky-800"
                          : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {test.isVisibleToBreeder
                        ? t("common.visible", { defaultValue: "Visible" })
                        : t("common.hidden", { defaultValue: "Hidden" })}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(test)}
                      className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs hover:border-neutral-300"
                    >
                      {t("common.edit", { defaultValue: "Edit" })}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
              <div className="text-lg font-semibold">
                {editingId
                  ? t("lab.catalog.editTitle", { defaultValue: "Edit Test" })
                  : t("lab.catalog.createTitle", { defaultValue: "Create Test" })}
              </div>
              <button type="button" onClick={closeForm} className="rounded-xl border px-3 py-1.5 text-sm">
                {t("common.close", { defaultValue: "Close" })}
              </button>
            </div>

            <form className="space-y-4 px-5 py-4" onSubmit={handleSubmit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-600">
                    {t("lab.catalog.fieldName", { defaultValue: "Display Name *" })}
                  </span>
                  <input
                    required
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={t("lab.catalog.fieldNamePlaceholder", { defaultValue: "e.g. Clown" })}
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-600">
                    {t("lab.catalog.fieldCode", { defaultValue: "Internal Code *" })}
                  </span>
                  <input
                    required
                    className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
                    value={form.internalCode}
                    onChange={(e) => setForm((prev) => ({ ...prev, internalCode: e.target.value }))}
                    placeholder="CLOWN"
                    disabled={Boolean(editingId)}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-600">
                    {t("lab.catalog.fieldShortLabel", { defaultValue: "Short Label" })}
                  </span>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={form.shortLabel}
                    onChange={(e) => setForm((prev) => ({ ...prev, shortLabel: e.target.value }))}
                    placeholder="Clown"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-600">
                    {t("lab.catalog.fieldGeneTarget", { defaultValue: "Gene Target" })}
                  </span>
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={form.geneTarget}
                    onChange={(e) => setForm((prev) => ({ ...prev, geneTarget: e.target.value }))}
                    placeholder="clown"
                  />
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-600">
                  {t("lab.catalog.fieldDescription", { defaultValue: "Description" })}
                </span>
                <textarea
                  className="min-h-16 w-full rounded-xl border px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder={t("lab.catalog.fieldDescriptionPlaceholder", { defaultValue: "Brief description for breeders..." })}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-4">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-600">
                    {t("lab.catalog.fieldCategory", { defaultValue: "Category" })}
                  </span>
                  <select
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={form.category}
                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  >
                    <option value="morph">morph</option>
                    <option value="sex-determination">sex-determination</option>
                    <option value="other">other</option>
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-600">
                    {t("lab.catalog.fieldPricingType", { defaultValue: "Pricing Type" })}
                  </span>
                  <select
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={form.pricingType}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        pricingType: e.target.value,
                        category: e.target.value === "sex" ? "sex-determination" : prev.category,
                      }))
                    }
                  >
                    <option value="morph">morph</option>
                    <option value="sex">sex</option>
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-600">
                    {t("lab.catalog.fieldPrice", { defaultValue: "Price (EUR)" })}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    value={form.priceEuro}
                    onChange={(e) => setForm((prev) => ({ ...prev, priceEuro: e.target.value }))}
                    placeholder="49.99"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-600">
                    {t("lab.catalog.fieldCurrency", { defaultValue: "Currency" })}
                  </span>
                  <input
                    className="w-full rounded-xl border bg-neutral-50 px-3 py-2 text-sm"
                    value="EUR"
                    readOnly
                  />
                </label>
              </div>

              <div>
                <div className="mb-2 text-xs text-neutral-600">
                  {t("lab.catalog.fieldPriorities", { defaultValue: "Allowed Priorities" })}
                </div>
                <div className="flex gap-3">
                  {PRIORITY_OPTIONS.map((p) => (
                    <label key={p} className="inline-flex items-center gap-1.5 text-sm capitalize">
                      <input
                        type="checkbox"
                        checked={Array.isArray(form.allowedPriorities) && form.allowedPriorities.includes(p)}
                        onChange={() => handlePriorityToggle(p)}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-6">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  />
                  {t("lab.catalog.fieldActive", { defaultValue: "Active" })}
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isVisibleToBreeder}
                    onChange={(e) => setForm((prev) => ({ ...prev, isVisibleToBreeder: e.target.checked }))}
                  />
                  {t("lab.catalog.fieldVisible", { defaultValue: "Visible to Breeders" })}
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-600">
                  {t("lab.catalog.fieldSortOrder", { defaultValue: "Sort Order" })}
                </span>
                <input
                  type="number"
                  className="w-32 rounded-xl border px-3 py-2 text-sm"
                  value={form.sortOrder}
                  onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                />
              </label>

              {formError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {formError}
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeForm} className="rounded-xl border px-4 py-2 text-sm">
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl border bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {isSaving
                    ? t("common.saving", { defaultValue: "Saving..." })
                    : t("common.save", { defaultValue: "Save" })}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
