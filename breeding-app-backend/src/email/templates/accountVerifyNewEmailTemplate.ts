import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

export type AccountVerifyNewEmailTemplateProps = {
  fullName: string;
  actionUrl: string;
  expiresInHoursDisplay: string;
};

export const ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_KEY = "account_verify_new_email";
export const ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_VERSION = 1;

export const renderAccountVerifyNewEmailTemplate = (props: AccountVerifyNewEmailTemplateProps) => {
  const bodyHtml = `
    <p>Hello ${escapeHtml(props.fullName)},</p>
    <p>This address was entered as the new email for a Breeding Planner account. Confirm it to complete the change.</p>
    <p>This link expires in ${escapeHtml(props.expiresInHoursDisplay)}.</p>
    <p>If you didn't request this, you can safely ignore this email — your account's email address will not change.</p>
  `;

  const html = renderLayout({
    preheader: "Confirm your new email address for Breeding Planner.",
    heading: "Confirm your new email address",
    bodyHtml,
    ctaLabel: "Confirm new email",
    ctaUrl: props.actionUrl,
  });

  const text = renderPlainText([
    `Hello ${props.fullName},`,
    "",
    "This address was entered as the new email for a Breeding Planner account. Confirm it to complete the change.",
    `This link expires in ${props.expiresInHoursDisplay}.`,
    "",
    `Confirm your new email: ${props.actionUrl}`,
    "",
    "If you didn't request this, you can safely ignore this email — your account's email address will not change.",
  ]);

  return { subject: "Confirm your new Breeding Planner email address", html, text };
};
