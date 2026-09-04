import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

/**
 * The message the breeder has been waiting weeks for.
 *
 * It names what was found rather than only announcing that something was, because
 * "your results are ready" with no content is a notification that makes the
 * reader do the work. The genetics are already on their animals by the time this
 * sends — the laboratory's submission writes them — so this is confirmation, not
 * an instruction to go and apply something.
 */
export type LabResultsReadyTemplateProps = {
  breederName: string | null;
  labName: string;
  orderNumber: string;
  /** One line per animal, already worded by the caller. */
  findingLines: string[];
  actionUrl: string;
};

export const LAB_RESULTS_READY_TEMPLATE_KEY = "lab_results_ready";
export const LAB_RESULTS_READY_TEMPLATE_VERSION = 1;

export const renderLabResultsReadyTemplate = (props: LabResultsReadyTemplateProps) => {
  const greeting = props.breederName ? `Hello ${escapeHtml(props.breederName)},` : "Hello,";
  const lines = Array.isArray(props.findingLines) ? props.findingLines.filter(Boolean) : [];

  const findingsHtml = lines.length
    ? `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
    : "<p>Open your order to see the full result.</p>";

  const bodyHtml = `
    <p>${greeting}</p>
    <p>${escapeHtml(props.labName)} has completed the testing on order <strong>${escapeHtml(props.orderNumber)}</strong>.</p>
    ${findingsHtml}
    <p>Your animals have been updated with these findings, and the certificate is ready to download from the order.</p>
  `;

  const html = renderLayout({
    preheader: `${props.labName} has completed the testing on order ${props.orderNumber}.`,
    heading: "Your results are ready",
    bodyHtml,
    ctaLabel: "View results and certificate",
    ctaUrl: props.actionUrl,
  });

  const text = renderPlainText([
    props.breederName ? `Hello ${props.breederName},` : "Hello,",
    "",
    `${props.labName} has completed the testing on order ${props.orderNumber}.`,
    "",
    ...(lines.length ? lines.map((line) => `  - ${line}`) : ["Open your order to see the full result."]),
    "",
    "Your animals have been updated with these findings, and the certificate is ready to download from the order.",
    "",
    `View results and certificate: ${props.actionUrl}`,
  ]);

  return { subject: `Your shed test results are ready (${props.orderNumber})`, html, text };
};
