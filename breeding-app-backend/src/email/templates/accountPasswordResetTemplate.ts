import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

export type AccountPasswordResetTemplateProps = {
  fullName: string;
  actionUrl: string;
  expiresInMinutesDisplay: string;
};

export const ACCOUNT_PASSWORD_RESET_TEMPLATE_KEY = "account_password_reset";
export const ACCOUNT_PASSWORD_RESET_TEMPLATE_VERSION = 1;

export const renderAccountPasswordResetTemplate = (props: AccountPasswordResetTemplateProps) => {
  const bodyHtml = `
    <p>Hello ${escapeHtml(props.fullName)},</p>
    <p>We received a request to reset the password on your Breeding Planner account.</p>
    <p>This link expires in ${escapeHtml(props.expiresInMinutesDisplay)}.</p>
    <p>If you didn't request this, you can safely ignore this email — your password will not be changed.</p>
  `;

  const html = renderLayout({
    preheader: "Reset your Breeding Planner password.",
    heading: "Reset your password",
    bodyHtml,
    ctaLabel: "Reset my password",
    ctaUrl: props.actionUrl,
  });

  const text = renderPlainText([
    `Hello ${props.fullName},`,
    "",
    "We received a request to reset the password on your Breeding Planner account.",
    `This link expires in ${props.expiresInMinutesDisplay}.`,
    "",
    `Reset your password: ${props.actionUrl}`,
    "",
    "If you didn't request this, you can safely ignore this email — your password will not be changed.",
  ]);

  return { subject: "Reset your Breeding Planner password", html, text };
};
