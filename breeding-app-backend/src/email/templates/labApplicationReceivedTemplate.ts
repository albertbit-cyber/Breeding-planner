import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

/**
 * A laboratory has asked to join, told to the administrators who can act on it.
 *
 * Applications previously landed in the database and waited for somebody to
 * happen to open the Vendor Labs page. A laboratory that hears nothing back
 * assumes the door is shut, so this is addressed to the people holding the key
 * rather than to the applicant.
 */
export type LabApplicationReceivedTemplateProps = {
  adminName: string | null;
  labName: string;
  contactPerson: string | null;
  email: string;
  location: string | null;
  reason: string | null;
  actionUrl: string;
};

export const LAB_APPLICATION_RECEIVED_TEMPLATE_KEY = "lab_application_received";
export const LAB_APPLICATION_RECEIVED_TEMPLATE_VERSION = 1;

export const renderLabApplicationReceivedTemplate = (props: LabApplicationReceivedTemplateProps) => {
  const greeting = props.adminName ? `Hello ${escapeHtml(props.adminName)},` : "Hello,";

  const rows = [
    ["Laboratory", props.labName],
    ["Contact", props.contactPerson],
    ["Email", props.email],
    ["Location", props.location],
  ].filter(([, value]) => Boolean(value));

  const rowsHtml = rows
    .map(([label, value]) => `<li><strong>${escapeHtml(String(label))}:</strong> ${escapeHtml(String(value))}</li>`)
    .join("");

  const reasonHtml = props.reason
    ? `<p><strong>What they said:</strong><br />${escapeHtml(props.reason)}</p>`
    : "";

  const bodyHtml = `
    <p>${greeting}</p>
    <p><strong>${escapeHtml(props.labName)}</strong> has applied to join Breeding Planner as a partner laboratory.</p>
    <ul>${rowsHtml}</ul>
    ${reasonHtml}
    <p>Review the application in the Admin Portal. Approving it does not create the laboratory — you still send them an invitation, and the laboratory comes into existence when they accept and set their own password.</p>
  `;

  const html = renderLayout({
    preheader: `${props.labName} has applied to join as a partner laboratory.`,
    heading: "A laboratory has applied to join",
    bodyHtml,
    ctaLabel: "Review the application",
    ctaUrl: props.actionUrl,
  });

  const text = renderPlainText([
    props.adminName ? `Hello ${props.adminName},` : "Hello,",
    "",
    `${props.labName} has applied to join Breeding Planner as a partner laboratory.`,
    "",
    ...rows.map(([label, value]) => `  ${label}: ${value}`),
    ...(props.reason ? ["", `What they said: ${props.reason}`] : []),
    "",
    "Review the application in the Admin Portal. Approving it does not create the laboratory —",
    "you still send them an invitation, and the laboratory comes into existence when they accept.",
    "",
    `Review the application: ${props.actionUrl}`,
  ]);

  return { subject: `${props.labName} applied to join as a partner laboratory`, html, text };
};
