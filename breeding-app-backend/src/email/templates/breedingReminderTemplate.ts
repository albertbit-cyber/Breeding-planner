import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

export type BreedingReminderType =
  | "pairing_follow_up"
  | "ultrasound_or_follicle_check"
  | "expected_ovulation_window"
  | "pre_lay_shed_follow_up"
  | "expected_egg_laying_window"
  | "incubation_check"
  | "estimated_hatch_window";

export type BreedingReminderTemplateProps = {
  animalDisplayName: string;
  projectDisplayName: string;
  reminderType: BreedingReminderType;
  /** Already formatted for the recipient's timezone by the caller — this template does no date math. */
  reminderDateDisplay: string;
  explanation: string;
  actionUrl: string;
};

export const BREEDING_REMINDER_TEMPLATE_KEY = "breeding_reminder";
export const BREEDING_REMINDER_TEMPLATE_VERSION = 1;

const REMINDER_LABELS: Record<BreedingReminderType, string> = {
  pairing_follow_up: "Pairing follow-up",
  ultrasound_or_follicle_check: "Ultrasound / follicle check",
  expected_ovulation_window: "Expected ovulation window",
  pre_lay_shed_follow_up: "Pre-lay shed follow-up",
  expected_egg_laying_window: "Expected egg-laying window",
  incubation_check: "Incubation check",
  estimated_hatch_window: "Estimated hatch window",
};

export const renderBreedingReminderTemplate = (props: BreedingReminderTemplateProps) => {
  const label = REMINDER_LABELS[props.reminderType] || "Breeding reminder";

  const bodyHtml = `
    <p>This is a reminder for <strong>${escapeHtml(props.animalDisplayName)}</strong> in project <strong>${escapeHtml(props.projectDisplayName)}</strong>.</p>
    <p><strong>${escapeHtml(label)}</strong> — ${escapeHtml(props.reminderDateDisplay)}</p>
    <p>${escapeHtml(props.explanation)}</p>
  `;

  const html = renderLayout({
    preheader: `${label} reminder for ${props.projectDisplayName}`,
    heading: "Breeding reminder",
    bodyHtml,
    ctaLabel: "View breeding record",
    ctaUrl: props.actionUrl,
  });

  const text = renderPlainText([
    `Reminder for ${props.animalDisplayName} in project ${props.projectDisplayName}.`,
    `${label} — ${props.reminderDateDisplay}`,
    "",
    props.explanation,
    "",
    `View the record: ${props.actionUrl}`,
  ]);

  return { subject: "Breeding reminder", html, text };
};
