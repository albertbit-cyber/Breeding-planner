import React from "react";
import LabOrderQueueWidget from "../components/dashboard/LabOrderQueueWidget.jsx";
import { useLabDashboardData } from "../hooks/useLabDashboardData";

const openOrderRoute = (orderId) => {
  if (typeof window === "undefined") return;
  const normalized = String(orderId || "").trim();
  if (!normalized) return;
  window.location.hash = `/lab/orders/${encodeURIComponent(normalized)}`;
};

export default function LabDashboardPage() {
  const { sections, isLoading, error, refetch } = useLabDashboardData();

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">ProHerper Lab Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Operational queues for order triage, payment follow-up, sample receipt, active testing, and completion tracking.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          disabled={isLoading}
          onClick={refetch}
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {isLoading ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
          Loading lab queues...
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!isLoading && !error ? (
        <div className="space-y-4">
          {sections.map((section) => (
            <LabOrderQueueWidget
              key={section.id}
              title={section.title}
              description={section.description}
              orders={section.orders}
              emptyMessage={section.emptyMessage}
              onOpenOrder={openOrderRoute}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
