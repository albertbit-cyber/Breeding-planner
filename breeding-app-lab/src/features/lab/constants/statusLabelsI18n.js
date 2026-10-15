// Translated labels for the status values the lab portal shows. Callers pass
// their own `t`; an unknown value falls back to the raw value, exactly as the
// plain *_STATUS_LABELS lookups did.
// i18n-namespace: common

/** Order workflow status (ShedOrderStatus). */
export const orderStatusLabel = (t, status) => {
  switch (status) {
    case "submitted":
      return t("lab.status.order.submitted", { defaultValue: "Submitted" });
    case "received":
      return t("lab.status.order.received", { defaultValue: "Sample Received" });
    case "in_progress":
      return t("lab.status.order.inProgress", { defaultValue: "Testing in Progress" });
    case "completed":
      return t("lab.status.order.completed", { defaultValue: "Completed" });
    case "cancelled":
      return t("lab.status.order.cancelled", { defaultValue: "Cancelled" });
    default:
      return status;
  }
};

/** Order payment status (OrderPaymentStatus). */
export const paymentStatusLabel = (t, status) => {
  switch (status) {
    case "pending":
      return t("lab.status.payment.pending", { defaultValue: "Pending" });
    case "paid":
      return t("lab.status.payment.paid", { defaultValue: "Paid" });
    case "failed":
      return t("lab.status.payment.failed", { defaultValue: "Failed" });
    case "refunded":
      return t("lab.status.payment.refunded", { defaultValue: "Refunded" });
    case "manually_approved":
      return t("lab.status.payment.manuallyApproved", { defaultValue: "Manually Approved" });
    default:
      return status;
  }
};

/** Physical sample status (SampleStatus). */
export const sampleStatusLabel = (t, status) => {
  switch (status) {
    case "expected":
      return t("lab.status.sample.expected", { defaultValue: "Pending" });
    case "label_generated":
      return t("lab.status.sample.labelGenerated", { defaultValue: "Label Generated" });
    case "sample_sent":
      return t("lab.status.sample.sent", { defaultValue: "Shipped" });
    case "sample_received":
      return t("lab.status.sample.received", { defaultValue: "Shed Received" });
    case "intake_approved":
      return t("lab.status.sample.intakeApproved", { defaultValue: "Intake Approved" });
    case "intake_rejected":
      return t("lab.status.sample.intakeRejected", { defaultValue: "Intake Rejected" });
    case "testing_in_progress":
      return t("lab.status.sample.inProcess", { defaultValue: "In Process" });
    case "consumed":
      return t("lab.status.sample.consumed", { defaultValue: "Completed" });
    case "archived":
      return t("lab.status.sample.archived", { defaultValue: "Results Available" });
    default:
      return status;
  }
};

/** Per-gene result option (LabResultStatus); `fallback` is the untranslated label. */
export const resultStatusLabel = (t, value, fallback) => {
  switch (value) {
    case "not_detected":
      return t("lab.status.result.notDetected", { defaultValue: "Negative" });
    case "not_present":
      return t("lab.status.result.notPresent", { defaultValue: "Not present" });
    case "heterozygous":
      return t("lab.status.result.heterozygous", { defaultValue: "Heterozygous" });
    case "homozygous":
      return t("lab.status.result.homozygous", { defaultValue: "Homozygous" });
    case "single_gene":
      return t("lab.status.result.singleGene", { defaultValue: "Single gene" });
    case "super_form":
      return t("lab.status.result.superForm", { defaultValue: "Super form" });
    case "present":
      return t("lab.status.result.present", { defaultValue: "Present" });
    case "visual":
      return t("lab.status.result.visual", { defaultValue: "Visual" });
    case "male":
      return t("lab.status.result.male", { defaultValue: "Male" });
    case "female":
      return t("lab.status.result.female", { defaultValue: "Female" });
    default:
      return fallback ?? value;
  }
};

/** How a gene is inherited, shown next to its result dropdown. */
export const inheritanceKindLabel = (t, kind) => {
  switch (kind) {
    case "recessive":
      return t("lab.inheritance.recessive", { defaultValue: "Recessive" });
    case "incomplete_dominant":
      return t("lab.inheritance.incompleteDominant", { defaultValue: "Incomplete dominant" });
    case "dominant":
      return t("lab.inheritance.dominant", { defaultValue: "Dominant" });
    case "sex":
      return t("lab.inheritance.sex", { defaultValue: "Sex test" });
    default:
      return t("lab.inheritance.unknown", { defaultValue: "Inheritance unknown" });
  }
};
