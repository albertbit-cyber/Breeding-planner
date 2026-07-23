import { describe, expect, it } from "vitest";
import {
  assertValidEmailAddress,
  EmailConfigurationError,
  EmailValidationError,
  isValidEmailAddress,
  normalizeEmailAddress,
  PermanentProviderError,
  RetryableProviderError,
} from "../../email/types";

describe("email/types", () => {
  it("normalizes email addresses to lowercase and trims whitespace", () => {
    expect(normalizeEmailAddress("  Foo@Example.COM  ")).toBe("foo@example.com");
  });

  it("validates well-formed addresses", () => {
    expect(isValidEmailAddress("foo@example.com")).toBe(true);
    expect(isValidEmailAddress("not-an-email")).toBe(false);
    expect(isValidEmailAddress("")).toBe(false);
  });

  it("asserts and normalizes a valid address, throws on invalid", () => {
    expect(assertValidEmailAddress("Foo@Example.com")).toBe("foo@example.com");
    expect(() => assertValidEmailAddress("nope")).toThrow(EmailValidationError);
  });

  it("marks retryable vs permanent provider errors correctly", () => {
    const retryable = new RetryableProviderError("temporary");
    const permanent = new PermanentProviderError("bad request");
    expect(retryable.retryable).toBe(true);
    expect(permanent.retryable).toBe(false);
    expect(retryable.code).toBe("retryable_provider_error");
    expect(permanent.code).toBe("permanent_provider_error");
  });

  it("configuration errors are never retryable", () => {
    const error = new EmailConfigurationError("missing key");
    expect(error.retryable).toBe(false);
    expect(error.code).toBe("configuration_error");
  });
});
