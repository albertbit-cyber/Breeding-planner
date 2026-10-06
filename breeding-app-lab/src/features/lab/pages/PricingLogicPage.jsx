import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { createLabApiClient } from "../api/client";
import {
  calculateOrderPrice,
  fetchMyLabPricing,
  fetchMyLabProfile,
  updateMyLabPricing,
} from "../../../shared/apiClient";

/**
 * This laboratory's own tier prices, and what an order from a breeder would
 * cost under them.
 *
 * Both halves read the backend. The page used to render a hardcoded tier table
 * and price its preview with a client-side copy of the formula, while the
 * prices breeders were actually charged lived in `/lab/my/pricing` with no
 * screen that could change them. A newly invited laboratory therefore could not
 * see or set its own prices without someone editing the database.
 */

const TIERS = [
  { key: "1to9", first: "morphTier1to9FirstTest", additional: "morphTier1to9AdditionalTest", sex: "sexTier1to9" },
  { key: "10to49", first: "morphTier10to49FirstTest", additional: "morphTier10to49AdditionalTest", sex: "sexTier10to49" },
  { key: "50plus", first: "morphTier50PlusFirstTest", additional: "morphTier50PlusAdditionalTest", sex: "sexTier50Plus" },
];

const PRICE_FIELDS = TIERS.flatMap((tier) => [tier.first, tier.additional, tier.sex]);

// Accepts both the form's tier keys and the quote's tier ids; anything else is shown as-is.
const tierLabel = (t, tier) => {
  switch (tier) {
    case "1to9":
    case "tier_1_9":
      return t("lab.pricing.tier1to9", { defaultValue: "1–9 animals" });
    case "10to49":
    case "tier_10_49":
      return t("lab.pricing.tier10to49", { defaultValue: "10–49 animals" });
    case "50plus":
    case "tier_50_plus":
      return t("lab.pricing.tier50plus", { defaultValue: "50+ animals" });
    default:
      return tier;
  }
};

const formatMoney = (value, currency) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "EUR" }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || ""}`.trim();
  }
};

const toForm = (pricing) => ({
  currency: String(pricing?.currency || "EUR"),
  ...Object.fromEntries(PRICE_FIELDS.map((field) => [field, String(pricing?.[field] ?? 0)])),
});

const createBlankAnimal = (index) => ({ animalId: `animal-${index + 1}`, selectedTestIds: [] });

export default function PricingLogicPage() {
  const { t } = useTranslation();
  const [pricing, setPricing] = useState(null);
  const [form, setForm] = useState(() => toForm(null));
  const [organizationId, setOrganizationId] = useState("");
  const [tests, setTests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState({ saving: false, error: "", message: "" });

  const [animals, setAnimals] = useState([createBlankAnimal(0)]);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const [pricingData, profileData, rows] = await Promise.all([
          fetchMyLabPricing(),
          fetchMyLabProfile(),
          createLabApiClient().listLabAvailableTests(),
        ]);
        if (cancelled) return;
        setPricing(pricingData?.pricing || null);
        setForm(toForm(pricingData?.pricing));
        setOrganizationId(String(profileData?.lab?.organizationId || ""));
        setTests(Array.isArray(rows) ? rows : []);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : t("lab.pricing.loadFailed", { defaultValue: "Could not load your prices." })
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = useMemo(() => {
    if (!pricing) return false;
    const saved = toForm(pricing);
    return Object.keys(saved).some((key) => String(form[key]).trim() !== String(saved[key]).trim());
  }, [form, pricing]);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaveState({ saving: true, error: "", message: "" });
    try {
      const payload = { currency: String(form.currency || "EUR").trim().toUpperCase() };
      for (const field of PRICE_FIELDS) {
        const amount = Number(String(form[field]).replace(",", "."));
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error(t("lab.pricing.invalidPrice", { defaultValue: "Prices must be zero or a positive amount." }));
        }
        payload[field] = amount;
      }
      const data = await updateMyLabPricing(payload);
      setPricing(data?.pricing || null);
      setForm(toForm(data?.pricing));
      setSaveState({
        saving: false,
        error: "",
        message: t("lab.pricing.saved", { defaultValue: "Prices saved. New quotes and orders use them from now on." }),
      });
    } catch (error) {
      setSaveState({
        saving: false,
        error: error instanceof Error ? error.message : t("lab.pricing.saveFailed", { defaultValue: "Could not save your prices." }),
        message: "",
      });
    }
  };

  // Only what a breeder can actually order is quotable.
  const orderableTests = useMemo(
    () =>
      tests
        .filter((test) => test.isActive !== false && test.isVisibleToBreeder !== false)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [tests]
  );

  const setAnimalCount = (nextCount) => {
    const count = Math.max(1, Math.min(60, Number(nextCount) || 1));
    setAnimals((prev) => {
      if (prev.length >= count) return prev.slice(0, count);
      // New rows copy the first row's tests, so "what do 12 of these cost" is one change.
      const template = prev[0]?.selectedTestIds || [];
      const next = [...prev];
      for (let index = prev.length; index < count; index += 1) {
        next.push({ ...createBlankAnimal(index), selectedTestIds: [...template] });
      }
      return next;
    });
  };

  const toggleAnimalTest = (index, testId) => {
    setAnimals((prev) =>
      prev.map((animal, rowIndex) => {
        if (rowIndex !== index) return animal;
        const current = animal.selectedTestIds;
        return {
          ...animal,
          selectedTestIds: current.includes(testId) ? current.filter((id) => id !== testId) : [...current, testId],
        };
      })
    );
  };

  const requestQuote = useCallback(async () => {
    const withTests = animals.filter((animal) => animal.selectedTestIds.length);
    if (!organizationId || !withTests.length) {
      setQuote(null);
      setQuoteError("");
      return;
    }
    try {
      const data = await calculateOrderPrice({ labOrganizationId: organizationId, animals: withTests });
      setQuote(data);
      setQuoteError("");
    } catch (error) {
      setQuote(null);
      setQuoteError(
        error instanceof Error ? error.message : t("lab.pricing.quoteFailed", { defaultValue: "Could not price this order." })
      );
    }
  }, [animals, organizationId]);

  // Re-quote whenever the order or the saved prices change. Unsaved edits are
  // not quoted: the preview shows what a breeder would be charged right now.
  useEffect(() => {
    const timer = setTimeout(requestQuote, 250);
    return () => clearTimeout(timer);
  }, [requestQuote, pricing]);

  const currency = pricing?.currency || form.currency || "EUR";
  const testNameById = useMemo(() => new Map(tests.map((test) => [test.id, test.name])), [tests]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-neutral-900">{t("lab.shell.nav.pricing", { defaultValue: "Pricing" })}</h1>
        <p className="text-sm text-neutral-600">
          {t("lab.pricing.subtitle", {
            defaultValue:
              "Your laboratory's own prices. The tier is chosen by the number of animals in an order; morph tests are charged per animal, the first test at the first-test price and each further one at the additional price. A test with its own flat or per-tier price in the Test Catalog uses that instead.",
          })}
        </p>
      </header>

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</div>
      ) : null}

      <form onSubmit={handleSave} className="space-y-3 rounded-2xl border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-900">
            {t("lab.pricing.tierPrices", { defaultValue: "Tier prices" })}
          </h2>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            {t("lab.catalog.fieldCurrency", { defaultValue: "Currency" })}
            <input
              className="w-20 rounded-lg border border-neutral-300 px-2 py-1 uppercase"
              value={form.currency}
              maxLength={3}
              onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
              disabled={isLoading}
              aria-label={t("lab.pricing.currencyCode", { defaultValue: "Currency code" })}
            />
          </label>
        </div>

        <div className="overflow-auto rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-start text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2">{t("lab.pricing.colOrderSize", { defaultValue: "Order size" })}</th>
                <th className="px-3 py-2">{t("lab.pricing.colFirstMorph", { defaultValue: "First morph test" })}</th>
                <th className="px-3 py-2">
                  {t("lab.pricing.colEachAdditional", { defaultValue: "Each additional morph test" })}
                </th>
                <th className="px-3 py-2">{t("lab.pricing.colSexDetermination", { defaultValue: "Sex determination" })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {TIERS.map((tier) => (
                <tr key={tier.key}>
                  <td className="px-3 py-2 font-medium text-neutral-900">{tierLabel(t, tier.key)}</td>
                  {[tier.first, tier.additional, tier.sex].map((field) => (
                    <td key={field} className="px-3 py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        className="w-28 rounded-lg border border-neutral-300 px-2 py-1"
                        value={form[field]}
                        onChange={(event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))}
                        disabled={isLoading}
                        aria-label={t("lab.pricing.priceFieldAria", {
                          defaultValue: "{{tier}}: {{field}}",
                          tier: tierLabel(t, tier.key),
                          field: field.includes("sex")
                            ? t("lab.pricing.fieldSexDetermination", { defaultValue: "sex determination" })
                            : field.includes("Additional")
                              ? t("lab.pricing.fieldAdditionalMorph", { defaultValue: "additional morph test" })
                              : t("lab.pricing.fieldFirstMorph", { defaultValue: "first morph test" }),
                        })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {saveState.error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{saveState.error}</div>
        ) : null}
        {saveState.message ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{saveState.message}</div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading || saveState.saving || !isDirty}
          >
            {saveState.saving
              ? t("lab.pricing.saving", { defaultValue: "Saving…" })
              : t("lab.pricing.save", { defaultValue: "Save prices" })}
          </button>
          <span className="text-xs text-neutral-500">
            {t("lab.pricing.saveHelp", {
              defaultValue:
                "Orders already placed keep the price they were quoted. Only owners and administrators can change prices.",
            })}
          </span>
        </div>
      </form>

      <section className="space-y-4 rounded-2xl border border-neutral-200 p-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-neutral-900">
            {t("lab.pricing.previewTitle", { defaultValue: "What a breeder would pay" })}
          </h2>
          <p className="text-sm text-neutral-600">
            {t("lab.pricing.previewHelp", {
              defaultValue:
                "Priced by the same calculation as a real order, using your saved prices and the tests breeders can see.",
            })}
          </p>
        </div>

        {isLoading ? (
          <div className="text-sm text-neutral-500">{t("lab.common.loading", { defaultValue: "Loading…" })}</div>
        ) : !orderableTests.length ? (
          <div className="rounded-xl border border-dashed border-neutral-300 px-3 py-3 text-sm text-neutral-600">
            <Trans
              i18nKey="lab.pricing.noTests"
              defaults="No tests are on offer to breeders yet. Add one in the <0>Test Catalog</0> to preview a quote."
              components={[<a key="catalog" className="underline" href="#/lab/test-catalog" />]}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 text-sm">
              <label className="text-neutral-700" htmlFor="animal-count">
                {t("lab.pricing.animalsInOrder", { defaultValue: "Animals in order" })}
              </label>
              <input
                id="animal-count"
                type="number"
                min={1}
                max={60}
                className="w-24 rounded-lg border border-neutral-300 px-2 py-1"
                value={animals.length}
                onChange={(event) => setAnimalCount(event.target.value)}
              />
              {quote ? (
                <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
                  {tierLabel(t, quote.tier)}
                </span>
              ) : null}
            </div>

            <div className="space-y-3">
              {animals.map((animal, index) => (
                <fieldset key={`animal-row-${index}`} className="rounded-xl border border-neutral-200 p-3">
                  <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">
                    {t("lab.pricing.animalNumber", { defaultValue: "Animal {{number}}", number: index + 1 })}
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {orderableTests.map((test) => (
                      <label key={`${index}-${test.id}`} className="flex items-center gap-2 rounded-lg border border-neutral-200 px-2 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={animal.selectedTestIds.includes(test.id)}
                          onChange={() => toggleAnimalTest(index, test.id)}
                        />
                        <span>{test.name}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            {quoteError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{quoteError}</div>
            ) : null}

            {quote ? (
              <div className="overflow-auto rounded-xl border border-neutral-200">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-start text-xs text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">{t("lab.pricing.colAnimal", { defaultValue: "Animal" })}</th>
                      <th className="px-3 py-2">{t("lab.pricing.colFirstMorph", { defaultValue: "First morph test" })}</th>
                      <th className="px-3 py-2">
                        {t("lab.pricing.colAdditionalMorphs", { defaultValue: "Additional morph tests" })}
                      </th>
                      <th className="px-3 py-2">{t("lab.pricing.colSex", { defaultValue: "Sex" })}</th>
                      <th className="px-3 py-2">{t("lab.pricing.colPanels", { defaultValue: "Panels" })}</th>
                      <th className="px-3 py-2">{t("lab.pricing.colLineTotal", { defaultValue: "Line total" })}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {(quote.perAnimal || []).map((row, index) => (
                      <tr key={`quote-${index}`}>
                        <td className="px-3 py-2 font-medium text-neutral-900">
                          {t("lab.pricing.animalNumber", { defaultValue: "Animal {{number}}", number: index + 1 })}
                          <div className="text-xs font-normal text-neutral-500">
                            {(animals.filter((a) => a.selectedTestIds.length)[index]?.selectedTestIds || [])
                              .map((id) => testNameById.get(id))
                              .filter(Boolean)
                              .join(", ")}
                          </div>
                        </td>
                        <td className="px-3 py-2">{formatMoney(row.morphBaseCost, quote.currency || currency)}</td>
                        <td className="px-3 py-2">{formatMoney(row.additionalMorphCost, quote.currency || currency)}</td>
                        <td className="px-3 py-2">{formatMoney(row.sexCost, quote.currency || currency)}</td>
                        <td className="px-3 py-2">{formatMoney(row.panelCost, quote.currency || currency)}</td>
                        <td className="px-3 py-2 font-semibold text-neutral-900">{formatMoney(row.total, quote.currency || currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-neutral-50 text-sm">
                    <tr>
                      <td className="px-3 py-2 font-semibold text-neutral-900" colSpan={5}>
                        {t("lab.pricing.orderTotal", { defaultValue: "Order total" })}
                      </td>
                      <td className="px-3 py-2 font-semibold text-neutral-900">{formatMoney(quote.total, quote.currency || currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : !quoteError ? (
              <div className="text-sm text-neutral-500">
                {t("lab.pricing.tickToPrice", { defaultValue: "Tick a test to see the price." })}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
