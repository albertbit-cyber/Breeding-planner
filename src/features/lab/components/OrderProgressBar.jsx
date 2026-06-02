import React from "react";

const STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "received", label: "Received" },
  { key: "in_progress", label: "Testing" },
  { key: "completed", label: "Done" },
];

// Map legacy status names (from toLegacyOrder) → step index
const STATUS_TO_STEP = {
  // backend / unified names
  submitted: 0,
  received: 1,
  in_progress: 2,
  completed: 3,
  // legacy names still in circulation
  order_created: 0,
  sample_received: 1,
  intake_approved: 1,
  testing_in_progress: 2,
  result_entered: 2,
  result_reviewed: 2,
  certificate_issued: 3,
};

export default function OrderProgressBar({ status }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
        <span>✕</span>
        <span>Order Cancelled</span>
      </div>
    );
  }

  const activeStep = STATUS_TO_STEP[status] ?? -1;

  return (
    <div className="flex items-center gap-0 text-xs select-none">
      {STEPS.map((step, index) => {
        const isCompleted = index < activeStep;
        const isActive = index === activeStep;

        const dotClass = isCompleted || isActive
          ? "h-5 w-5 rounded-full border-2 border-neutral-800 bg-neutral-800 text-white flex items-center justify-center shrink-0"
          : "h-5 w-5 rounded-full border-2 border-neutral-300 bg-white shrink-0";

        const labelClass = isActive
          ? "font-semibold text-neutral-900"
          : isCompleted
          ? "text-neutral-500"
          : "text-neutral-400";

        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center gap-1">
              <div className={dotClass}>
                {isCompleted && <span className="text-[9px] leading-none">✓</span>}
              </div>
              <span className={`whitespace-nowrap ${labelClass}`}>{step.label}</span>
            </div>
            {index < STEPS.length - 1 && (
              <div className={`mb-4 h-0.5 w-8 shrink-0 ${isCompleted ? "bg-neutral-800" : "bg-neutral-200"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
