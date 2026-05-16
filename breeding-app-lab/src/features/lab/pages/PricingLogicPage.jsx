import React, { useEffect, useMemo, useState } from "react";
import { createLabApiClient } from "../api/client";
import { EUR_CURRENCY, MORPH_TIER_RULES, SEX_TIER_RULES, SEX_WITH_MORPH_ADD_ON_CENTS } from "../../../config/testPricing";
import { LAB_PRICING_EXAMPLE_ORDERS, LAB_TEST_CATALOG_SEEDS } from "../../../data/testCatalog";
import { calculateLabOrderPrice } from "../../../services/pricing/calculateLabOrderPrice";

const formatEuroFromCents = (value) => {
  if (!Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: EUR_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) / 100);
};

const toCatalogForPricing = (rows) =>
  (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category || "other",
    pricingType: row.pricingType || (String(row.category || "").toLowerCase().includes("sex") ? "sex" : "morph"),
    active: row.isActive !== false,
    description: row.description,
    sortOrder: Number(row.sortOrder || 0),
  }));

const createBlankAnimal = (index) => ({
  animalId: `animal-${index + 1}`,
  selectedTestIds: [],
});

export default function PricingLogicPage() {
  const [tests, setTests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [animals, setAnimals] = useState([createBlankAnimal(0)]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const api = createLabApiClient();
        const rows = await api.listLabAvailableTests();
        setTests(rows);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load test catalog.");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const pricingCatalog = useMemo(() => toCatalogForPricing(tests), [tests]);
  const activeCatalog = useMemo(
    () => pricingCatalog.filter((entry) => entry.active).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name)),
    [pricingCatalog]
  );

  const seedNameById = useMemo(() => {
    const map = new Map();
    LAB_TEST_CATALOG_SEEDS.forEach((seed) => {
      map.set(seed.id, seed.name);
    });
    return map;
  }, []);

  const breakdown = useMemo(() => calculateLabOrderPrice(animals, activeCatalog), [animals, activeCatalog]);

  const setAnimalCount = (nextCount) => {
    const count = Math.max(1, Math.min(60, Number(nextCount) || 1));
    setAnimals((prev) => {
      const copy = Array.isArray(prev) ? [...prev] : [];
      if (copy.length < count) {
        const next = [...copy];
        for (let index = copy.length; index < count; index += 1) {
          next.push(createBlankAnimal(index));
        }
        return next;
      }
      return copy.slice(0, count);
    });
  };

  const updateAnimalId = (index, animalId) => {
    setAnimals((prev) => prev.map((animal, rowIndex) => (rowIndex === index ? { ...animal, animalId } : animal)));
  };

  const toggleAnimalTest = (index, testId) => {
    setAnimals((prev) =>
      prev.map((animal, rowIndex) => {
        if (rowIndex !== index) return animal;
        const current = Array.isArray(animal.selectedTestIds) ? animal.selectedTestIds : [];
        if (current.includes(testId)) {
          return { ...animal, selectedTestIds: current.filter((id) => id !== testId) };
        }
        return { ...animal, selectedTestIds: [...current, testId] };
      })
    );
  };

  const applyExample = (exampleIndex) => {
    const template = LAB_PRICING_EXAMPLE_ORDERS[exampleIndex] || [];
    const activeIdByName = new Map();
    activeCatalog.forEach((test) => {
      activeIdByName.set(String(test.name || "").trim().toLowerCase(), test.id);
    });
    setAnimals(template.map((animal) => ({
      animalId: animal.animalId,
      selectedTestIds: animal.selectedTestIds
        .map((seedId) => {
          if (activeCatalog.some((catalogRow) => catalogRow.id === seedId)) return seedId;
          const seedName = seedNameById.get(seedId);
          if (!seedName) return "";
          return activeIdByName.get(String(seedName).toLowerCase()) || "";
        })
        .filter(Boolean),
    })));
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-neutral-900">Pricing &amp; Logic</h1>
        <p className="text-sm text-neutral-600">
          Centralized test catalog and pricing rules. Tier is selected by total animals in the order, then costs are applied per animal.
        </p>
      </header>

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</div>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-neutral-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-900">Pricing Rules Summary</h2>
          <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-600">Currency: {EUR_CURRENCY}</span>
        </div>
        <div className="overflow-auto rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Morph First Test</th>
                <th className="px-3 py-2">Additional Morph</th>
                <th className="px-3 py-2">Sex Only</th>
                <th className="px-3 py-2">Morph + Sex Add-on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {(["1-9", "10-49", "50+"]).map((tier) => (
                <tr key={tier}>
                  <td className="px-3 py-2 font-medium text-neutral-900">{tier} animals</td>
                  <td className="px-3 py-2">{formatEuroFromCents(MORPH_TIER_RULES[tier].firstMorphCents)}</td>
                  <td className="px-3 py-2">{formatEuroFromCents(MORPH_TIER_RULES[tier].additionalMorphCents)}</td>
                  <td className="px-3 py-2">{formatEuroFromCents(SEX_TIER_RULES[tier].sexPerAnimalCents)}</td>
                  <td className="px-3 py-2">{formatEuroFromCents(SEX_WITH_MORPH_ADD_ON_CENTS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-neutral-200 p-4">
        <h2 className="text-base font-semibold text-neutral-900">Test Catalog &amp; Pricing Type</h2>
        {isLoading ? (
          <div className="text-sm text-neutral-500">Loading catalog...</div>
        ) : (
          <div className="overflow-auto rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Pricing Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pricingCatalog.map((test) => (
                  <tr key={test.id}>
                    <td className="px-3 py-2 font-medium text-neutral-900">{test.name}</td>
                    <td className="px-3 py-2">{test.category}</td>
                    <td className="px-3 py-2">{test.pricingType}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${test.active ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"}`}>
                        {test.active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-600">{test.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-900">Live Order Pricing Preview</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => applyExample(0)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">Example 1</button>
            <button type="button" onClick={() => applyExample(1)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">Example 2</button>
            <button type="button" onClick={() => applyExample(2)} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">Example 3</button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <label className="text-neutral-700" htmlFor="animal-count">Animals in order</label>
          <input
            id="animal-count"
            type="number"
            min={1}
            max={60}
            className="w-24 rounded-lg border border-neutral-300 px-2 py-1"
            value={animals.length}
            onChange={(event) => setAnimalCount(event.target.value)}
          />
          <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs text-neutral-700">Selected tier: {breakdown.tier}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">Animals</div>
            <div className="mt-1 text-lg font-semibold text-neutral-900">{breakdown.animalCount}</div>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">Tier Applied</div>
            <div className="mt-1 text-lg font-semibold text-neutral-900">{breakdown.tier}</div>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">Morph Charges</div>
            <div className="mt-1 text-lg font-semibold text-neutral-900">{formatEuroFromCents(breakdown.totalMorphCharges)}</div>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">Sex Charges</div>
            <div className="mt-1 text-lg font-semibold text-neutral-900">{formatEuroFromCents(breakdown.totalSexCharges)}</div>
          </div>
          <div className="rounded-xl border border-neutral-900 bg-neutral-900 p-3 text-white">
            <div className="text-[11px] uppercase tracking-wide text-neutral-300">Grand Total</div>
            <div className="mt-1 text-lg font-semibold">{formatEuroFromCents(breakdown.total)}</div>
          </div>
        </div>

        <div className="space-y-3">
          {animals.map((animal, index) => (
            <div key={`animal-row-${index}`} className="rounded-xl border border-neutral-200 p-3">
              <div className="mb-2 flex items-center gap-2">
                <label className="text-xs uppercase tracking-wide text-neutral-500" htmlFor={`animal-id-${index}`}>Animal ID</label>
                <input
                  id={`animal-id-${index}`}
                  className="rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                  value={animal.animalId}
                  onChange={(event) => updateAnimalId(index, event.target.value)}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {activeCatalog.map((test) => {
                  const checked = animal.selectedTestIds.includes(test.id);
                  return (
                    <label key={`${animal.animalId}-${test.id}`} className="flex items-center gap-2 rounded-lg border border-neutral-200 px-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAnimalTest(index, test.id)}
                      />
                      <span>{test.name}</span>
                      <span className="ml-auto rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600">{test.pricingType}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-auto rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2">Animal</th>
                <th className="px-3 py-2">Morph Tests</th>
                <th className="px-3 py-2">Sex Selected</th>
                <th className="px-3 py-2">First Morph Test</th>
                <th className="px-3 py-2">Additional Morph Tests</th>
                <th className="px-3 py-2">Sex Add-on</th>
                <th className="px-3 py-2">Sex Only</th>
                <th className="px-3 py-2">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {breakdown.perAnimal.map((row) => (
                <tr key={`breakdown-${row.animalId}`}>
                  <td className="px-3 py-2 font-medium text-neutral-900">{row.animalId}</td>
                  <td className="px-3 py-2">{row.morphCount}</td>
                  <td className="px-3 py-2">{row.hasSexDetermination ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{formatEuroFromCents(row.morphBaseCost)}</td>
                  <td className="px-3 py-2">{formatEuroFromCents(row.additionalMorphCost)}</td>
                  <td className="px-3 py-2">{formatEuroFromCents(row.sexAddOnCost)}</td>
                  <td className="px-3 py-2">{formatEuroFromCents(row.sexOnlyCost)}</td>
                  <td className="px-3 py-2 font-semibold text-neutral-900">{formatEuroFromCents(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-neutral-50 text-sm">
              <tr>
                <td className="px-3 py-2 font-semibold text-neutral-900" colSpan={7}>Morph Charges</td>
                <td className="px-3 py-2 font-semibold text-neutral-900">{formatEuroFromCents(breakdown.totalMorphCharges)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-semibold text-neutral-900" colSpan={7}>Sex Charges</td>
                <td className="px-3 py-2 font-semibold text-neutral-900">{formatEuroFromCents(breakdown.totalSexCharges)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-semibold text-neutral-900" colSpan={7}>Order Total</td>
                <td className="px-3 py-2 font-semibold text-neutral-900">{formatEuroFromCents(breakdown.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
        <h2 className="mb-2 text-base font-semibold text-neutral-900">Admin Extensibility Notes</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Catalog records now include category, pricingType, active flag, description, and sortOrder.</li>
          <li>Pricing formulas are centralized in config/service modules and are not duplicated in UI components.</li>
          <li>Future admin settings can add custom tier prices without rewriting order preview logic.</li>
        </ul>
      </section>
    </div>
  );
}
