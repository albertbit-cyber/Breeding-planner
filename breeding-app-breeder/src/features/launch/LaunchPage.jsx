import React from "react";

const goTo = (hashPath) => {
  window.location.hash = hashPath;
};

export default function LaunchPage() {
  return (
    <main className="launch-shell">
      <section className="launch-hero">
        <div>
          <p className="launch-kicker">Breeding Planner</p>
          <h1>Select workspace</h1>
          <p>
            Open the breeder tools, mobile rack terminal, marketplace, pricing, or admin portal.
          </p>
        </div>
      </section>

      <section className="launch-actions" aria-label="Application workspaces">
        <button type="button" onClick={() => goTo("/breeder")}>
          <span>Breeder App</span>
          <strong>Manage animals, pairings, clutches, labels, and breeder lab orders.</strong>
        </button>
        <button type="button" onClick={() => goTo("/marketplace")}>
          <span>Marketplace</span>
          <strong>Browse public breeder profiles, listings, inquiries, and saved searches.</strong>
        </button>
        <button type="button" onClick={() => goTo("/mobile")}>
          <span>Mobile App</span>
          <strong>Scan QR codes, open animal profiles, and update rack records fast.</strong>
        </button>
        <button type="button" onClick={() => goTo("/pricing")}>
          <span>Pricing</span>
          <strong>Compare public subscription tiers and upgrade options.</strong>
        </button>
        <button type="button" onClick={() => goTo("/admin")}>
          <span>Admin Portal</span>
          <strong>Moderate listings, review notifications, and inspect audit history.</strong>
        </button>
      </section>
    </main>
  );
}
