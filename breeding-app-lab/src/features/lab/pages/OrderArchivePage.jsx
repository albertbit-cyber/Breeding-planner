import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createLabApiClient } from "../api/client";
import { orderStatusLabel } from "../constants/statusLabelsI18n";

/**
 * Orders the laboratory has filed away, by year and month.
 *
 * Archiving is not deleting: everything the order owned is still here, and
 * "Restore" puts it straight back into the working queues. The grouping is by
 * *archive* date rather than order date, because the question this page answers
 * is "what did we file away, and when" — an order taken in last November and
 * closed out in January belongs where the lab put it, not where it arrived.
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Display label for a month group; the grouping itself keeps English labels.
const monthLabel = (t, monthIndex) => {
  switch (monthIndex) {
    case 0:
      return t("lab.archive.month.january", { defaultValue: "January" });
    case 1:
      return t("lab.archive.month.february", { defaultValue: "February" });
    case 2:
      return t("lab.archive.month.march", { defaultValue: "March" });
    case 3:
      return t("lab.archive.month.april", { defaultValue: "April" });
    case 4:
      return t("lab.archive.month.may", { defaultValue: "May" });
    case 5:
      return t("lab.archive.month.june", { defaultValue: "June" });
    case 6:
      return t("lab.archive.month.july", { defaultValue: "July" });
    case 7:
      return t("lab.archive.month.august", { defaultValue: "August" });
    case 8:
      return t("lab.archive.month.september", { defaultValue: "September" });
    case 9:
      return t("lab.archive.month.october", { defaultValue: "October" });
    case 10:
      return t("lab.archive.month.november", { defaultValue: "November" });
    case 11:
      return t("lab.archive.month.december", { defaultValue: "December" });
    default:
      return t("lab.archive.undated", { defaultValue: "Undated" });
  }
};

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString();
};

const toTime = (value) => {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

/**
 * Groups orders into years, each holding months, each holding orders — all
 * sorted newest first, which is the order someone looking for a recent order
 * scans in.
 *
 * An order whose archive date is unreadable is not dropped: it is collected
 * under "Undated" so nothing can silently disappear from the archive, which
 * would be the one failure this page must not have.
 */
export const groupOrdersByArchiveDate = (orders) => {
  const rows = Array.isArray(orders) ? orders : [];
  const years = new Map();

  rows.forEach((order) => {
    const parsed = new Date(order?.archivedAt || "");
    const valid = !Number.isNaN(parsed.getTime());
    const yearKey = valid ? parsed.getFullYear() : "Undated";
    const monthIndex = valid ? parsed.getMonth() : -1;

    if (!years.has(yearKey)) years.set(yearKey, new Map());
    const months = years.get(yearKey);
    if (!months.has(monthIndex)) months.set(monthIndex, []);
    months.get(monthIndex).push(order);
  });

  const sortedYears = [...years.entries()].sort((a, b) => {
    if (a[0] === "Undated") return 1;
    if (b[0] === "Undated") return -1;
    return b[0] - a[0];
  });

  return sortedYears.map(([year, months]) => {
    const sortedMonths = [...months.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([monthIndex, monthOrders]) => ({
        key: `${year}-${monthIndex}`,
        monthIndex,
        label: monthIndex >= 0 ? MONTH_NAMES[monthIndex] : "Undated",
        orders: [...monthOrders].sort((a, b) => toTime(b.archivedAt) - toTime(a.archivedAt)),
      }));

    return {
      key: String(year),
      label: String(year),
      count: sortedMonths.reduce((sum, month) => sum + month.orders.length, 0),
      months: sortedMonths,
    };
  });
};

export default function OrderArchivePage() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [restoringId, setRestoringId] = useState("");
  const [restoreError, setRestoreError] = useState("");
  // Which years are open. The most recent one is expanded on arrival because
  // that is overwhelmingly what someone opening the archive is looking for.
  const [openYears, setOpenYears] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const api = createLabApiClient();
      const rows = await api.listLabTestOrders("archived");
      setOrders(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setOrders([]);
      setError(err instanceof Error ? err.message : t("lab.archive.loadFailed", { defaultValue: "Failed to load the archive." }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) => {
      const haystack = [
        order.orderNumber,
        order.id,
        order.animalId,
        ...(Array.isArray(order.animalIds) ? order.animalIds : []),
        ...(Array.isArray(order.requestedTests) ? order.requestedTests : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [orders, query]);

  const groups = useMemo(() => groupOrdersByArchiveDate(filtered), [filtered]);

  // Searching narrows to what the user is looking for, so everything opens;
  // otherwise only the newest year does.
  const isSearching = Boolean(String(query || "").trim());
  const expandedYears = useMemo(() => {
    if (isSearching) return new Set(groups.map((group) => group.key));
    if (openYears) return openYears;
    return new Set(groups.slice(0, 1).map((group) => group.key));
  }, [groups, openYears, isSearching]);

  const toggleYear = (key) => {
    const next = new Set(expandedYears);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpenYears(next);
  };

  const openOrder = (orderId) => {
    if (typeof window === "undefined") return;
    window.location.hash = `/lab/orders/${encodeURIComponent(String(orderId || "").trim())}`;
  };

  const restore = async (orderId) => {
    const normalized = String(orderId || "").trim();
    if (!normalized || restoringId) return;
    setRestoringId(normalized);
    setRestoreError("");
    try {
      const api = createLabApiClient();
      await api.unarchiveLabOrder(normalized);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lab:test-order-updated", {
          detail: { orderId: normalized, archived: false },
        }));
      }
      // Drop it locally rather than refetching: it has just left the archive,
      // and a full reload would flash the whole list for a one-row change.
      setOrders((prev) => prev.filter((order) => order.id !== normalized));
    } catch (err) {
      setRestoreError(
        err instanceof Error ? err.message : t("lab.archive.restoreFailed", { defaultValue: "Failed to restore the order." })
      );
    } finally {
      setRestoringId("");
    }
  };

  const totalCount = orders.length;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{t("lab.shell.nav.archive", { defaultValue: "Archive" })}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {t("lab.archive.subtitle", {
              defaultValue:
                "Orders filed away from the working queues, by the year and month they were archived. Nothing here has been deleted — restore an order to put it back on the dashboard.",
            })}
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          disabled={loading}
          onClick={load}
        >
          {loading
            ? t("lab.common.refreshing", { defaultValue: "Refreshing..." })
            : t("lab.common.refresh", { defaultValue: "Refresh" })}
        </button>
      </header>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
            {t("lab.archive.searchLabel", { defaultValue: "Search the archive" })}
          </span>
          <input
            className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("lab.archive.searchPlaceholder", { defaultValue: "Order number, snake ID, test name" })}
          />
        </label>
        {!loading && !error ? (
          <p className="mt-2 text-xs text-neutral-500">
            {isSearching
              ? t("lab.archive.matchCount", {
                  count: totalCount,
                  matched: filtered.length,
                  defaultValue_one: "{{matched}} of {{count}} archived order match.",
                  defaultValue_other: "{{matched}} of {{count}} archived orders match.",
                })
              : t("lab.archive.totalCount", {
                  count: totalCount,
                  defaultValue_one: "{{count}} archived order.",
                  defaultValue_other: "{{count}} archived orders.",
                })}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
          {t("lab.archive.loading", { defaultValue: "Loading the archive..." })}
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {restoreError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{restoreError}</div>
      ) : null}

      {!loading && !error && !groups.length ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
          {isSearching
            ? t("lab.archive.noMatches", { defaultValue: "No archived orders match that search." })
            : t("lab.archive.empty", {
                defaultValue: "Nothing archived yet. Archive an order from its details page to file it away here.",
              })}
        </div>
      ) : null}

      {!loading && !error
        ? groups.map((year) => {
            const expanded = expandedYears.has(year.key);
            return (
              <section key={year.key} className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
                  onClick={() => toggleYear(year.key)}
                  aria-expanded={expanded}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-neutral-400" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                    <span className="text-lg font-semibold text-neutral-900">
                      {year.key === "Undated" ? t("lab.archive.undated", { defaultValue: "Undated" }) : year.label}
                    </span>
                  </span>
                  <span className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700">
                    {t("lab.archive.orderCount", {
                      count: year.count,
                      defaultValue_one: "{{count}} order",
                      defaultValue_other: "{{count}} orders",
                    })}
                  </span>
                </button>

                {expanded ? (
                  <div className="border-t border-neutral-100">
                    {year.months.map((month) => (
                      <div key={month.key} className="border-b border-neutral-100 last:border-b-0">
                        <div className="flex items-center justify-between gap-3 bg-neutral-50 px-4 py-2">
                          <h3 className="text-sm font-semibold text-neutral-700">{monthLabel(t, month.monthIndex)}</h3>
                          <span className="text-xs text-neutral-500">
                            {t("lab.archive.orderCount", {
                              count: month.orders.length,
                              defaultValue_one: "{{count}} order",
                              defaultValue_other: "{{count}} orders",
                            })}
                          </span>
                        </div>
                        <div className="overflow-auto">
                          <table className="w-full min-w-[820px] text-sm">
                            <thead className="text-xs uppercase tracking-wide text-neutral-500">
                              <tr>
                                <th className="px-4 py-2 text-start font-semibold">{t("lab.common.colOrder", { defaultValue: "Order" })}</th>
                                <th className="px-4 py-2 text-start font-semibold">{t("lab.common.colSnake", { defaultValue: "Snake" })}</th>
                                <th className="px-4 py-2 text-start font-semibold">{t("lab.common.colStatus", { defaultValue: "Status" })}</th>
                                <th className="px-4 py-2 text-start font-semibold">{t("lab.common.submitted", { defaultValue: "Submitted" })}</th>
                                <th className="px-4 py-2 text-start font-semibold">{t("lab.archive.colArchived", { defaultValue: "Archived" })}</th>
                                <th className="px-4 py-2 text-start font-semibold">{t("lab.catalog.colActions", { defaultValue: "Actions" })}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {month.orders.map((order) => (
                                <tr key={order.id} className="border-t border-neutral-100">
                                  <td className="px-4 py-2 font-medium text-neutral-800">
                                    <bdi>{order.orderNumber || order.id}</bdi>
                                  </td>
                                  <td className="px-4 py-2 text-neutral-700">{order.animalId || "-"}</td>
                                  <td className="px-4 py-2 text-neutral-700">
                                    {orderStatusLabel(t, order.status)}
                                  </td>
                                  <td className="px-4 py-2 text-neutral-700">
                                    {formatDate(order.submittedAt || order.createdAt)}
                                  </td>
                                  <td className="px-4 py-2 text-neutral-700">{formatDate(order.archivedAt)}</td>
                                  <td className="px-4 py-2">
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs hover:border-neutral-500"
                                        onClick={() => openOrder(order.id)}
                                      >
                                        {t("lab.common.open", { defaultValue: "Open" })}
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-50"
                                        onClick={() => restore(order.id)}
                                        disabled={restoringId === order.id}
                                      >
                                        {restoringId === order.id
                                          ? t("lab.orderDetails.restoring", { defaultValue: "Restoring..." })
                                          : t("lab.archive.restore", { defaultValue: "Restore" })}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })
        : null}
    </section>
  );
}
