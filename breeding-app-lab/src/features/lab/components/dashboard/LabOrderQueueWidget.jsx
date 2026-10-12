import React from "react";
import { useTranslation } from "react-i18next";
import { ORDER_PAYMENT_STATUS_TONES } from "../../../../types/labStatus";
import { ORDER_STATUS_TONES } from "../../constants/orderStatuses";
import { orderStatusLabel, paymentStatusLabel } from "../../constants/statusLabelsI18n";

const toneClass = {
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString();
};

const StatusBadge = ({ status }) => {
  const { t } = useTranslation();
  const label = orderStatusLabel(t, status);
  const tone = ORDER_STATUS_TONES[status] || "neutral";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

const PaymentBadge = ({ paymentStatus }) => {
  const { t } = useTranslation();
  const label = paymentStatusLabel(t, paymentStatus);
  const tone = ORDER_PAYMENT_STATUS_TONES[paymentStatus] || "neutral";
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium ${toneClass[tone] || toneClass.neutral}`}>
      {label}
    </span>
  );
};

export default function LabOrderQueueWidget({
  title,
  description,
  orders = [],
  emptyMessage,
  onOpenOrder,
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          <p className="mt-1 text-xs text-neutral-600">{description}</p>
        </div>
        <span className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-700">
          {orders.length}
        </span>
      </div>

      {!orders.length ? (
        <div className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-600">
          {emptyMessage}
        </div>
      ) : (
        <>
          {/* Card list on narrow screens — the wide table below needs horizontal
              scrolling to fit six columns, so phones get a stacked card layout
              with the same data instead. */}
          <div className="mt-3 space-y-2 sm:hidden">
            {orders.map((order) => (
              <div key={order.id} className="rounded-xl border border-neutral-200 bg-white p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-neutral-800"><bdi>{order.orderNumber || order.id}</bdi></div>
                    <div className="text-xs text-neutral-500">
                      {t("lab.queue.animal", { defaultValue: "Animal:" })} {order.animalId || "-"}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">{formatDate(order.submittedAt || order.createdAt)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={order.status} />
                  <PaymentBadge paymentStatus={order.paymentStatus || "pending"} />
                </div>
                <div className="truncate text-xs text-neutral-700" title={(order.requestedTests || []).join(", ")}>
                  {(order.requestedTests || []).join(", ") || "-"}
                </div>
                <button
                  type="button"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs hover:border-neutral-400"
                  onClick={() => onOpenOrder?.(order.id)}
                >
                  {t("lab.queue.viewDetails", { defaultValue: "View details" })}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 hidden overflow-auto rounded-xl border border-neutral-200 sm:block">
          <table className="min-w-[820px] w-full text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("lab.common.colOrder", { defaultValue: "Order" })}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("lab.common.colStatus", { defaultValue: "Status" })}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("lab.common.colPayment", { defaultValue: "Payment" })}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("lab.common.colDate", { defaultValue: "Date" })}</th>
                <th className="px-3 py-2 text-start font-semibold">
                  {t("lab.common.requestedTests", { defaultValue: "Requested Tests" })}
                </th>
                <th className="px-3 py-2 text-start font-semibold">{t("lab.common.colAction", { defaultValue: "Action" })}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-neutral-100 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-neutral-800"><bdi>{order.orderNumber || order.id}</bdi></div>
                    <div className="text-xs text-neutral-500">
                      {t("lab.queue.animal", { defaultValue: "Animal:" })} {order.animalId || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-3 py-2">
                    <PaymentBadge paymentStatus={order.paymentStatus || "pending"} />
                  </td>
                  <td className="px-3 py-2 text-neutral-700">
                    {formatDate(order.submittedAt || order.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="max-w-xs truncate text-neutral-700" title={(order.requestedTests || []).join(", ")}>
                      {(order.requestedTests || []).join(", ") || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs hover:border-neutral-400"
                      onClick={() => onOpenOrder?.(order.id)}
                    >
                      {t("lab.queue.viewDetails", { defaultValue: "View details" })}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </section>
  );
}
