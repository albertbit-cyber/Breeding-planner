import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchPublicSubscriptionTiers } from "../../shared/apiClient";

const formatPrice = (tier, t) => {
  if (tier.customPrice) return t("pricing.customPrice", { defaultValue: "Custom" });
  const amount = Number(tier.monthlyPrice || 0);
  return amount ? t("pricing.monthlyPrice", { defaultValue: "{{currency}} {{amount}}/mo", currency: tier.currency || "EUR", amount }) : t("pricing.free", { defaultValue: "Free" });
};

function PricingTierCard({ tier }) {
  const { t } = useTranslation();
  const mainFeatures = (tier.features || []).filter((feature) => feature.enabled).slice(0, 8);
  const limits = (tier.features || []).filter((feature) => feature.enabled && feature.limitValue !== null && feature.limitValue !== undefined).slice(0, 5);
  return (
    <article className={`pricing-card ${tier.isRecommended ? "is-recommended" : ""}`}>
      {tier.isRecommended ? <span className="pricing-badge">{t("pricing.recommended", { defaultValue: "Recommended" })}</span> : null}
      <h2>{tier.name}</h2>
      <strong>{formatPrice(tier, t)}</strong>
      <p>{tier.shortDescription || tier.longDescription || t("pricing.defaultTierDescription", { defaultValue: "Flexible Breeding Planner access." })}</p>
      <ul>
        {mainFeatures.map((feature) => <li key={feature.featureKey}>{feature.featureName}</li>)}
      </ul>
      {limits.length ? (
        <div className="pricing-limits">
          {limits.map((feature) => (
            <span key={feature.featureKey}>{feature.featureName}: {feature.limitValue}</span>
          ))}
        </div>
      ) : null}
      <div className="pricing-actions">
        {tier.customPrice ? (
          <button type="button" onClick={() => { window.location.hash = "/"; }}>{t("pricing.contactUs", { defaultValue: "Contact us" })}</button>
        ) : (
          <button type="button" onClick={() => { window.location.hash = "/breeder"; }}>{t("pricing.subscribe", { defaultValue: "Subscribe" })}</button>
        )}
      </div>
    </article>
  );
}

export default function PricingPage() {
  const { t } = useTranslation();
  const [tiers, setTiers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    fetchPublicSubscriptionTiers()
      .then((data) => mounted && setTiers(Array.isArray(data.tiers) ? data.tiers : []))
      .catch((err) => mounted && setError(err instanceof Error ? err.message : t("pricing.loadFailed", { defaultValue: "Unable to load pricing." })));
    return () => { mounted = false; };
  }, [t]);

  return (
    <main className="pricing-page">
      <header className="pricing-header">
        <button type="button" onClick={() => { window.location.hash = "/"; }}>{t("common.back", { defaultValue: "Back" })}</button>
        <div>
          <h1>{t("pricing.title", { defaultValue: "Breeding Planner Pricing" })}</h1>
          <p>{t("pricing.subtitle", { defaultValue: "Choose the plan that matches your collection, lab, or breeding business." })}</p>
        </div>
      </header>
      {error && <div className="admin-error">{error}</div>}
      <section className="pricing-grid">
        {tiers.map((tier) => <PricingTierCard key={tier.id} tier={tier} />)}
      </section>
    </main>
  );
}
