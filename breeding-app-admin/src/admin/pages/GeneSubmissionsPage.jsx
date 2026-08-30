import React, { useEffect, useState } from "react";
import AdminLayout from "../components/AdminLayout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import Spinner from "../components/Spinner.jsx";
import { useToast } from "../hooks/useToast.jsx";
import { formatDate } from "../constants.js";
import {
  fetchAdminGeneSubmissions,
  reviewAdminGeneSubmission,
} from "../../shared/apiClient";

/**
 * Genes laboratories have proposed for the shared genetics database.
 *
 * This queue is the reason lab contributions are safe to share. A laboratory can
 * use a gene it has proposed straight away — it is their own catalogue and their
 * own results — but it reaches other breeders only when approved here. A wrong
 * inheritance type would otherwise silently corrupt breeding predictions for
 * everyone keeping that species, including people who never deal with that lab.
 *
 * Which is why approving lets you correct the inheritance first.
 */

const GENE_TYPES = [
  { value: "recessive", label: "Recessive" },
  { value: "incomplete_dominant", label: "Co-dominant (incomplete dominant)" },
  { value: "dominant", label: "Dominant" },
];

const readableType = (value) =>
  GENE_TYPES.find((entry) => entry.value === value)?.label || value;

export default function GeneSubmissionsPage() {
  const toast = useToast();
  const [submissions, setSubmissions] = useState([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [corrections, setCorrections] = useState({});

  const load = (nextStatus = status) => {
    setLoading(true);
    setError("");
    fetchAdminGeneSubmissions({ status: nextStatus })
      .then((data) => setSubmissions(Array.isArray(data?.submissions) ? data.submissions : []))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load submissions."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (submission, decision) => {
    const correctedType = corrections[submission.id];
    let note;

    if (decision === "rejected") {
      note = window.prompt(
        `Reject "${submission.geneName}". The laboratory sees this reason, so tell them what to fix:`
      );
      if (!note || !note.trim()) return;
    } else if (correctedType && correctedType !== submission.geneType) {
      const confirmed = window.confirm(
        `Approve "${submission.geneName}" as ${readableType(correctedType)} instead of ` +
          `${readableType(submission.geneType)}?\n\nThis becomes the inheritance every breeder's ` +
          `predictions use for this gene.`
      );
      if (!confirmed) return;
      note = `Inheritance corrected to ${readableType(correctedType)} on approval.`;
    }

    setBusy(true);
    try {
      await reviewAdminGeneSubmission(submission.id, {
        status: decision,
        note: note?.trim() || undefined,
        ...(decision === "approved" && correctedType ? { geneType: correctedType } : {}),
      });
      toast(
        decision === "approved"
          ? `${submission.geneName} is now in the ${submission.speciesName} database.`
          : `${submission.geneName} rejected.`
      );
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not record that decision.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout breadcrumbs={[{ label: "Gene Submissions" }]}>
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Gene Submissions</h2>
            <p>
              Genes laboratories test for that the platform's database does not have yet.
              Approving one publishes it to every breeder keeping that species, so check the
              inheritance before you do — you can correct it here.
            </p>
          </div>
          <div className="admin-row-actions">
            <button type="button" onClick={() => load()}>Refresh</button>
          </div>
        </div>

        <div className="admin-filters">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              load(e.target.value);
            }}
          >
            <option value="pending">Awaiting review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
        </div>

        {error && <div className="admin-error">{error}</div>}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Gene</th>
                <th>Species</th>
                <th>Inheritance</th>
                <th>Proposed by</th>
                <th>Notes</th>
                <th>Received</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.id}>
                  <td>
                    <div>{submission.geneName}</div>
                    {submission.aliases?.length ? (
                      <div className="admin-muted">also: {submission.aliases.join(", ")}</div>
                    ) : null}
                    {submission.complex ? (
                      <div className="admin-muted">complex: {submission.complex}</div>
                    ) : null}
                  </td>
                  <td>{submission.speciesName}</td>
                  <td>
                    {submission.status === "pending" ? (
                      <select
                        value={corrections[submission.id] || submission.geneType}
                        disabled={busy}
                        onChange={(e) =>
                          setCorrections((prev) => ({ ...prev, [submission.id]: e.target.value }))
                        }
                      >
                        {GENE_TYPES.map((entry) => (
                          <option key={entry.value} value={entry.value}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      readableType(submission.geneType)
                    )}
                  </td>
                  <td>{submission.labName || "—"}</td>
                  <td style={{ maxWidth: 280 }}>
                    {submission.notes || "—"}
                    {submission.reviewNote ? (
                      <div className="admin-muted">decision: {submission.reviewNote}</div>
                    ) : null}
                  </td>
                  <td>{formatDate(submission.createdAt)}</td>
                  <td>
                    {submission.status === "pending" ? (
                      <div className="admin-row-actions">
                        <button type="button" disabled={busy} onClick={() => decide(submission, "approved")}>
                          Approve
                        </button>
                        <button type="button" disabled={busy} onClick={() => decide(submission, "rejected")}>
                          Reject
                        </button>
                      </div>
                    ) : (
                      <StatusBadge value={submission.status} />
                    )}
                  </td>
                </tr>
              ))}
              {!submissions.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 24 }}>
                    {loading ? <Spinner /> : <span className="admin-muted">Nothing here.</span>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
