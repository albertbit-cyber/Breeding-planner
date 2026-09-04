import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

/**
 * The two mid-flight steps of a testing order, told to the breeder who is
 * waiting on it: their samples arrived, or the laboratory started work.
 *
 * Completion has its own template — that one carries results and a certificate,
 * and folding it in here would flatten the one message the breeder actually
 * waits for into a status ping. Cancellation is here because it is the same
 * shape of news: something happened to the order, nothing to collect.
 */
export type LabOrderStatusEvent = "received" | "in_progress" | "cancelled";

export type LabOrderStatusTemplateProps = {
  breederName: string | null;
  labName: string;
  orderNumber: string;
  animalCount: number;
  event: LabOrderStatusEvent;
  actionUrl: string;
};

export const LAB_ORDER_STATUS_TEMPLATE_KEY = "lab_order_status";
export const LAB_ORDER_STATUS_TEMPLATE_VERSION = 1;

const COPY: Record<LabOrderStatusEvent, { heading: string; subject: string; lead: (lab: string) => string; detail: string }> = {
  received: {
    heading: "Your samples arrived",
    subject: "Your samples arrived at the laboratory",
    lead: (lab) => `${lab} has received the samples for this order and checked them in.`,
    detail: "You will hear from us again when testing is complete. Nothing is needed from you in the meantime.",
  },
  in_progress: {
    heading: "Testing has started",
    subject: "Your shed test is now in progress",
    lead: (lab) => `${lab} has started testing the samples for this order.`,
    detail: "Results are published to your order as soon as they are confirmed.",
  },
  cancelled: {
    heading: "Your order was cancelled",
    subject: "Your shed test order was cancelled",
    lead: (lab) => `${lab} has cancelled this order.`,
    detail: "If you were not expecting this, contact the laboratory directly — they will have the reason.",
  },
};

const animalLine = (count: number): string =>
  count === 1 ? "1 animal" : `${count} animals`;

export const renderLabOrderStatusTemplate = (props: LabOrderStatusTemplateProps) => {
  const copy = COPY[props.event] || COPY.received;
  const greeting = props.breederName ? `Hello ${escapeHtml(props.breederName)},` : "Hello,";

  const bodyHtml = `
    <p>${greeting}</p>
    <p>${escapeHtml(copy.lead(props.labName))}</p>
    <p>
      <strong>Order ${escapeHtml(props.orderNumber)}</strong><br />
      ${escapeHtml(animalLine(props.animalCount))}
    </p>
    <p>${escapeHtml(copy.detail)}</p>
  `;

  const html = renderLayout({
    preheader: copy.lead(props.labName),
    heading: copy.heading,
    bodyHtml,
    ctaLabel: "View your order",
    ctaUrl: props.actionUrl,
  });

  const text = renderPlainText([
    props.breederName ? `Hello ${props.breederName},` : "Hello,",
    "",
    copy.lead(props.labName),
    "",
    `Order ${props.orderNumber}`,
    animalLine(props.animalCount),
    "",
    copy.detail,
    "",
    `View your order: ${props.actionUrl}`,
  ]);

  return { subject: `${copy.subject} (${props.orderNumber})`, html, text };
};
