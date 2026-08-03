import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

export type AccountDeletionScheduledTemplateProps = {
  fullName: string;
  scheduledAtDisplay: string;
  cancelUrl: string;
};

export const ACCOUNT_DELETION_SCHEDULED_TEMPLATE_KEY = "account_deletion_scheduled";
export const ACCOUNT_DELETION_SCHEDULED_TEMPLATE_VERSION = 1;

/**
 * Sent the moment deletion is requested. This is the only email in the deletion
 * flow: once the purge runs, the account and every job queued against it are
 * gone, so there is nothing left to send a confirmation from. That makes this
 * message the user's single record of the deadline — it must state the date and
 * how to stop it.
 */
export const renderAccountDeletionScheduledTemplate = (props: AccountDeletionScheduledTemplateProps) => {
  const bodyHtml = `
    <p>Hello ${escapeHtml(props.fullName)},</p>
    <p>We've received a request to delete your Breeding Planner account. Your account is now locked and no longer visible to other users.</p>
    <p><strong>On ${escapeHtml(props.scheduledAtDisplay)} your account and all of your records will be permanently erased.</strong> This includes your animals, pairings, clutches, photographs, notes and lab orders. It cannot be undone.</p>
    <p>If you didn't ask for this, or you've changed your mind, simply sign in before that date and the deletion will be cancelled automatically:</p>
    <p><a href="${escapeHtml(props.cancelUrl)}">${escapeHtml(props.cancelUrl)}</a></p>
    <p>If you want a copy of your records, download your data export before the deletion date. After that we cannot recover it.</p>
  `;

  const html = renderLayout({
    preheader: `Your account will be permanently deleted on ${props.scheduledAtDisplay}.`,
    heading: "Your account is scheduled for deletion",
    bodyHtml,
  });

  const text = renderPlainText([
    `Hello ${props.fullName},`,
    "",
    "We've received a request to delete your Breeding Planner account. Your account is now locked and no longer visible to other users.",
    "",
    `On ${props.scheduledAtDisplay} your account and all of your records will be permanently erased. This includes your animals, pairings, clutches, photographs, notes and lab orders. It cannot be undone.`,
    "",
    "If you didn't ask for this, or you've changed your mind, simply sign in before that date and the deletion will be cancelled automatically:",
    props.cancelUrl,
    "",
    "If you want a copy of your records, download your data export before the deletion date. After that we cannot recover it.",
  ]);

  return { subject: "Your Breeding Planner account is scheduled for deletion", html, text };
};
