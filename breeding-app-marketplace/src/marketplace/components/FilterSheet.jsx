import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { CATEGORIES, QUICK_GENES, cycleGene, geneState } from "../filters";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import { GeneTag } from "../ui/GeneTags";

/**
 * Everything the browse page cannot fit into six chips.
 *
 * The old sidebar held twelve controls open at all times, including a Category
 * select that was wired to nothing and two comma-separated text boxes for
 * including and excluding genes. Genes are a set here: click once to include,
 * again to exclude, again to clear.
 */
export default function FilterSheet({ open, filters, onApply, onClose, resultCount }) {
  const { t } = useTranslation("marketplace");
  const [draft, setDraft] = useState(filters);

  // Re-seed whenever the sheet is opened against a different filter set.
  const [seed, setSeed] = useState(filters);
  if (open && seed !== filters && draft === seed) {
    setSeed(filters);
    setDraft(filters);
  }

  const patch = (next) => setDraft((current) => ({ ...current, ...next, page: "" }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title={t("filters.title", { defaultValue: "Filters" })}
      footer={
        <>
          <Button
            variant="quiet"
            onClick={() => {
              const cleared = {
                sex: "",
                category: "",
                country: "",
                includeGenes: "",
                excludeGenes: "",
                minPrice: "",
                maxPrice: "",
                minWeight: "",
                maxWeight: "",
                minProvenance: "",
                shippingAvailable: "",
                pickupAvailable: "",
                verifiedOnly: "",
                availability: "",
                includeSold: "",
                page: "",
              };
              setDraft({ ...draft, ...cleared });
            }}
          >
            {t("filters.clearAll", { defaultValue: "Clear all" })}
          </Button>
          <Button variant="ink" onClick={() => onApply(draft)}>
            {resultCount === undefined
              ? t("filters.apply", { defaultValue: "Apply filters" })
              : t("filters.showCount", { defaultValue: "Show {{count}} animals", count: resultCount })}
          </Button>
        </>
      }
    >
      <fieldset className="mk-field">
        <legend className="mk-label">{t("filters.genes", { defaultValue: "Genes" })}</legend>
        <p className="mk-hint" style={{ marginTop: 0 }}>
          {t("filters.genesHint", {
            defaultValue: "Tap once to require a gene, again to rule it out.",
          })}
        </p>
        <div className="mk-genes">
          {QUICK_GENES.map((gene) => {
            const state = geneState(draft, gene);
            return (
              <GeneTag
                key={gene}
                label={gene}
                het={false}
                excluded={state === "exclude"}
                onClick={() => patch(cycleGene(draft, gene))}
                title={
                  state === "include"
                    ? t("filters.geneIncluded", { defaultValue: "Required — tap to rule out" })
                    : state === "exclude"
                      ? t("filters.geneExcluded", { defaultValue: "Ruled out — tap to clear" })
                      : t("filters.geneOff", { defaultValue: "Tap to require" })
                }
                style={state === "off" ? { opacity: 0.55 } : undefined}
              />
            );
          })}
        </div>
      </fieldset>

      <div className="mk-field">
        <span className="mk-label">{t("filters.sex", { defaultValue: "Sex" })}</span>
        <div className="mk-chiprow" style={{ padding: 0 }}>
          {["", "female", "male", "unknown"].map((value) => (
            <button
              key={value || "any"}
              type="button"
              className={`mk-chip ${draft.sex === value ? "is-on" : ""}`}
              onClick={() => patch({ sex: value })}
            >
              {value ? t(`sex.${value}`, { defaultValue: value }) : t("filters.any", { defaultValue: "Any" })}
            </button>
          ))}
        </div>
      </div>

      <label className="mk-field">
        <span className="mk-label">{t("filters.category", { defaultValue: "Life stage" })}</span>
        <select className="mk-select" value={draft.category} onChange={(event) => patch({ category: event.target.value })}>
          <option value="">{t("filters.any", { defaultValue: "Any" })}</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <div className="mk-row" style={{ gap: 12, alignItems: "flex-end" }}>
        <label className="mk-field mk-grow">
          <span className="mk-label">{t("filters.minPrice", { defaultValue: "Min price" })}</span>
          <input
            className="mk-input"
            type="number"
            min="0"
            inputMode="numeric"
            value={draft.minPrice}
            onChange={(event) => patch({ minPrice: event.target.value })}
            placeholder="0"
          />
        </label>
        <label className="mk-field mk-grow">
          <span className="mk-label">{t("filters.maxPrice", { defaultValue: "Max price" })}</span>
          <input
            className="mk-input"
            type="number"
            min="0"
            inputMode="numeric"
            value={draft.maxPrice}
            onChange={(event) => patch({ maxPrice: event.target.value })}
            placeholder={t("filters.any", { defaultValue: "Any" })}
          />
        </label>
      </div>

      <div className="mk-row" style={{ gap: 12, alignItems: "flex-end" }}>
        <label className="mk-field mk-grow">
          <span className="mk-label">{t("filters.minWeight", { defaultValue: "Min weight (g)" })}</span>
          <input
            className="mk-input"
            type="number"
            min="0"
            inputMode="numeric"
            value={draft.minWeight}
            onChange={(event) => patch({ minWeight: event.target.value })}
          />
        </label>
        <label className="mk-field mk-grow">
          <span className="mk-label">{t("filters.maxWeight", { defaultValue: "Max weight (g)" })}</span>
          <input
            className="mk-input"
            type="number"
            min="0"
            inputMode="numeric"
            value={draft.maxWeight}
            onChange={(event) => patch({ maxWeight: event.target.value })}
          />
        </label>
      </div>

      <label className="mk-field">
        <span className="mk-label">{t("filters.country", { defaultValue: "Country" })}</span>
        <input
          className="mk-input"
          value={draft.country}
          onChange={(event) => patch({ country: event.target.value })}
          placeholder={t("filters.countryPlaceholder", { defaultValue: "Belgium, Germany…" })}
        />
      </label>

      <div className="mk-field">
        <span className="mk-label">{t("filters.record", { defaultValue: "Record published" })}</span>
        <div className="mk-chiprow" style={{ padding: 0 }}>
          {[
            ["", t("filters.any", { defaultValue: "Any" })],
            ["2", t("filters.recordSome", { defaultValue: "Weights or lineage" })],
            ["3", t("filters.recordStrong", { defaultValue: "Three of four" })],
            ["4", t("provenance.full", { defaultValue: "Full record" })],
          ].map(([value, label]) => (
            <button
              key={value || "any"}
              type="button"
              className={`mk-chip ${draft.minProvenance === value ? "is-on" : ""}`}
              onClick={() => patch({ minProvenance: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mk-field">
        <span className="mk-label">{t("filters.more", { defaultValue: "More" })}</span>
        <div className="mk-chiprow" style={{ padding: 0 }}>
          <button
            type="button"
            className={`mk-chip ${draft.verifiedOnly ? "is-on" : ""}`}
            onClick={() => patch({ verifiedOnly: draft.verifiedOnly ? "" : "true" })}
          >
            {t("filters.verified", { defaultValue: "Verified breeders" })}
          </button>
          <button
            type="button"
            className={`mk-chip ${draft.shippingAvailable ? "is-on" : ""}`}
            onClick={() => patch({ shippingAvailable: draft.shippingAvailable ? "" : "true" })}
          >
            {t("filters.shipping", { defaultValue: "Ships" })}
          </button>
          <button
            type="button"
            className={`mk-chip ${draft.pickupAvailable ? "is-on" : ""}`}
            onClick={() => patch({ pickupAvailable: draft.pickupAvailable ? "" : "true" })}
          >
            {t("filters.pickup", { defaultValue: "Local pickup" })}
          </button>
          <button
            type="button"
            className={`mk-chip ${draft.includeSold ? "is-on" : ""}`}
            onClick={() => patch({ includeSold: draft.includeSold ? "" : "true" })}
          >
            {t("filters.includeSold", { defaultValue: "Include sold, as price comparison" })}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
