import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

/**
 * Sent when an org owner/admin invites a colleague into their *existing*
 * organization — the second of `OrganizationInvite`'s two triggers.
 *
 * Kept apart from `invitationTemplate` (internal ops staff, account already
 * created with a temporary password) because the acceptance flow differs: the
 * invitee here may have no account at all and sets their own password on the
 * acceptance page.
 */
export type OrganizationTeammateInvitationTemplateProps = {
  organizationName: string;
  inviterFullName: string | null;
  role: string;
  expiresAtDisplay: string;
  actionUrl: string;
  /** True when the address already has an account — changes the call to action. */
  hasExistingAccount: boolean;
};

export const ORG_TEAMMATE_INVITATION_TEMPLATE_KEY = "organization_teammate_invitation";
export const ORG_TEAMMATE_INVITATION_TEMPLATE_VERSION = 1;

const readableRole = (role: string): string => role.replace(/_/g, " ");

export const renderOrganizationTeammateInvitationTemplate = (
  props: OrganizationTeammateInvitationTemplateProps
) => {
  const inviterLine = props.inviterFullName
    ? `${escapeHtml(props.inviterFullName)} invited you to join <strong>${escapeHtml(props.organizationName)}</strong> on Breeding Planner.`
    : `You have been invited to join <strong>${escapeHtml(props.organizationName)}</strong> on Breeding Planner.`;

  const credentialLine = props.hasExistingAccount
    ? "<p>Sign in with your existing Breeding Planner account to accept.</p>"
    : "<p>You will choose your own password when you accept.</p>";

  const bodyHtml = `
    <p>Hello,</p>
    <p>${inviterLine}</p>
    <p>Your role will be: <strong>${escapeHtml(readableRole(props.role))}</strong></p>
    ${credentialLine}
    <p>This invitation expires on ${escapeHtml(props.expiresAtDisplay)}.</p>
  `;

  const html = renderLayout({
    preheader: `You've been invited to join ${props.organizationName} on Breeding Planner.`,
    heading: "You're invited to join the team",
    bodyHtml,
    ctaLabel: props.hasExistingAccount ? "Accept invitation" : "Accept and set your password",
    ctaUrl: props.actionUrl,
  });

  const text = renderPlainText([
    "Hello,",
    "",
    props.inviterFullName
      ? `${props.inviterFullName} invited you to join ${props.organizationName} on Breeding Planner.`
      : `You have been invited to join ${props.organizationName} on Breeding Planner.`,
    `Your role will be: ${readableRole(props.role)}`,
    "",
    props.hasExistingAccount
      ? "Sign in with your existing Breeding Planner account to accept."
      : "You will choose your own password when you accept.",
    `This invitation expires on ${props.expiresAtDisplay}.`,
    "",
    `Accept your invitation: ${props.actionUrl}`,
  ]);

  return { subject: `You're invited to join ${props.organizationName}`, html, text };
};
