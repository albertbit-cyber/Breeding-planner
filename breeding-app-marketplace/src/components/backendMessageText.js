// The shared-backend status messages are written in English by apiClient, outside React,
// and reach users through the backend guard and banner. These are the fixed ones the
// client builds itself; anything else (a server's own message) is shown as it came.
export const backendMessageText = (t, message) => {
  if (!message) return message;
  const known = {
    "Connected to shared backend.": t("auth:sharedBackend.msg.connected", { defaultValue: "Connected to shared backend." }),
    "Authenticated against shared backend.": t("auth:sharedBackend.msg.authenticated", { defaultValue: "Authenticated against shared backend." }),
    "Refreshed shared backend session.": t("auth:sharedBackend.msg.refreshed", { defaultValue: "Refreshed shared backend session." }),
    "Shared backend health check passed.": t("auth:sharedBackend.msg.healthPassed", { defaultValue: "Shared backend health check passed." }),
    "Shared backend health endpoint returned an unexpected response.": t("auth:sharedBackend.msg.healthUnexpected", { defaultValue: "Shared backend health endpoint returned an unexpected response." }),
    "Shared backend did not return a CSRF token.": t("auth:sharedBackend.msg.noCsrf", { defaultValue: "Shared backend did not return a CSRF token." }),
    "Shared backend refresh did not return a valid access token.": t("auth:sharedBackend.msg.refreshInvalid", { defaultValue: "Shared backend refresh did not return a valid access token." }),
    "Shared backend refresh did not return valid auth tokens.": t("auth:sharedBackend.msg.refreshInvalidTokens", { defaultValue: "Shared backend refresh did not return valid auth tokens." }),
    "Timed out while connecting to the shared backend.": t("auth:sharedBackend.msg.timedOut", { defaultValue: "Timed out while connecting to the shared backend." }),
    "Unable to reach the shared backend.": t("auth:sharedBackend.msg.unreachable", { defaultValue: "Unable to reach the shared backend." }),
    "Unexpected shared backend error.": t("auth:sharedBackend.msg.unexpected", { defaultValue: "Unexpected shared backend error." }),
    "Your shared backend session expired. Sign in again.": t("auth:sharedBackend.msg.sessionExpired", { defaultValue: "Your shared backend session expired. Sign in again." }),
    "Backend configuration is invalid. Expected a full API URL.": t("auth:sharedBackend.msg.configInvalid", { defaultValue: "Backend configuration is invalid. Expected a full API URL." }),
  };
  return known[message] ?? message;
};
