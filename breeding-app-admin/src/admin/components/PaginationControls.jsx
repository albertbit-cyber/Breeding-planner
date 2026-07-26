import React from "react";

export default function PaginationControls({ page, pageSize, total, onPage }) {
  const ps = Number(pageSize || 25);
  const pageCount = Math.max(1, Math.ceil(Number(total || 0) / ps));
  const from = Math.min((page - 1) * ps + 1, Number(total || 0));
  const to = Math.min(page * ps, Number(total || 0));
  return (
    <div className="admin-pagination">
      <span className="admin-pagination-info">
        {Number(total || 0) > 0
          ? `${from.toLocaleString()}–${to.toLocaleString()} of ${Number(total).toLocaleString()}`
          : "No records"}
      </span>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Prev
      </button>
      <span className="admin-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
        {page} / {pageCount}
      </span>
      <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        Next →
      </button>
    </div>
  );
}
