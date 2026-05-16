import React, { useEffect, useState } from "react";
import { fetchPublicSubscriptionTiers } from "../../shared/apiClient";

const formatPrice = (tier) => {
  if (tier.customPrice) return "Custom";
  const amount = Number(tier.monthlyPrice || 0);
  return amount ? `${tier.currency || "EUR"} ${amount}/mo` : "Free";
};

function PricingTierCard({ tier }) {
  const mainFeatures = (tier.features || []).filter((feature) => feature.enabled).slice(0, 8);
  const limits = (tier.features || []).filter((feature) => feature.enabled && feature.limitValue !== null && feature.limitValue !== undefined).slice(0, 5);
  return (
    <article className={`pricing-card ${tier.isRecommended ? "is-recommended" : ""}`}>
      {tier.isRecommended ? <span className="pricing-badge">Recommended</span> : null}
      <h2>{tier.name}</h2>
      <strong>{formatPrice(tier)}</strong>
      <p>{tier.shortDescription || tier.longDescription || "Flexible Breeding Planner access."}</p>
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
          <button type="button" onClick={() => { window.location.hash = "/"; }}>Contact us</button>
        ) : (
          <button type="button" onClick={() => { window.location.hash = "/breeder"; }}>Subscribe</button>
        )}
      </div>
    </article>
  );
}

export default function PricingPage() {
  const [tiers, setTiers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    fetchPublicSubscriptionTiers()
      .then((data) => mounted && setTiers(Array.isArray(data.tiers) ? data.tiers : []))
      .catch((err) => mounted && setError(err instanceof Error ? err.message : "Unable to load pricing."));
    return () => { mounted = false; };
  }, []);

  return (
    <main className="pricing-page">
      <header className="pricing-header">
        <button type="button" onClick={() => { window.location.hash = "/"; }}>Back</button>
        <div>
          <h1>Breeding Planner Pricing</h1>
          <p>Choose the plan that matches your collection, lab, or breeding business.</p>
        </div>
      </header>
      {error && <div className="admin-error">{error}</div>}
      <section className="pricing-grid">
        {tiers.map((tier) => <PricingTierCard key={tier.id} tier={tier} />)}
      </section>
    </main>
  );
}
