type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  metadata?: Record<string, unknown>;
};

export const sendEmail = async (payload: EmailPayload): Promise<{ delivered: boolean; provider: string }> => {
  const webhookUrl = String(process.env.EMAIL_WEBHOOK_URL || "").trim();
  const from = String(process.env.EMAIL_FROM || "noreply@breedingplanner.local").trim();
  if (!payload.to || !payload.subject || !payload.text) {
    return { delivered: false, provider: "invalid" };
  }

  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, ...payload }),
    });
    if (!response.ok) {
      throw new Error(`Email webhook failed with status ${response.status}`);
    }
    return { delivered: true, provider: "webhook" };
  }

  console.info("[email:dry-run]", { from, ...payload });
  return { delivered: false, provider: "dry-run" };
};
