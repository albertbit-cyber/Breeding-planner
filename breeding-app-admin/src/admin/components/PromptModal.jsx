import React, { useState } from "react";

export default function PromptModal({
  title,
  message,
  label = "Reason",
  required = true,
  danger = false,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    if (required && !value.trim()) return;
    onConfirm(value.trim());
  };
  return (
    <div className="admin-modal-backdrop" onClick={onCancel}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        <div className="admin-prompt-modal">
          <div className="admin-field-label">
            {label}
            {required && <span className="admin-required">*</span>}
          </div>
          <textarea
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={required ? "Required" : "Optional"}
          />
        </div>
        <div className="admin-modal-actions">
          <button type="button" className="admin-modal-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`admin-modal-confirm${danger ? " danger" : ""}`}
            disabled={required && !value.trim()}
            onClick={submit}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
