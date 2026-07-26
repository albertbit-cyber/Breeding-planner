import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

export type AccountEmailVerificationTemplateProps = {
  fullName: string;
  actionUrl: string;
  expiresInHoursDisplay: string;
};

export const ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_KEY = "account_email_verification";
export const ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_VERSION = 1;

export const renderAccountEmailVerificationTemplate = (props: AccountEmailVerificationTemplateProps) => {
  const bodyHtml = `
    <p>Hello ${escapeHtml(props.fullName)},</p>
    <p>Please confirm this is your email address to finish setting up your Breeding Planner account.</p>
    <p>This link expires in ${escapeHtml(props.expiresInHoursDisplay)}.</p>
    <p>If you didn't create a Breeding Planner account, you can safely ignore this email.</p>
  `;

  const html = renderLayout({
    preheader: "Confirm your email address to finish setting up your account.",
    heading: "Verify your email address",
    bodyHtml,
    ctaLabel: "Verify email address",
    ctaUrl: props.actionUrl,
  });

  const text = renderPlainText([
    `Hello ${props.fullName},`,
    "",
    "Please confirm this is your email address to finish setting up your Breeding Planner account.",
    `This link expires in ${props.expiresInHoursDisplay}.`,
    "",
    `Verify your email: ${props.actionUrl}`,
    "",
    "If you didn't create a Breeding Planner account, you can safely ignore this email.",
  ]);

  return { subject: "Verify your Breeding Planner email address", html, text };
};
