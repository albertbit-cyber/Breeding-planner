import React from "react";

export default function Spinner({ label = "Loading..." }) {
  return (
    <div className="admin-loading-row">
      <div className="admin-spinner" />
      <span>{label}</span>
    </div>
  );
}
