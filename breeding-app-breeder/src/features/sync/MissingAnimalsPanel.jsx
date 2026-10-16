import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { findMissingAnimalReferences } from "./missingAnimals";

/**
 * Settings → Backup: animals that pairings or breeding cards name but the collection does not
 * have. Each can be settled two ways, both of which sync to the other devices like any edit:
 * keep the name on its pairings while removing the link, and delete the breeding cards that name
 * it. Shown only once real animals are on this device, since before the first sync every animal
 * would look missing.
 */
export default function MissingAnimalsPanel({ snakes, pairings, cycles, onUnlinkFromPairings, onDeleteCycles, showAppConfirm }) {
  const { t } = useTranslation();
  const [notice, setNotice] = useState("");
  const hasRealAnimals = (Array.isArray(snakes) ? snakes : []).some((snake) => snake && snake.isDemo !== true);
  const missing = useMemo(
    () => (hasRealAnimals ? findMissingAnimalReferences({ snakes, pairings, cycles }) : []),
    [hasRealAnimals, snakes, pairings, cycles],
  );
  if (!missing.length) return null;

  const done = () => setNotice(t("setup.missingAnimals.done", { defaultValue: "Done. The change syncs to your other devices." }));

  const deleteCards = async (item) => {
    const ok = showAppConfirm
      ? await showAppConfirm(
        t("setup.missingAnimals.confirmDelete", {
          count: item.cycleIds.length,
          id: item.animalId,
          defaultValue: "Delete {{count}} breeding card(s) naming {{id}}? This cannot be undone.",
        }),
        { tone: "danger" },
      )
      : true;
    if (!ok) return;
    onDeleteCycles?.(item.cycleIds);
    done();
  };

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900" aria-labelledby="missing-animals-title">
      <h3 id="missing-animals-title" className="text-sm font-semibold">
        {t("setup.missingAnimals.title", { defaultValue: "Animals named but missing" })}
      </h3>
      <p className="mt-1 text-xs">
        {t("setup.missingAnimals.body", { defaultValue: "Pairings or breeding cards on this device name these animals, but they are not in your collection." })}
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {missing.map((item) => (
          <li key={item.animalId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs">
            <span>
              {t("setup.missingAnimals.row", {
                id: item.animalId,
                pairings: item.pairingIds.length,
                cards: item.cycleIds.length,
                defaultValue: "{{id}}: {{pairings}} pairing(s), {{cards}} breeding card(s)",
              })}
            </span>
            <span className="flex flex-wrap gap-2">
              {item.pairingIds.length ? (
                <button
                  type="button"
                  className="rounded-lg border border-amber-300 bg-white px-2 py-1"
                  onClick={() => { onUnlinkFromPairings?.(item.animalId); done(); }}
                >
                  {t("setup.missingAnimals.unlink", { defaultValue: "Keep name on pairings, remove link" })}
                </button>
              ) : null}
              {item.cycleIds.length ? (
                <button
                  type="button"
                  className="rounded-lg border border-rose-300 bg-white px-2 py-1 text-rose-700"
                  onClick={() => deleteCards(item)}
                >
                  {t("setup.missingAnimals.deleteCards", { defaultValue: "Delete cards naming it" })}
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {notice ? <p className="mt-2 text-xs" role="status">{notice}</p> : null}
    </section>
  );
}
