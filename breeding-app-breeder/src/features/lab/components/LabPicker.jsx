import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { help } from "../../help/help";
import { fetchLabDirectory } from "../../../shared/apiClient";
import { useBatchOrder } from "../contexts/BatchOrderContext";

/**
 * Choosing which laboratory to send samples to.
 *
 * This is the first step of ordering, not a setting tucked away somewhere:
 * every test and every price a breeder sees afterwards belongs to the lab
 * picked here. Nothing is shown from any other laboratory.
 */
export default function LabPicker({ onChosen, speciesId, speciesName }) {
  const { t } = useTranslation();
  const { selectedLabId, chooseLab, cartItems } = useBatchOrder();
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    // Narrowed to the species being ordered for: a corn snake keeper has no use
    // for a laboratory that only handles ball pythons.
    fetchLabDirectory(speciesId)
      .then((data) => setLabs(Array.isArray(data?.labs) ? data.labs : []))
      .catch((err) => setError(err instanceof Error ? err.message : t("lab.picker.loadFailed", { defaultValue: "Unable to load laboratories." })))
      .finally(() => setLoading(false));
  }, [speciesId]);

  const pick = (lab) => {
    chooseLab(lab);
    if (typeof onChosen === "function") onChosen(lab);
  };

  if (loading) {
    return <div className="text-sm text-neutral-500">{t("lab.picker.loading", { defaultValue: "Loading laboratories…" })}</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }

  if (!labs.length) {
    // Two different situations, and saying the wrong one sends people looking in
    // the wrong place. With a species, the directory was filtered to it and came
    // back empty -- a laboratory exists, it just has not said it tests this
    // animal. Without one, nothing was filtered, so there genuinely is no
    // laboratory listed at all.
    return (
      <div className="text-sm text-neutral-600">
        {speciesName
          ? t("lab.picker.noneForSpecies", { defaultValue: "No laboratory is receiving orders for {{species}} yet. A laboratory has to list the species it tests before it appears here.", species: speciesName })
          : t("lab.picker.noneAtAll", { defaultValue: "No laboratories are receiving orders right now. Please check back later." })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-neutral-900">{t("lab.picker.title", { defaultValue: "Choose a laboratory" })}</div>
      <p className="text-xs text-neutral-500">
        {speciesName
          ? `${t("lab.picker.forSpecies", { defaultValue: "Laboratories that test {{species}}.", species: speciesName })} `
          : `${t("lab.picker.everyLab", { defaultValue: "Showing every laboratory, because this animal has no species set." })} `}
        {t("lab.picker.help", { defaultValue: "Available tests, prices and turnaround all come from the laboratory you choose." })}
      </p>
      <ul className="space-y-2">
        {labs.map((lab) => {
          const isSelected = lab.organizationId === selectedLabId;
          return (
            <li key={lab.organizationId}>
              <button
                type="button"
                {...help('lab-choose-lab')}
                onClick={() => pick(lab)}
                aria-pressed={isSelected}
                className={`w-full rounded border p-3 text-start transition ${
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
                      {[lab.location, lab.testCount ? t("lab.picker.testCount", { defaultValue: "{{tests}} tests", tests: lab.testCount }) : null,
                        lab.turnaroundDays ? t("lab.picker.turnaround", { defaultValue: "~{{days}} day turnaround", days: lab.turnaroundDays }) : null]
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
          {t("lab.picker.switchClearsCart", {
            count: cartItems.length,
            defaultValue_one: "Choosing a different laboratory clears the {{count}} animal staged here, because the tests you selected belong to the current laboratory's catalogue.",
            defaultValue_other: "Choosing a different laboratory clears the {{count}} animals staged here, because the tests you selected belong to the current laboratory's catalogue.",
          })}
        </p>
      ) : null}
    </div>
  );
}
