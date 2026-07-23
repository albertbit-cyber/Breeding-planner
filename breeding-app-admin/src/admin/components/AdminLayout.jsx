import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const logoSrc = `${typeof process !== "undefined" ? (process.env.PUBLIC_URL || "") : ""}/app-icons/icon_512x512.png`;

const NAV = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: "⊞", exact: true },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "All Users", icon: "◈" },
      { href: "/admin/verification", label: "Breeder Verification", icon: "✦" },
      { href: "/admin/labs", label: "Lab Accounts", icon: "⬡" },
    ],
  },
  {
    label: "Content & Safety",
    items: [
      { href: "/admin/reports", label: "Reports", icon: "⚑" },
      { href: "/admin/marketplace", label: "Marketplace", icon: "⊕" },
    ],
  },
  {
    label: "Subscriptions",
    items: [
      { href: "/admin/tiers", label: "Tiers", icon: "◇" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/notifications", label: "Announcements", icon: "◎" },
      { href: "/admin/emails", label: "Emails", icon: "✉" },
      { href: "/admin/gdpr", label: "GDPR Tools", icon: "⊗" },
      { href: "/admin/team", label: "Team & Account", icon: "⊙" },
    ],
  },
];

function isActive(href, pathname, exact) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminLayout({ children, breadcrumbs }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const go = (href) => {
    navigate(href);
    setSidebarOpen(false);
  };

  return (
    <div className="admin-shell">
      {sidebarOpen && (
        <div
          className="admin-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`admin-sidebar${sidebarOpen ? " is-open" : ""}`}>
        <div className="admin-brand">
          <img src={logoSrc} alt="Admin" className="admin-brand-logo" />
          Admin Panel
          <button
            type="button"
            className="admin-sidebar-close"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>

        <nav>
          {NAV.map((group) => (
            <div key={group.label} className="admin-nav-group">
              <div className="admin-nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.href}
                  type="button"
                  className={`admin-nav-item${isActive(item.href, location.pathname, item.exact) ? " active" : ""}`}
                  onClick={() => go(item.href)}
                >
                  <span className="admin-nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="admin-main">
        <div className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="admin-hamburger"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>

            <nav className="admin-breadcrumbs">
              <button
                type="button"
                className="admin-breadcrumb-link"
                onClick={() => go("/admin")}
              >
                Admin
              </button>
              {(breadcrumbs || []).map((crumb, i) => (
                <React.Fragment key={i}>
                  <span className="admin-breadcrumb-sep">›</span>
                  {crumb.href ? (
                    <button
                      type="button"
                      className="admin-breadcrumb-link"
                      onClick={() => go(crumb.href)}
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="admin-breadcrumb-current">{crumb.label}</span>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>

          <div className="admin-topbar-actions">
            <button type="button" onClick={() => go("/")}>Home</button>
            <button type="button" onClick={() => go("/breeder")}>Breeder App</button>
          </div>
        </div>

        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
