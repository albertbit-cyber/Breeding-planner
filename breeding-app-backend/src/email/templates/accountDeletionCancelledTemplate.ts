import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

export type AccountDeletionCancelledTemplateProps = {
  fullName: string;
};

export const ACCOUNT_DELETION_CANCELLED_TEMPLATE_KEY = "account_deletion_cancelled";
export const ACCOUNT_DELETION_CANCELLED_TEMPLATE_VERSION = 1;

/**
 * Cancellation happens implicitly on sign-in, so the user may not realise a
 * pending deletion was called off. Worse, if someone else requested it, this is
 * the message that tells the account holder something is wrong.
 */
export const renderAccountDeletionCancelledTemplate = (props: AccountDeletionCancelledTemplateProps) => {
  const bodyHtml = `
    <p>Hello ${escapeHtml(props.fullName)},</p>
    <p>The pending deletion of your Breeding Planner account has been cancelled, and your account is active again. Nothing was erased.</p>
    <p>If you didn't sign in just now, someone else may have access to your account. Change your password immediately.</p>
  `;

  const html = renderLayout({
    preheader: "Your account deletion was cancelled.",
    heading: "Your account deletion was cancelled",
    bodyHtml,
  });

  const text = renderPlainText([
    `Hello ${props.fullName},`,
    "",
    "The pending deletion of your Breeding Planner account has been cancelled, and your account is active again. Nothing was erased.",
    "",
    "If you didn't sign in just now, someone else may have access to your account. Change your password immediately.",
  ]);

  return { subject: "Your Breeding Planner account deletion was cancelled", html, text };
};
