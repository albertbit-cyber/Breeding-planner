import React, { useEffect, useState } from "react";
import { fetchLabDirectory } from "../../../shared/apiClient";
import { useBatchOrder } from "../contexts/BatchOrderContext";

/**
 * Choosing which laboratory to send samples to.
 *
 * This is the first step of ordering, not a setting tucked away somewhere:
 * every test and every price a breeder sees afterwards belongs to the lab
 * picked here. Nothing is shown from any other laboratory.
 */
export default function LabPicker({ onChosen }) {
  const { selectedLabId, chooseLab, cartItems } = useBatchOrder();
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchLabDirectory()
      .then((data) => setLabs(Array.isArray(data?.labs) ? data.labs : []))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load laboratories."))
      .finally(() => setLoading(false));
  }, []);

  const pick = (lab) => {
    chooseLab(lab);
    if (typeof onChosen === "function") onChosen(lab);
  };

  if (loading) {
    return <div className="text-sm text-neutral-500">Loading laboratories…</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  if (!labs.length) {
    return (
      <div className="text-sm text-neutral-600">
        No laboratories are accepting orders right now. Please check back later.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-neutral-900">Choose a laboratory</div>
      <p className="text-xs text-neutral-500">
        Available tests, prices and turnaround all come from the laboratory you choose.
      </p>
      <ul className="space-y-2">
        {labs.map((lab) => {
          const isSelected = lab.organizationId === selectedLabId;
          return (
            <li key={lab.organizationId}>
              <button
                type="button"
                onClick={() => pick(lab)}
                aria-pressed={isSelected}
                className={`w-full rounded border p-3 text-left transition ${
                  isSelected ? "border-emerald-500 bg-emerald-50" : "border-neutral-200 hover:border-neutral-400"
                }`}
              >
                <div className="flex items-center gap-3">
                  {lab.logoUrl ? (
                    <img src={lab.logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-neutral-900">{lab.labName}</div>
                    <div className="truncate text-xs text-neutral-500">
                      {[lab.location, lab.testCount ? `${lab.testCount} tests` : null,
                        lab.turnaroundDays ? `~${lab.turnaroundDays} day turnaround` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
                {lab.publicDescription ? (
                  <p className="mt-2 text-xs text-neutral-600">{lab.publicDescription}</p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {selectedLabId && cartItems.length ? (
        <p className="text-xs text-amber-700">
          Choosing a different laboratory clears the {cartItems.length} animal
          {cartItems.length === 1 ? "" : "s"} staged here, because the tests you selected belong to
          the current laboratory's catalogue.
        </p>
      ) : null}
    </div>
  );
}
