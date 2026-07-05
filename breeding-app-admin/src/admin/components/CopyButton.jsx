import React, { useState } from "react";

export default function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(String(value || "")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      className="admin-copy-btn"
      title={copied ? "Copied!" : "Copy ID"}
      onClick={copy}
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
}
