import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

export type AccountPasswordChangedTemplateProps = {
  fullName: string;
  changedAtDisplay: string;
};

export const ACCOUNT_PASSWORD_CHANGED_TEMPLATE_KEY = "account_password_changed";
export const ACCOUNT_PASSWORD_CHANGED_TEMPLATE_VERSION = 1;

export const renderAccountPasswordChangedTemplate = (props: AccountPasswordChangedTemplateProps) => {
  const bodyHtml = `
    <p>Hello ${escapeHtml(props.fullName)},</p>
    <p>The password on your Breeding Planner account was changed on ${escapeHtml(props.changedAtDisplay)}.</p>
    <p>If you made this change, no further action is needed. If you didn't, please contact support immediately and secure your account.</p>
  `;

  const html = renderLayout({
    preheader: "Your Breeding Planner password was changed.",
    heading: "Your password was changed",
    bodyHtml,
  });

  const text = renderPlainText([
    `Hello ${props.fullName},`,
    "",
    `The password on your Breeding Planner account was changed on ${props.changedAtDisplay}.`,
    "",
    "If you made this change, no further action is needed. If you didn't, please contact support immediately and secure your account.",
  ]);

  return { subject: "Your Breeding Planner password was changed", html, text };
};
