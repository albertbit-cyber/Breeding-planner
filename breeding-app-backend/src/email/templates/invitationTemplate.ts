import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

export type InvitationTemplateProps = {
  inviteeFullName: string;
  inviterFullName: string | null;
  organizationName: string;
  role: string;
  expiresAtDisplay: string | null;
  actionUrl: string;
};

export const INVITATION_TEMPLATE_KEY = "team_invitation";
export const INVITATION_TEMPLATE_VERSION = 1;

const readableRole = (role: string): string => role.replace(/_/g, " ");

export const renderInvitationTemplate = (props: InvitationTemplateProps) => {
  const inviterLine = props.inviterFullName
    ? `${escapeHtml(props.inviterFullName)} invited you to join <strong>${escapeHtml(props.organizationName)}</strong> on Breeding Planner.`
    : `You have been invited to join <strong>${escapeHtml(props.organizationName)}</strong> on Breeding Planner.`;

  const bodyHtml = `
    <p>Hello ${escapeHtml(props.inviteeFullName)},</p>
    <p>${inviterLine}</p>
    <p>Your role: <strong>${escapeHtml(readableRole(props.role))}</strong></p>
    ${props.expiresAtDisplay ? `<p>This invitation expires on ${escapeHtml(props.expiresAtDisplay)}.</p>` : ""}
    <p>Use the button below to accept the invitation and sign in.</p>
  `;

  const html = renderLayout({
    preheader: `You've been invited to join ${props.organizationName} on Breeding Planner.`,
    heading: "You're invited",
    bodyHtml,
    ctaLabel: "Accept invitation",
    ctaUrl: props.actionUrl,
  });

  const text = renderPlainText([
    `Hello ${props.inviteeFullName},`,
    "",
    props.inviterFullName
      ? `${props.inviterFullName} invited you to join ${props.organizationName} on Breeding Planner.`
      : `You have been invited to join ${props.organizationName} on Breeding Planner.`,
    `Your role: ${readableRole(props.role)}`,
    props.expiresAtDisplay ? `This invitation expires on ${props.expiresAtDisplay}.` : "",
    "",
    `Accept your invitation: ${props.actionUrl}`,
  ].filter(Boolean));

  return { subject: "You're invited to Breeding Planner", html, text };
};
