import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

/**
 * Distinct from `invitationTemplate` (internal ops accounts) on purpose: this
 * one is sent to an outside company, and the account it leads to does not exist
 * yet. Two consequences shape the copy:
 *
 *  - There is no temporary password to mention. The recipient sets their own on
 *    the acceptance page, so the admin never handles their credentials.
 *  - The organization named is the one that will be *created* when they accept,
 *    not one they are joining. Getting that wrong reads as though someone else
 *    already set up their lab for them.
 */
export type VendorLabInvitationTemplateProps = {
  /** The lab's name as the admin typed it — becomes the new Organization's name. */
  organizationName: string;
  inviterFullName: string | null;
  expiresAtDisplay: string;
  actionUrl: string;
};

export const VENDOR_LAB_INVITATION_TEMPLATE_KEY = "vendor_lab_invitation";
export const VENDOR_LAB_INVITATION_TEMPLATE_VERSION = 1;

export const renderVendorLabInvitationTemplate = (props: VendorLabInvitationTemplateProps) => {
  const inviterLine = props.inviterFullName
    ? `${escapeHtml(props.inviterFullName)} has invited <strong>${escapeHtml(props.organizationName)}</strong> to join Breeding Planner as a partner laboratory.`
    : `<strong>${escapeHtml(props.organizationName)}</strong> has been invited to join Breeding Planner as a partner laboratory.`;

  const bodyHtml = `
    <p>Hello,</p>
    <p>${inviterLine}</p>
    <p>Accepting this invitation creates your laboratory's own workspace in the Lab Portal. From there you will be able to:</p>
    <ul>
      <li>Publish the tests you offer and set your own prices</li>
      <li>Receive and process testing orders from breeders</li>
      <li>Issue results and certificates under your own name</li>
      <li>Invite your colleagues to work alongside you</li>
    </ul>
    <p>You will choose your own password when you accept — nobody else sets it for you.</p>
    <p>This invitation expires on ${escapeHtml(props.expiresAtDisplay)}.</p>
  `;

  const html = renderLayout({
    preheader: `${props.organizationName} has been invited to join Breeding Planner as a partner laboratory.`,
    heading: "Your laboratory is invited",
    bodyHtml,
    ctaLabel: "Accept and set your password",
    ctaUrl: props.actionUrl,
  });

  const text = renderPlainText([
    "Hello,",
    "",
    props.inviterFullName
      ? `${props.inviterFullName} has invited ${props.organizationName} to join Breeding Planner as a partner laboratory.`
      : `${props.organizationName} has been invited to join Breeding Planner as a partner laboratory.`,
    "",
    "Accepting this invitation creates your laboratory's own workspace in the Lab Portal, where you can:",
    "  - Publish the tests you offer and set your own prices",
    "  - Receive and process testing orders from breeders",
    "  - Issue results and certificates under your own name",
    "  - Invite your colleagues to work alongside you",
    "",
    "You will choose your own password when you accept — nobody else sets it for you.",
    `This invitation expires on ${props.expiresAtDisplay}.`,
    "",
    `Accept your invitation: ${props.actionUrl}`,
  ]);

  return { subject: "Your laboratory is invited to Breeding Planner", html, text };
};
