import { describe, expect, it } from "vitest";
import {
  renderEmailTemplate,
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
} from "../../email/templates";
import { EmailRenderingError } from "../../email/types";

describe("account lifecycle email templates", () => {
  it("renders the email-verification template with html, text, and the action link, and no password/secret leakage", () => {
    const rendered = renderEmailTemplate(ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_KEY, ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_VERSION, {
      fullName: "Jane Doe",
      actionUrl: "https://app.example.com/verify-email?token=abc123",
      expiresInHoursDisplay: "48 hours",
    });
    expect(rendered.subject).toBeTruthy();
    expect(rendered.html).toContain("Jane Doe");
    expect(rendered.html).toContain("https://app.example.com/verify-email?token=abc123");
    expect(rendered.text).toContain("48 hours");
    expect(rendered.html.toLowerCase()).not.toContain("password");
  });

  it("escapes HTML in user-supplied verification fields", () => {
    const rendered = renderEmailTemplate(ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_KEY, ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_VERSION, {
      fullName: "<script>alert(1)</script>",
      actionUrl: "https://app.example.com/verify-email?token=abc",
      expiresInHoursDisplay: "48 hours",
    });
    expect(rendered.html).not.toContain("<script>alert(1)</script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("renders the password-reset template with the action link and expiry, no password value", () => {
    const rendered = renderEmailTemplate(ACCOUNT_PASSWORD_RESET_TEMPLATE_KEY, ACCOUNT_PASSWORD_RESET_TEMPLATE_VERSION, {
      fullName: "Jane Doe",
      actionUrl: "https://app.example.com/reset-password?token=abc123",
      expiresInMinutesDisplay: "60 minutes",
    });
    expect(rendered.html).toContain("https://app.example.com/reset-password?token=abc123");
    expect(rendered.text).toContain("60 minutes");
  });

  it("renders the password-changed confirmation template with no link and no password value", () => {
    const rendered = renderEmailTemplate(ACCOUNT_PASSWORD_CHANGED_TEMPLATE_KEY, ACCOUNT_PASSWORD_CHANGED_TEMPLATE_VERSION, {
      fullName: "Jane Doe",
      changedAtDisplay: "Mon, 01 Jan 2027 00:00:00 GMT",
    });
    expect(rendered.html).toContain("Jane Doe");
    expect(rendered.html).toContain("Mon, 01 Jan 2027 00:00:00 GMT");
    expect(rendered.html).not.toContain("href=");
  });

  it("renders the verify-new-email template with the action link", () => {
    const rendered = renderEmailTemplate(ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_KEY, ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_VERSION, {
      fullName: "Jane Doe",
      actionUrl: "https://app.example.com/confirm-email-change?token=abc123",
      expiresInHoursDisplay: "48 hours",
    });
    expect(rendered.html).toContain("https://app.example.com/confirm-email-change?token=abc123");
  });

  it("renders the email-changed notice with a masked new email address and no link", () => {
    const rendered = renderEmailTemplate(ACCOUNT_EMAIL_CHANGED_TEMPLATE_KEY, ACCOUNT_EMAIL_CHANGED_TEMPLATE_VERSION, {
      fullName: "Jane Doe",
      changedAtDisplay: "Mon, 01 Jan 2027 00:00:00 GMT",
      maskedNewEmail: "ne**@example.com",
    });
    expect(rendered.html).toContain("ne**@example.com");
    expect(rendered.html).not.toContain("href=");
  });

  it("throws EmailRenderingError on a version mismatch for a new template", () => {
    expect(() => renderEmailTemplate(ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_KEY, 999, {})).toThrow(EmailRenderingError);
  });
});
