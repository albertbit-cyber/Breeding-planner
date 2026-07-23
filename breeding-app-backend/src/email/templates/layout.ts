import { escapeHtml } from "./escapeHtml";

export type LayoutInput = {
  preheader?: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

const BRAND_NAME = "Breeding Planner";

/**
 * Shared accessible HTML shell for all transactional templates. `bodyHtml`
 * must already be escaped/composed by the caller — this only adds the
 * branded frame, semantic structure, and the call-to-action button.
 */
export const renderLayout = ({ preheader, heading, bodyHtml, ctaLabel, ctaUrl }: LayoutInput): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    ${preheader ? `<span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:8px;overflow:hidden;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#166534;padding:20px 28px;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(BRAND_NAME)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(heading)}</h1>
                <div style="font-size:14px;line-height:1.6;color:#374151;">${bodyHtml}</div>
                ${
                  ctaLabel && ctaUrl
                    ? `<div style="margin-top:24px;">
                        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:6px;">${escapeHtml(ctaLabel)}</a>
                      </div>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;color:#9ca3af;">You are receiving this email because of activity on your ${escapeHtml(BRAND_NAME)} account.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export const renderPlainText = (lines: string[]): string => lines.join("\n");
