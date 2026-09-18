import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchMyLabProfile } from "../../../shared/apiClient";
import { createLabApiClient } from "../api/client";
import {
  CATALOGUE_TEMPLATE_FILENAME,
  catalogueTemplateBytes,
} from "./buildCatalogueTemplate";
import { noticesFor, toOfferingPayload } from "./offeringPayload";
import { parseCatalogueSheet } from "./parseCatalogueSheet";
import { readCatalogueWorkbook } from "./readCatalogueWorkbook";

/**
 * Publishing a whole catalogue from the spreadsheet a laboratory was sent when
 * it was invited.
 *
 * The screen is deliberately linear — get the file, fill it in, see exactly what
 * it says, publish — because this is the first thing a new laboratory does here
 * and it is doing it with sixty-eight tests and no prior idea of what this
 * platform expects. Nothing is written until the review step has been shown, and
 * the review step is the honest one: every row that will not import, every row
 * that will overwrite a test already on sale, and every quiet consequence that
 * would otherwise only surface on an invoice.
 */

const formatMoney = (cents) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(cents || 0) / 100);

const tierLabel = (offering) => {
  const { t1, t2, t3 } = offering.tierPricesCents;
  if (offering.testKind === "panel") return formatMoney(t1);
  if (t1 === t2 && t2 === t3) return formatMoney(t1);
  return `${formatMoney(t1)} / ${formatMoney(t2)} / ${formatMoney(t3)}`;
};

/**
 * A counted string in both its forms.
 *
 * These live on `defaultValue`, not in a locale file, so i18next never sees a
 * plural key to resolve and would print "1 example rows" as written. Choosing
 * the form here keeps the two spellings visible next to each other and gives the
 * scanner two real keys to pick up.
 */
const countText = (t, key, count, one, other) =>
  t(`${key}${count === 1 ? "_one" : "_other"}`, { count, defaultValue: count === 1 ? one : other });

const KIND_STYLE = {
  panel: "bg-emerald-100 text-emerald-800",
  sex: "bg-indigo-100 text-indigo-800",
  morph: "bg-neutral-100 text-neutral-700",
};

/** A numbered step, so the whole thing reads as a sequence rather than a form. */
function Step({ number, title, description, children, muted }) {
  return (
    <section
      className={`rounded-2xl border px-4 py-4 sm:px-5 ${
        muted ? "border-neutral-200 bg-neutral-50/60" : "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            muted ? "bg-neutral-200 text-neutral-600" : "bg-neutral-900 text-white"
          }`}
        >
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-neutral-600">{description}</p> : null}
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

export default function CatalogueImportPage() {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);

  const [servedSpecies, setServedSpecies] = useState([]);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState(null);
  const [readError, setReadError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  // Nobody deletes the examples. They are left out by default and the count is
  // shown, so a laboratory is never surprised by three tests it did not write.
  const [includeExamples, setIncludeExamples] = useState(false);

  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [published, setPublished] = useState(null);

  useEffect(() => {
    fetchMyLabProfile()
      .then((data) => setServedSpecies(data?.lab?.servedSpecies || []))
      .catch(() => setServedSpecies([]))
      .finally(() => setProfileLoaded(true));
  }, []);

  const speciesIds = useMemo(
    () => servedSpecies.map((entry) => String(entry.id)),
    [servedSpecies]
  );

  const parsed = useMemo(() => {
    if (!workbook) return null;
    const rows = includeExamples ? workbook.rows : workbook.rowsWithoutExamples;
    return parseCatalogueSheet(rows, speciesIds);
  }, [workbook, includeExamples, speciesIds]);

  const offerings = parsed?.offerings || [];

  const handleDownloadTemplate = useCallback(() => {
    // The Reference sheet is built from the species this laboratory has said it
    // serves, so every id it offers to copy is one that will actually validate.
    const bytes = catalogueTemplateBytes(servedSpecies);
    const url = URL.createObjectURL(
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = CATALOGUE_TEMPLATE_FILENAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [servedSpecies]);

  const resetUpload = useCallback(() => {
    setWorkbook(null);
    setFileName("");
    setReadError("");
    setPlan(null);
    setPlanError("");
    setPublishError("");
    setPublished(null);
    setIncludeExamples(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const acceptFile = useCallback(async (file) => {
    if (!file) return;
    setReadError("");
    setPlan(null);
    setPlanError("");
    setPublishError("");
    setPublished(null);
    setIncludeExamples(false);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      setWorkbook(readCatalogueWorkbook(buffer));
    } catch (error) {
      setWorkbook(null);
      setReadError(
        error instanceof Error && error.message
          ? error.message
          : t("lab.import.unreadable", {
              defaultValue:
                "This file could not be opened as a spreadsheet. Save it as .xlsx and try again.",
            })
      );
    }
  }, [t]);

  // The plan comes from the backend rather than being guessed here: only it
  // knows which of these names a laboratory already offers.
  useEffect(() => {
    if (!parsed || !offerings.length || published) {
      setPlan(null);
      return undefined;
    }
    let cancelled = false;
    setIsPlanning(true);
    setPlanError("");
    createLabApiClient()
      .importLabAvailableTests(offerings.map(toOfferingPayload), { dryRun: true })
      .then((result) => {
        if (!cancelled) setPlan(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setPlan(null);
        setPlanError(
          error instanceof Error
            ? error.message
            : t("lab.import.planFailed", { defaultValue: "Could not check this file against your catalogue." })
        );
      })
      .finally(() => {
        if (!cancelled) setIsPlanning(false);
      });
    return () => {
      cancelled = true;
    };
    // `offerings` is derived from `parsed`, which is the real input here.
  }, [parsed, published, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePublish = useCallback(async () => {
    setIsPublishing(true);
    setPublishError("");
    try {
      const result = await createLabApiClient().importLabAvailableTests(
        offerings.map(toOfferingPayload)
      );
      setPublished(result);
    } catch (error) {
      setPublishError(
        error instanceof Error
          ? error.message
          : t("lab.import.publishFailed", { defaultValue: "Nothing was imported." })
      );
    } finally {
      setIsPublishing(false);
    }
  }, [offerings, t]);

  const hasServedSpecies = speciesIds.length > 0;
  const notTheTemplate = Boolean(parsed && parsed.missingHeaders.length);
  const rejectedByPlan = plan?.rejected || [];
  const willImport = (plan?.willCreate?.length || 0) + (plan?.willUpdate?.length || 0);

  if (published) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 sm:px-5">
          <h1 className="text-lg font-semibold text-emerald-900">
            {t("lab.import.doneTitle", { defaultValue: "Your catalogue is published." })}
          </h1>
          <p className="mt-1 text-sm text-emerald-900/90">
            {countText(
              t,
              "lab.import.doneCreated",
              published.created,
              "1 test added",
              "{{count}} tests added"
            )}
            {", "}
            {countText(
              t,
              "lab.import.doneUpdated",
              published.updated,
              "1 updated.",
              "{{count}} updated."
            )}
          </p>
          {published.rejected.length ? (
            <p className="mt-2 text-sm text-emerald-900/90">
              {countText(
                t,
                "lab.import.doneSkipped",
                published.rejected.length,
                "One row was skipped and is listed below. Fix it in the file and upload it again — re-importing updates what is already here rather than duplicating it.",
                "{{count}} rows were skipped and are listed below. Fix them in the file and upload it again — re-importing updates what is already here rather than duplicating it."
              )}
            </p>
          ) : null}
        </div>

        {published.rejected.length ? (
          <RejectedTable rows={published.rejected} t={t} />
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              window.location.hash = "/lab/test-catalog";
            }}
            className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            {t("lab.import.goToCatalogue", { defaultValue: "Open the test catalogue" })}
          </button>
          <button
            type="button"
            onClick={resetUpload}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm hover:border-neutral-400"
          >
            {t("lab.import.importAnother", { defaultValue: "Import another file" })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-neutral-900">
          {t("lab.import.title", { defaultValue: "Import your catalogue" })}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          {t("lab.import.subtitle", {
            defaultValue:
              "Fill in one spreadsheet instead of adding every test through a form. Nothing is published until you have seen exactly what the file says.",
          })}
        </p>
      </header>

      <Step
        number={1}
        title={t("lab.import.step1Title", { defaultValue: "Download the template" })}
        description={t("lab.import.step1Body", {
          defaultValue:
            "One row per test. The Reference sheet lists the species ids to copy and explains every column; the example rows show the three kinds of test and can be deleted.",
        })}
      >
        {!profileLoaded ? (
          <p className="text-sm text-neutral-500">
            {t("common.loading", { defaultValue: "Loading..." })}
          </p>
        ) : hasServedSpecies ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              {t("lab.import.download", { defaultValue: "Download the spreadsheet" })}
            </button>
            <span className="text-xs text-neutral-500">
              {countText(
                t,
                "lab.import.speciesListed",
                speciesIds.length,
                "Listing the one species your laboratory serves.",
                "Listing the {{count}} species your laboratory serves."
              )}
            </span>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <p>
              {t("lab.import.noSpecies", {
                defaultValue:
                  "Say which species your laboratory tests first. A test has to be for something, and the template lists those species for you to copy.",
              })}
            </p>
            <button
              type="button"
              onClick={() => {
                window.location.hash = "/lab/settings";
              }}
              className="mt-2 rounded-xl border border-amber-400 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:border-amber-500"
            >
              {t("lab.import.goToSettings", { defaultValue: "Open Laboratory Settings" })}
            </button>
          </div>
        )}
      </Step>

      <Step
        number={2}
        title={t("lab.import.step2Title", { defaultValue: "Upload it back" })}
        description={t("lab.import.step2Body", {
          defaultValue:
            "Excel, Google Sheets or Numbers, saved as .xlsx or .csv. Column order does not matter and blank rows are ignored.",
        })}
        muted={!hasServedSpecies}
      >
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            acceptFile(event.dataTransfer?.files?.[0]);
          }}
          className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            isDragging ? "border-neutral-900 bg-neutral-50" : "border-neutral-300"
          }`}
        >
          <label className="inline-flex cursor-pointer flex-col items-center gap-2">
            <span className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:border-neutral-400">
              {fileName
                ? t("lab.import.chooseAnother", { defaultValue: "Choose a different file" })
                : t("lab.import.chooseFile", { defaultValue: "Choose a file" })}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(event) => acceptFile(event.target.files?.[0])}
            />
            <span className="text-xs text-neutral-500">
              {t("lab.import.orDrop", { defaultValue: "or drop it here" })}
            </span>
          </label>
        </div>

        <div aria-live="polite" className="mt-3 space-y-2">
          {fileName && !readError ? (
            <p className="text-sm text-neutral-700">
              <span className="font-medium">{fileName}</span>
              {workbook ? (
                <span className="text-neutral-500">
                  {" — "}
                  {t("lab.import.readFromSheet", {
                    defaultValue: 'read from the "{{sheet}}" sheet',
                    sheet: workbook.sheetName,
                  })}
                </span>
              ) : null}
            </p>
          ) : null}
          {readError ? (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {readError}
            </p>
          ) : null}
        </div>
      </Step>

      <Step
        number={3}
        title={t("lab.import.step3Title", { defaultValue: "Check what it says" })}
        description={
          parsed
            ? undefined
            : t("lab.import.step3Waiting", {
                defaultValue: "Once a file is chosen, everything it will do appears here.",
              })
        }
        muted={!parsed}
      >
        {!parsed ? null : notTheTemplate ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800">
            <p className="font-medium">
              {t("lab.import.notTemplate", {
                defaultValue: "This does not look like the catalogue template.",
              })}
            </p>
            <p className="mt-1">
              {t("lab.import.missingColumns", {
                defaultValue: "These columns are missing: {{columns}}.",
                columns: parsed.missingHeaders.join(", "),
              })}
            </p>
            <p className="mt-1">
              {t("lab.import.notTemplateFix", {
                defaultValue:
                  "Download a fresh copy and paste your tests into it, keeping the heading row.",
              })}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <ReviewSummary
              read={offerings.length}
              plan={plan}
              isPlanning={isPlanning}
              problems={parsed.problems.length}
              t={t}
            />

            {workbook.exampleRowCount ? (
              <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={includeExamples}
                  onChange={(event) => setIncludeExamples(event.target.checked)}
                />
                <span>
                  {countText(
                    t,
                    "lab.import.examplesFound",
                    workbook.exampleRowCount,
                    "An example row from the template is still in this file and is being left out. Tick this to import it anyway.",
                    "{{count}} example rows from the template are still in this file and are being left out. Tick this to import them anyway."
                  )}
                </span>
              </label>
            ) : null}

            {parsed.unknownHeaders.length ? (
              <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                {t("lab.import.unknownColumns", {
                  defaultValue: "Columns this importer does not use, and ignored: {{columns}}.",
                  columns: parsed.unknownHeaders.join(", "),
                })}
              </p>
            ) : null}

            {parsed.problems.length ? <ProblemTable problems={parsed.problems} t={t} /> : null}

            {rejectedByPlan.length ? <RejectedTable rows={rejectedByPlan} t={t} /> : null}

            {planError ? (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {planError}
              </p>
            ) : null}

            {offerings.length ? (
              <OfferingTable offerings={offerings} plan={plan} t={t} />
            ) : (
              <p className="rounded-xl border border-dashed border-neutral-300 px-3 py-6 text-center text-sm text-neutral-500">
                {t("lab.import.nothingToImport", {
                  defaultValue: "There are no tests in this file to import.",
                })}
              </p>
            )}
          </div>
        )}
      </Step>

      <Step
        number={4}
        title={t("lab.import.step4Title", { defaultValue: "Publish it" })}
        description={t("lab.import.step4Body", {
          defaultValue:
            "Tests matched by name are updated in place, so you can correct the file and upload it again without creating duplicates. Anything already in your catalogue that is not in this file is left alone.",
        })}
        muted={!willImport}
      >
        {publishError ? (
          <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {publishError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handlePublish}
          disabled={!willImport || isPlanning || isPublishing}
          className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-300"
        >
          {isPublishing
            ? t("lab.import.publishing", { defaultValue: "Publishing..." })
            : willImport
            ? countText(t, "lab.import.publishCount", willImport, "Publish one test", "Publish {{count}} tests")
            : t("lab.import.publish", { defaultValue: "Publish" })}
        </button>
      </Step>
    </div>
  );
}

/** The four numbers a laboratory needs before it presses the button. */
function ReviewSummary({ read, plan, isPlanning, problems, t }) {
  const cells = [
    { label: t("lab.import.statRead", { defaultValue: "read from the file" }), value: read },
    {
      label: t("lab.import.statNew", { defaultValue: "new tests" }),
      value: plan ? plan.willCreate.length : null,
    },
    {
      label: t("lab.import.statUpdated", { defaultValue: "update a test you offer" }),
      value: plan ? plan.willUpdate.length : null,
    },
    {
      label: t("lab.import.statSkipped", { defaultValue: "rows skipped" }),
      value: problems + (plan ? plan.rejected.length : 0),
      warn: true,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-neutral-500">{cell.label}</dt>
          <dd
            className={`text-lg font-semibold ${
              cell.warn && cell.value > 0 ? "text-amber-700" : "text-neutral-900"
            }`}
          >
            {cell.value === null
              ? isPlanning
                ? "…"
                : "—"
              : cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Rows the spreadsheet reader refused, by the row number the laboratory sees.
 *
 * A list rather than a table on purpose: the useful half of each entry is a
 * sentence, and a sentence in a table cell on a 390px screen becomes one word
 * per line. Aligned into columns from `sm` up, where there is room for it.
 */
function ProblemTable({ problems, t }) {
  return (
    <section className="overflow-hidden rounded-xl border border-amber-200">
      <h3 className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
        {countText(
          t,
          "lab.import.problemsTitle",
          problems.length,
          "One row will not be imported. Everything else still will.",
          "{{count}} rows will not be imported. Everything else still will."
        )}
      </h3>
      <div className="hidden gap-x-3 border-b border-neutral-100 bg-white px-3 py-2 text-xs text-neutral-500 sm:grid sm:grid-cols-[3.5rem_9rem_minmax(0,1fr)]">
        <span>{t("lab.import.colRow", { defaultValue: "Row" })}</span>
        <span>{t("lab.import.colColumn", { defaultValue: "Column" })}</span>
        <span>{t("lab.import.colProblem", { defaultValue: "What is wrong" })}</span>
      </div>
      <ul className="divide-y divide-neutral-100 bg-white">
        {problems.map((problem, index) => (
          <li
            key={`${problem.row}-${problem.column || ""}-${index}`}
            className="grid gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[3.5rem_9rem_minmax(0,1fr)] sm:items-baseline"
          >
            <span className="text-xs text-neutral-500 sm:text-neutral-700">
              <span className="sm:hidden">
                {t("lab.import.colRow", { defaultValue: "Row" })}{" "}
              </span>
              <span className="font-mono">{problem.row}</span>
              {problem.column ? <span className="sm:hidden"> · {problem.column}</span> : null}
            </span>
            <span className="hidden text-xs text-neutral-600 sm:block">{problem.column || "—"}</span>
            <span className="text-sm text-neutral-800">{problem.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Rows the backend refused. Distinct from the reader's problems: these read
 * correctly as a spreadsheet and are still not something this laboratory can
 * offer — a species it has not said it serves being the usual one.
 */
function RejectedTable({ rows, t }) {
  return (
    <section className="overflow-hidden rounded-xl border border-amber-200">
      <h3 className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
        {countText(
          t,
          "lab.import.rejectedTitle",
          rows.length,
          "One test your laboratory cannot offer as written.",
          "{{count}} tests your laboratory cannot offer as written."
        )}
      </h3>
      <ul className="divide-y divide-neutral-100 bg-white">
        {rows.map((row) => (
          <li
            key={`${row.position}-${row.name || ""}`}
            className="grid gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-baseline"
          >
            <span className="text-sm font-medium text-neutral-800">
              {row.name || t("lab.import.unnamed", { defaultValue: "(no name)" })}
            </span>
            <span className="text-sm text-neutral-800">{row.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Everything that will be published, as it will be published.
 *
 * Stacked on a phone and aligned into columns from `sm` up. The notices are
 * full sentences and belong under the test they are about, at either size.
 */
function OfferingTable({ offerings, plan, t }) {
  const updating = new Set((plan?.willUpdate || []).map((row) => row.name.trim().toLowerCase()));
  const retired = new Set(
    (plan?.willUpdate || [])
      .filter((row) => !row.active)
      .map((row) => row.name.trim().toLowerCase())
  );
  const rejected = new Set(
    (plan?.rejected || []).map((row) => String(row.name || "").trim().toLowerCase())
  );

  const columns = "sm:grid-cols-[minmax(0,1fr)_5rem_minmax(0,10rem)_minmax(0,12rem)]";

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200">
      <div
        className={`hidden gap-3 border-b border-neutral-100 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 sm:grid ${columns}`}
      >
        <span>{t("lab.import.colTest", { defaultValue: "Test" })}</span>
        <span>{t("lab.catalog.colKind", { defaultValue: "Kind" })}</span>
        <span>{t("lab.catalog.colSpecies", { defaultValue: "Species" })}</span>
        <span>{t("lab.import.colPrices", { defaultValue: "1-9 / 10-49 / 50+" })}</span>
      </div>
      <ul className="divide-y divide-neutral-100 bg-white">
        {offerings.map((offering) => {
          const key = offering.name.trim().toLowerCase();
          const notices = noticesFor(offering);
          const isRejected = rejected.has(key);
          return (
            <li
              key={key}
              className={`grid gap-x-3 gap-y-1 px-3 py-3 sm:items-baseline ${columns} ${
                isRejected ? "bg-neutral-50" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-medium ${isRejected ? "text-neutral-400 line-through" : "text-neutral-900"}`}
                  >
                    {offering.name}
                  </span>
                  {updating.has(key) ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">
                      {t("lab.import.badgeUpdate", { defaultValue: "updates an existing test" })}
                    </span>
                  ) : null}
                  {retired.has(key) ? (
                    <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-700">
                      {t("lab.import.badgeRetired", { defaultValue: "stays off sale" })}
                    </span>
                  ) : null}
                </div>
                {offering.aliases.length ? (
                  <div className="text-[11px] text-neutral-400">
                    {t("lab.catalog.alsoKnownAs", { defaultValue: "also" })}:{" "}
                    {offering.aliases.join(", ")}
                  </div>
                ) : null}
              </div>

              <div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    KIND_STYLE[offering.testKind] || KIND_STYLE.morph
                  }`}
                >
                  {offering.testKind}
                </span>
              </div>

              <div className="text-xs text-neutral-600">{offering.speciesIds.join(", ")}</div>

              <div className="text-xs text-neutral-700">
                {tierLabel(offering)}
                {offering.addonPriceCents !== undefined ? (
                  <div className="text-[11px] text-neutral-500">
                    {t("lab.import.asAddon", {
                      defaultValue: "{{price}} as an add-on",
                      price: formatMoney(offering.addonPriceCents),
                    })}
                  </div>
                ) : null}
              </div>

              {notices.length ? (
                <ul className="space-y-1 sm:col-span-4">
                  {notices.map((notice) => (
                    <li key={notice} className="max-w-prose text-[11px] text-amber-700">
                      {notice}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
