import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import Icon from "./Icon";

const ToastContext = createContext({ notify: () => {} });

/**
 * Confirmations only.
 *
 * A toast used to be where failures went to die -- four seconds and gone, with
 * no other trace that a request had failed. Errors now render as panels the
 * reader has to deal with; this carries "Message sent", "Listing published",
 * and nothing that needs a decision.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message, options = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [...current, { id, message, tone: options.tone || "ok" }]);
      window.setTimeout(() => dismiss(id), options.duration || 4500);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="mk-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`mk-toast mk-toast--${toast.tone}`}>
            <Icon name={toast.tone === "ok" ? "circleCheck" : "alert"} size={17} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export default ToastProvider;
