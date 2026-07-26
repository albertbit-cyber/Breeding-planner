import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

export type AccountEmailChangedTemplateProps = {
  fullName: string;
  changedAtDisplay: string;
  maskedNewEmail: string;
};

export const ACCOUNT_EMAIL_CHANGED_TEMPLATE_KEY = "account_email_changed";
export const ACCOUNT_EMAIL_CHANGED_TEMPLATE_VERSION = 1;

export const renderAccountEmailChangedTemplate = (props: AccountEmailChangedTemplateProps) => {
  const bodyHtml = `
    <p>Hello ${escapeHtml(props.fullName)},</p>
    <p>The email address on your Breeding Planner account was changed to ${escapeHtml(props.maskedNewEmail)} on ${escapeHtml(props.changedAtDisplay)}.</p>
    <p>This address (the one this message was sent to) is no longer used to sign in.</p>
    <p>If you made this change, no further action is needed. If you didn't, please contact support immediately and secure your account.</p>
  `;

  const html = renderLayout({
    preheader: "The email address on your Breeding Planner account was changed.",
    heading: "Your account email was changed",
    bodyHtml,
  });

  const text = renderPlainText([
    `Hello ${props.fullName},`,
    "",
    `The email address on your Breeding Planner account was changed to ${props.maskedNewEmail} on ${props.changedAtDisplay}.`,
    "This address (the one this message was sent to) is no longer used to sign in.",
    "",
    "If you made this change, no further action is needed. If you didn't, please contact support immediately and secure your account.",
  ]);

  return { subject: "Your Breeding Planner account email was changed", html, text };
};
