import React, { useEffect, useState } from "react";
import Spinner from "./Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import { fetchAdminMailDiagnostics, sendAdminMailTest } from "../../shared/apiClient";

/**
 * Answers "why did no verification email arrive?" without anyone reading the
 * deploy logs. The panel leads with a verdict because that is the only thing
 * an operator needs in the common case; the configuration detail below it is
 * for the case where the verdict is not enough.
 */

const SEVERITY_STYLES = {
  critical: { background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" },
  warning: { background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" },
};

const OK_STYLE = { background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534" };

const describeLastTick = (diagnostics) => {
  const { heartbeat, secondsSinceLastTick } = diagnostics.worker;
  if (!heartbeat.started) return "not started";
  if (secondsSinceLastTick === null) return "started, no poll completed yet";
  return `${secondsSinceLastTick}s ago (${heartbeat.ticks} polls)`;
};

function Field({ label, value, mono = false }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 13 }}>
      <span style={{ minWidth: 170, color: "#64748b" }}>{label}</span>
      <span style={{ fontFamily: mono ? "ui-monospace, monospace" : "inherit", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

export default function MailDiagnosticsPanel() {
  const toast = useToast();
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminMailDiagnostics()
      .then(setDiagnostics)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load mail diagnostics."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runTestSend = async (event) => {
    event.preventDefault();
    const recipient = testRecipient.trim();
    if (!recipient) return;
    setTestBusy(true);
    setTestResult(null);
    try {
      const result = await sendAdminMailTest({ recipient });
      setTestResult(result);
      toast(result.ok ? "Provider accepted the test message." : "Test send failed — see the result below.", result.ok ? undefined : "error");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Test send failed.", "error");
    } finally {
      setTestBusy(false);
    }
  };

  if (loading && !diagnostics) return <Spinner />;

  if (error) {
    return (
      <div style={{ ...SEVERITY_STYLES.critical, borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <strong>Mail diagnostics unavailable.</strong> {error}
      </div>
    );
  }

  if (!diagnostics) return null;

  const hasCritical = diagnostics.problems.some((problem) => problem.severity === "critical");
  const verdictStyle = hasCritical ? SEVERITY_STYLES.critical : diagnostics.problems.length ? SEVERITY_STYLES.warning : OK_STYLE;

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ ...verdictStyle, borderRadius: 8, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <strong style={{ display: "block", marginBottom: 4 }}>Mail delivery</strong>
            <span>{diagnostics.verdict}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button type="button" onClick={load} disabled={loading}>
              {loading ? "Checking…" : "Re-check"}
            </button>
            <button type="button" onClick={() => setExpanded((open) => !open)}>
              {expanded ? "Hide detail" : "Show detail"}
            </button>
          </div>
        </div>

        {diagnostics.problems.length > 0 && (
          <ul style={{ margin: "12px 0 0", paddingLeft: 18 }}>
            {diagnostics.problems.map((problem) => (
              <li key={problem.code} style={{ marginBottom: 8 }}>
                <strong>{problem.severity === "critical" ? "Blocking: " : "Warning: "}</strong>
                {problem.summary}
                <div style={{ opacity: 0.85, marginTop: 2 }}>→ {problem.remedy}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {expanded && (
        <div style={{ border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 14 }}>
          <Field label="Environment" value={diagnostics.environment} />
          <Field
            label="Transport"
            value={`${diagnostics.transport.transport} — ${diagnostics.transport.configured ? "configured" : "NOT configured"} (${diagnostics.transport.detail})`}
          />
          <Field label="From" value={`${diagnostics.sender.fromName} <${diagnostics.sender.fromAddress}>`} mono />
          <Field label="Reply-to" value={diagnostics.sender.replyTo || "(none)"} mono />
          <Field label="Link base (PUBLIC_APP_URL)" value={diagnostics.links.publicAppUrl || "(unset)"} mono />
          <Field label="Verification link shape" value={diagnostics.links.verifyEmailExample} mono />
          <Field label="Worker enabled" value={String(diagnostics.worker.enabled)} />
          <Field label="Worker last poll" value={describeLastTick(diagnostics)} />
          {diagnostics.worker.heartbeat.lastTickError && (
            <Field label="Worker last error" value={diagnostics.worker.heartbeat.lastTickError} mono />
          )}
          <Field
            label="Queue"
            value={
              Object.entries(diagnostics.queue.countsByStatus)
                .map(([status, count]) => `${status}=${count}`)
                .join("  ") || "(empty)"
            }
            mono
          />

          {diagnostics.queue.recentFailures.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13 }}>Recent permanent failures</strong>
              <table style={{ width: "100%", fontSize: 12, marginTop: 6 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Recipient</th>
                    <th style={{ textAlign: "left" }}>Template</th>
                    <th style={{ textAlign: "left" }}>Provider error</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostics.queue.recentFailures.map((job) => (
                    <tr key={job.id}>
                      <td>{job.recipient}</td>
                      <td>{job.templateKey}</td>
                      <td style={{ fontFamily: "ui-monospace, monospace" }}>
                        {job.lastErrorCode}: {job.lastErrorMessage}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={runTestSend} style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
            <label htmlFor="mail-test-recipient" style={{ fontSize: 13, color: "#64748b" }}>
              Send a real test message to
            </label>
            <input
              id="mail-test-recipient"
              type="email"
              value={testRecipient}
              onChange={(event) => setTestRecipient(event.target.value)}
              placeholder="someone@example.com"
              style={{ flex: 1, maxWidth: 300 }}
            />
            <button type="submit" disabled={testBusy || !testRecipient.trim()}>
              {testBusy ? "Sending…" : "Send test"}
            </button>
          </form>
          <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
            Bypasses the queue and reports the provider&rsquo;s own response. Use an address on a different mail provider
            than your own to prove delivery works for real signups.
          </p>

          {testResult && (
            <div
              style={{
                ...(testResult.ok ? OK_STYLE : SEVERITY_STYLES.critical),
                borderRadius: 8,
                padding: 10,
                marginTop: 10,
                fontSize: 13,
              }}
            >
              <strong>{testResult.ok ? "Accepted" : "Rejected"}</strong> via {testResult.transport} → {testResult.recipient}
              {testResult.errorMessage && (
                <div style={{ fontFamily: "ui-monospace, monospace", marginTop: 4 }}>
                  {testResult.errorCode}: {testResult.errorMessage}
                </div>
              )}
              <div style={{ marginTop: 4 }}>{testResult.interpretation}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
