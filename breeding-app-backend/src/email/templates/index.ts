import { EmailRenderingError } from "../types";
import {
  BREEDING_REMINDER_TEMPLATE_KEY,
  BREEDING_REMINDER_TEMPLATE_VERSION,
  renderBreedingReminderTemplate,
  type BreedingReminderTemplateProps,
} from "./breedingReminderTemplate";
import {
  INVITATION_TEMPLATE_KEY,
  INVITATION_TEMPLATE_VERSION,
  renderInvitationTemplate,
  type InvitationTemplateProps,
} from "./invitationTemplate";
import {
  UNEXPECTED_EGG_LAYING_TEMPLATE_KEY,
  UNEXPECTED_EGG_LAYING_TEMPLATE_VERSION,
  renderUnexpectedEggLayingTemplate,
  type UnexpectedEggLayingTemplateProps,
} from "./unexpectedEggLayingTemplate";
import {
  ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_KEY,
  ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_VERSION,
  renderAccountEmailVerificationTemplate,
  type AccountEmailVerificationTemplateProps,
} from "./accountEmailVerificationTemplate";
import {
  ACCOUNT_PASSWORD_RESET_TEMPLATE_KEY,
  ACCOUNT_PASSWORD_RESET_TEMPLATE_VERSION,
  renderAccountPasswordResetTemplate,
  type AccountPasswordResetTemplateProps,
} from "./accountPasswordResetTemplate";
import {
  ACCOUNT_PASSWORD_CHANGED_TEMPLATE_KEY,
  ACCOUNT_PASSWORD_CHANGED_TEMPLATE_VERSION,
  renderAccountPasswordChangedTemplate,
  type AccountPasswordChangedTemplateProps,
} from "./accountPasswordChangedTemplate";
import {
  ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_KEY,
  ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_VERSION,
  renderAccountVerifyNewEmailTemplate,
  type AccountVerifyNewEmailTemplateProps,
} from "./accountVerifyNewEmailTemplate";
import {
  ACCOUNT_EMAIL_CHANGED_TEMPLATE_KEY,
  ACCOUNT_EMAIL_CHANGED_TEMPLATE_VERSION,
  renderAccountEmailChangedTemplate,
  type AccountEmailChangedTemplateProps,
} from "./accountEmailChangedTemplate";
import {
  ACCOUNT_DELETION_SCHEDULED_TEMPLATE_KEY,
  ACCOUNT_DELETION_SCHEDULED_TEMPLATE_VERSION,
  renderAccountDeletionScheduledTemplate,
  type AccountDeletionScheduledTemplateProps,
} from "./accountDeletionScheduledTemplate";
import {
  ACCOUNT_DELETION_CANCELLED_TEMPLATE_KEY,
  ACCOUNT_DELETION_CANCELLED_TEMPLATE_VERSION,
  renderAccountDeletionCancelledTemplate,
  type AccountDeletionCancelledTemplateProps,
} from "./accountDeletionCancelledTemplate";
import {
  VENDOR_LAB_INVITATION_TEMPLATE_KEY,
  VENDOR_LAB_INVITATION_TEMPLATE_VERSION,
  renderVendorLabInvitationTemplate,
  type VendorLabInvitationTemplateProps,
} from "./vendorLabInvitationTemplate";
import {
  ORG_TEAMMATE_INVITATION_TEMPLATE_KEY,
  ORG_TEAMMATE_INVITATION_TEMPLATE_VERSION,
  renderOrganizationTeammateInvitationTemplate,
  type OrganizationTeammateInvitationTemplateProps,
} from "./organizationTeammateInvitationTemplate";

import {
  LAB_ORDER_STATUS_TEMPLATE_KEY,
  LAB_ORDER_STATUS_TEMPLATE_VERSION,
  renderLabOrderStatusTemplate,
  type LabOrderStatusTemplateProps,
} from "./labOrderStatusTemplate";
import {
  LAB_RESULTS_READY_TEMPLATE_KEY,
  LAB_RESULTS_READY_TEMPLATE_VERSION,
  renderLabResultsReadyTemplate,
  type LabResultsReadyTemplateProps,
} from "./labResultsReadyTemplate";
import {
  LAB_PAYMENT_REQUESTED_TEMPLATE_KEY,
  LAB_PAYMENT_REQUESTED_TEMPLATE_VERSION,
  renderLabPaymentRequestedTemplate,
  type LabPaymentRequestedTemplateProps,
} from "./labPaymentRequestedTemplate";
import {
  LAB_APPLICATION_RECEIVED_TEMPLATE_KEY,
  LAB_APPLICATION_RECEIVED_TEMPLATE_VERSION,
  renderLabApplicationReceivedTemplate,
  type LabApplicationReceivedTemplateProps,
} from "./labApplicationReceivedTemplate";

export type RenderedEmail = { subject: string; html: string; text: string };

type TemplateEntry = {
  version: number;
  render(payload: Record<string, unknown>): RenderedEmail;
};

const TEMPLATES: Record<string, TemplateEntry> = {
  [INVITATION_TEMPLATE_KEY]: {
    version: INVITATION_TEMPLATE_VERSION,
    render: (payload) => renderInvitationTemplate(payload as unknown as InvitationTemplateProps),
  },
  [BREEDING_REMINDER_TEMPLATE_KEY]: {
    version: BREEDING_REMINDER_TEMPLATE_VERSION,
    render: (payload) => renderBreedingReminderTemplate(payload as unknown as BreedingReminderTemplateProps),
  },
  [UNEXPECTED_EGG_LAYING_TEMPLATE_KEY]: {
    version: UNEXPECTED_EGG_LAYING_TEMPLATE_VERSION,
    render: (payload) => renderUnexpectedEggLayingTemplate(payload as unknown as UnexpectedEggLayingTemplateProps),
  },
  [ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_KEY]: {
    version: ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_VERSION,
    render: (payload) => renderAccountEmailVerificationTemplate(payload as unknown as AccountEmailVerificationTemplateProps),
  },
  [ACCOUNT_PASSWORD_RESET_TEMPLATE_KEY]: {
    version: ACCOUNT_PASSWORD_RESET_TEMPLATE_VERSION,
    render: (payload) => renderAccountPasswordResetTemplate(payload as unknown as AccountPasswordResetTemplateProps),
  },
  [ACCOUNT_PASSWORD_CHANGED_TEMPLATE_KEY]: {
    version: ACCOUNT_PASSWORD_CHANGED_TEMPLATE_VERSION,
    render: (payload) => renderAccountPasswordChangedTemplate(payload as unknown as AccountPasswordChangedTemplateProps),
  },
  [ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_KEY]: {
    version: ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_VERSION,
    render: (payload) => renderAccountVerifyNewEmailTemplate(payload as unknown as AccountVerifyNewEmailTemplateProps),
  },
  [ACCOUNT_EMAIL_CHANGED_TEMPLATE_KEY]: {
    version: ACCOUNT_EMAIL_CHANGED_TEMPLATE_VERSION,
    render: (payload) => renderAccountEmailChangedTemplate(payload as unknown as AccountEmailChangedTemplateProps),
  },
  [ACCOUNT_DELETION_SCHEDULED_TEMPLATE_KEY]: {
    version: ACCOUNT_DELETION_SCHEDULED_TEMPLATE_VERSION,
    render: (payload) => renderAccountDeletionScheduledTemplate(payload as unknown as AccountDeletionScheduledTemplateProps),
  },
  [ACCOUNT_DELETION_CANCELLED_TEMPLATE_KEY]: {
    version: ACCOUNT_DELETION_CANCELLED_TEMPLATE_VERSION,
    render: (payload) => renderAccountDeletionCancelledTemplate(payload as unknown as AccountDeletionCancelledTemplateProps),
  },
  [VENDOR_LAB_INVITATION_TEMPLATE_KEY]: {
    version: VENDOR_LAB_INVITATION_TEMPLATE_VERSION,
    render: (payload) => renderVendorLabInvitationTemplate(payload as unknown as VendorLabInvitationTemplateProps),
  },
  [ORG_TEAMMATE_INVITATION_TEMPLATE_KEY]: {
    version: ORG_TEAMMATE_INVITATION_TEMPLATE_VERSION,
    render: (payload) =>
      renderOrganizationTeammateInvitationTemplate(payload as unknown as OrganizationTeammateInvitationTemplateProps),
  },
  [LAB_ORDER_STATUS_TEMPLATE_KEY]: {
    version: LAB_ORDER_STATUS_TEMPLATE_VERSION,
    render: (payload) => renderLabOrderStatusTemplate(payload as unknown as LabOrderStatusTemplateProps),
  },
  [LAB_RESULTS_READY_TEMPLATE_KEY]: {
    version: LAB_RESULTS_READY_TEMPLATE_VERSION,
    render: (payload) => renderLabResultsReadyTemplate(payload as unknown as LabResultsReadyTemplateProps),
  },
  [LAB_PAYMENT_REQUESTED_TEMPLATE_KEY]: {
    version: LAB_PAYMENT_REQUESTED_TEMPLATE_VERSION,
    render: (payload) => renderLabPaymentRequestedTemplate(payload as unknown as LabPaymentRequestedTemplateProps),
  },
  [LAB_APPLICATION_RECEIVED_TEMPLATE_KEY]: {
    version: LAB_APPLICATION_RECEIVED_TEMPLATE_VERSION,
    render: (payload) => renderLabApplicationReceivedTemplate(payload as unknown as LabApplicationReceivedTemplateProps),
  },
};

export const renderEmailTemplate = (
  templateKey: string,
  templateVersion: number,
  payload: Record<string, unknown>
): RenderedEmail => {
  const entry = TEMPLATES[templateKey];
  if (!entry) {
    throw new EmailRenderingError(`Unknown email template key: "${templateKey}"`);
  }
  if (entry.version !== templateVersion) {
    throw new EmailRenderingError(
      `Template "${templateKey}" version mismatch: job requested v${templateVersion}, registry has v${entry.version}.`
    );
  }
  try {
    return entry.render(payload);
  } catch (error) {
    if (error instanceof EmailRenderingError) throw error;
    const reason = error instanceof Error ? error.message : "Unknown rendering error";
    throw new EmailRenderingError(`Failed to render template "${templateKey}": ${reason}`);
  }
};

export {
  INVITATION_TEMPLATE_KEY,
  INVITATION_TEMPLATE_VERSION,
  BREEDING_REMINDER_TEMPLATE_KEY,
  BREEDING_REMINDER_TEMPLATE_VERSION,
  UNEXPECTED_EGG_LAYING_TEMPLATE_KEY,
  UNEXPECTED_EGG_LAYING_TEMPLATE_VERSION,
  ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_KEY,
  ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_VERSION,
  ACCOUNT_PASSWORD_RESET_TEMPLATE_KEY,
  ACCOUNT_PASSWORD_RESET_TEMPLATE_VERSION,
  ACCOUNT_PASSWORD_CHANGED_TEMPLATE_KEY,
  ACCOUNT_PASSWORD_CHANGED_TEMPLATE_VERSION,
  ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_KEY,
  ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_VERSION,
  ACCOUNT_EMAIL_CHANGED_TEMPLATE_KEY,
  ACCOUNT_EMAIL_CHANGED_TEMPLATE_VERSION,
  ACCOUNT_DELETION_SCHEDULED_TEMPLATE_KEY,
  ACCOUNT_DELETION_SCHEDULED_TEMPLATE_VERSION,
  ACCOUNT_DELETION_CANCELLED_TEMPLATE_KEY,
  ACCOUNT_DELETION_CANCELLED_TEMPLATE_VERSION,
  VENDOR_LAB_INVITATION_TEMPLATE_KEY,
  VENDOR_LAB_INVITATION_TEMPLATE_VERSION,
  ORG_TEAMMATE_INVITATION_TEMPLATE_KEY,
  ORG_TEAMMATE_INVITATION_TEMPLATE_VERSION,
  LAB_ORDER_STATUS_TEMPLATE_KEY,
  LAB_ORDER_STATUS_TEMPLATE_VERSION,
  LAB_RESULTS_READY_TEMPLATE_KEY,
  LAB_RESULTS_READY_TEMPLATE_VERSION,
  LAB_PAYMENT_REQUESTED_TEMPLATE_KEY,
  LAB_PAYMENT_REQUESTED_TEMPLATE_VERSION,
  LAB_APPLICATION_RECEIVED_TEMPLATE_KEY,
  LAB_APPLICATION_RECEIVED_TEMPLATE_VERSION,
};
export type {
  InvitationTemplateProps,
  BreedingReminderTemplateProps,
  UnexpectedEggLayingTemplateProps,
  AccountEmailVerificationTemplateProps,
  AccountPasswordResetTemplateProps,
  AccountPasswordChangedTemplateProps,
  AccountVerifyNewEmailTemplateProps,
  AccountEmailChangedTemplateProps,
  AccountDeletionScheduledTemplateProps,
  AccountDeletionCancelledTemplateProps,
  VendorLabInvitationTemplateProps,
  OrganizationTeammateInvitationTemplateProps,
  LabOrderStatusTemplateProps,
  LabResultsReadyTemplateProps,
  LabPaymentRequestedTemplateProps,
  LabApplicationReceivedTemplateProps,
};
export type { BreedingReminderType } from "./breedingReminderTemplate";
export type { LabOrderStatusEvent } from "./labOrderStatusTemplate";
