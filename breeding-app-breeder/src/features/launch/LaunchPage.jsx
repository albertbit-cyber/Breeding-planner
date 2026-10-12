import React from "react";
import { useTranslation } from "react-i18next";

const goTo = (hashPath) => {
  window.location.hash = hashPath;
};

export default function LaunchPage() {
  const { t } = useTranslation();
  return (
    <main className="launch-shell">
      <section className="launch-hero">
        <div>
          <p className="launch-kicker">Serpentora</p>
          <h1>{t("launch.title", { defaultValue: "Select workspace" })}</h1>
          <p>
            {t("launch.subtitle", { defaultValue: "Open the breeder tools, mobile rack terminal, marketplace, pricing, or admin portal." })}
          </p>
        </div>
      </section>

      <section className="launch-actions" aria-label={t("launch.workspacesAria", { defaultValue: "Application workspaces" })}>
        <button type="button" onClick={() => goTo("/breeder")}>
          <span>{t("launch.breeder.title", { defaultValue: "Breeder App" })}</span>
          <strong>{t("launch.breeder.body", { defaultValue: "Manage animals, pairings, clutches, labels, and breeder lab orders." })}</strong>
        </button>
        <button type="button" onClick={() => goTo("/marketplace")}>
          <span>{t("launch.marketplace.title", { defaultValue: "Marketplace" })}</span>
          <strong>{t("launch.marketplace.body", { defaultValue: "Browse public breeder profiles, listings, inquiries, and saved searches." })}</strong>
        </button>
        <button type="button" onClick={() => goTo("/mobile")}>
          <span>{t("launch.mobile.title", { defaultValue: "Mobile App" })}</span>
          <strong>{t("launch.mobile.body", { defaultValue: "Scan QR codes, open animal profiles, and update rack records fast." })}</strong>
        </button>
        <button type="button" onClick={() => goTo("/pricing")}>
          <span>{t("launch.pricing.title", { defaultValue: "Pricing" })}</span>
          <strong>{t("launch.pricing.body", { defaultValue: "Compare public subscription tiers and upgrade options." })}</strong>
        </button>
        <button type="button" onClick={() => goTo("/admin")}>
          <span>{t("launch.admin.title", { defaultValue: "Admin Portal" })}</span>
          <strong>{t("launch.admin.body", { defaultValue: "Moderate listings, review notifications, and inspect audit history." })}</strong>
        </button>
      </section>
    </main>
  );
}
