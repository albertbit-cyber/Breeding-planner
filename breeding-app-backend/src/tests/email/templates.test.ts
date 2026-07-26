import { describe, expect, it } from "vitest";
import {
  renderEmailTemplate,
  INVITATION_TEMPLATE_KEY,
  INVITATION_TEMPLATE_VERSION,
  BREEDING_REMINDER_TEMPLATE_KEY,
  BREEDING_REMINDER_TEMPLATE_VERSION,
  UNEXPECTED_EGG_LAYING_TEMPLATE_KEY,
  UNEXPECTED_EGG_LAYING_TEMPLATE_VERSION,
} from "../../email/templates";
import { EmailRenderingError } from "../../email/types";

describe("email templates", () => {
  it("renders the invitation template with html and text", () => {
    const rendered = renderEmailTemplate(INVITATION_TEMPLATE_KEY, INVITATION_TEMPLATE_VERSION, {
      inviteeFullName: "Jane Doe",
      inviterFullName: "Admin User",
      organizationName: "Breeding Planner",
      role: "lab_staff",
      expiresAtDisplay: "January 1, 2027",
      actionUrl: "https://app.example.com/accept?token=abc",
    });
    expect(rendered.subject).toBeTruthy();
    expect(rendered.html).toContain("Jane Doe");
    expect(rendered.html).toContain("https://app.example.com/accept?token=abc");
    expect(rendered.text).toContain("Jane Doe");
    expect(rendered.text).toContain("lab staff");
  });

  it("escapes HTML in user-supplied invitation fields", () => {
    const rendered = renderEmailTemplate(INVITATION_TEMPLATE_KEY, INVITATION_TEMPLATE_VERSION, {
      inviteeFullName: "<script>alert(1)</script>",
      inviterFullName: null,
      organizationName: "Breeding Planner",
      role: "support",
      expiresAtDisplay: null,
      actionUrl: "https://app.example.com/accept",
    });
    expect(rendered.html).not.toContain("<script>alert(1)</script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("renders the breeding reminder template without duplicating calculations", () => {
    const rendered = renderEmailTemplate(BREEDING_REMINDER_TEMPLATE_KEY, BREEDING_REMINDER_TEMPLATE_VERSION, {
      animalDisplayName: "Banana",
      projectDisplayName: "Pairing 42",
      reminderType: "expected_egg_laying_window",
      reminderDateDisplay: "March 1, 2027",
      explanation: "Egg-laying is expected around this date.",
      actionUrl: "https://app.example.com/pairings/42",
    });
    expect(rendered.html).toContain("Banana");
    expect(rendered.html).toContain("Pairing 42");
    expect(rendered.html).toContain("Expected egg-laying window");
    expect(rendered.text).toContain("March 1, 2027");
  });

  it("renders the unexpected egg-laying template", () => {
    const rendered = renderEmailTemplate(UNEXPECTED_EGG_LAYING_TEMPLATE_KEY, UNEXPECTED_EGG_LAYING_TEMPLATE_VERSION, {
      animalDisplayName: "Banana",
      projectDisplayName: "Pairing 42",
      actionUrl: "https://app.example.com/pairings/42",
    });
    expect(rendered.subject).toContain("Unexpected");
    expect(rendered.html).toContain("Pairing 42");
  });

  it("throws EmailRenderingError for an unknown template key", () => {
    expect(() => renderEmailTemplate("does_not_exist", 1, {})).toThrow(EmailRenderingError);
  });

  it("throws EmailRenderingError on a template version mismatch", () => {
    expect(() => renderEmailTemplate(INVITATION_TEMPLATE_KEY, 999, {})).toThrow(EmailRenderingError);
  });
});
