import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

export type UnexpectedEggLayingTemplateProps = {
  animalDisplayName: string;
  projectDisplayName: string;
  actionUrl: string;
};

export const UNEXPECTED_EGG_LAYING_TEMPLATE_KEY = "unexpected_egg_laying";
export const UNEXPECTED_EGG_LAYING_TEMPLATE_VERSION = 1;

export const renderUnexpectedEggLayingTemplate = (props: UnexpectedEggLayingTemplateProps) => {
  const bodyHtml = `
    <p>Eggs were just recorded for <strong>${escapeHtml(props.animalDisplayName)}</strong> in project <strong>${escapeHtml(props.projectDisplayName)}</strong>, which had already been closed or marked as concluded.</p>
    <p>This can happen when ovulation was not confirmed before the project was closed. You may want to reopen the project and schedule incubation milestones.</p>
    <p>Please review the project to confirm the details and decide whether to reopen it.</p>
  `;

  const html = renderLayout({
    preheader: `Eggs recorded after project closure for ${props.projectDisplayName}`,
    heading: "Unexpected egg-laying recorded",
    bodyHtml,
    ctaLabel: "Review project",
    ctaUrl: props.actionUrl,
  });

  const text = renderPlainText([
    `Eggs were just recorded for ${props.animalDisplayName} in project ${props.projectDisplayName}, which had already been closed or marked as concluded.`,
    "This can happen when ovulation was not confirmed before the project was closed. You may want to reopen the project and schedule incubation milestones.",
    "",
    `Review the project: ${props.actionUrl}`,
  ]);

  return { subject: "Unexpected egg-laying recorded", html, text };
};
