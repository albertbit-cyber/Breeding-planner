import React from "react";

export default function StatusBadge({ value }) {
  const key = String(value || "").toLowerCase().replace(/\s+/g, "_");
  return (
    <span className={`admin-badge admin-badge--${key}`}>
      {value || "-"}
    </span>
  );
}
