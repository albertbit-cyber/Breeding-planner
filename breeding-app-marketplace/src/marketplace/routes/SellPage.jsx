import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { dashboard as fetchDashboard, saveListing, sellableAnimals } from "../api";
import { grams, money, parseGenes } from "../format";
import Button from "../ui/Button";
import GeneTags from "../ui/GeneTags";
import Icon from "../ui/Icon";
import ListingCard from "../ui/ListingCard";
import PhotoUploader from "../ui/PhotoUploader";
import ProvenanceMeter from "../ui/ProvenanceMeter";
import { AvailabilityPill, Pill } from "../ui/Pill";
import { EmptyState, ErrorPanel, Spinner } from "../ui/States";
import { useToast } from "../ui/Toast";

/**
 * Listing an animal.
 *
 * The old editor was twenty blank fields plus a text input labelled "Photo
 * URL", so a breeder retyped data the app already held about an animal it
 * already knew. `MarketplaceListing.animalId` -- the column that connects a
 * listing to its animal record -- existed the whole time and was never written.
 *
 * Here the listing is derived from the animal: title, sex, hatch date, weight,
 * genetics, photos and feeding notes all arrive filled in, and what is left is
 * three decisions. Which animal, what price, and how much of the record to
 * publish.
 */

const STEPS = ["animal", "price", "publish", "review"];

const PUBLISH_SWITCHES = [
  { key: "showGeneticTestResult", icon: "dna", tone: "sage", requires: "hasCertificate" },
  { key: "showWeightHistory", icon: "scale", tone: "teal", requires: "weights" },
  { key: "showFeedingHistory", icon: "calendar", tone: "clay", requires: "feeds" },
  { key: "showLineage", icon: "tag", tone: "violet", requires: "parents" },
  { key: "showAnimalId", icon: "eye", tone: "quiet" },
  { key: "showBreederNotes", icon: "eye", tone: "quiet" },
];

const emptyDraft = () => ({
  title: "",
  species: "Ball python",
  category: "",
  genetics: "",
  sex: "",
  birthDate: "",
  weight: "",
  price: "",
  currency: "EUR",
  country: "",
  city: "",
  shippingAvailable: true,
  pickupAvailable: true,
  description: "",
  feedingNotes: "",
  temperamentNotes: "",
  images: [],
  animalId: "",
  publicDataSettings: {
    showAnimalId: false,
    showParents: false,
    showFeedingHistory: false,
    showWeightHistory: false,
    showGeneticTestResult: false,
    showDocuments: false,
    showBreederNotes: false,
    showLineage: false,
  },
});

/** What the card will look like once published — the seller sees it change. */
const previewListing = (draft, animal) => ({
  id: "preview",
  title: draft.title || animal?.name || "",
  genetics: draft.genetics,
  sex: draft.sex,
  weight: draft.weight,
  price: draft.price,
  currency: draft.currency,
  city: draft.city,
  country: draft.country,
  availability: "available",
  status: "available",
  images: draft.images,
  imageUrl: draft.images[0]?.imageUrl || "",
  publishedAt: new Date().toISOString(),
  provenance: provenanceFor(draft, animal),
  seller: null,
});

/**
 * Mirrors the server's rule exactly: a switch turned on over an empty log
 * fills nothing. The preview would be a lie otherwise.
 */
function provenanceFor(draft, animal) {
  const settings = draft.publicDataSettings || {};
  const counts = animal?.counts || {};
  const flags = {
    photos: (draft.images || []).length >= 2,
    weights: Boolean(settings.showWeightHistory) && Number(counts.weights || 0) >= 3,
    lineage: Boolean(settings.showLineage || settings.showParents) && Number(counts.parents || 0) > 0,
    verifiedGenetics: Boolean(settings.showGeneticTestResult) && Boolean(animal?.hasCertificate),
  };
  return { ...flags, filled: Object.values(flags).filter(Boolean).length };
}

export default function SellPage() {
  const { listingId } = useParams();
  const { t, i18n } = useTranslation("marketplace");
  const { notify } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(listingId ? "price" : "animal");
  const [animals, setAnimals] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [onlyUnlisted, setOnlyUnlisted] = useState(true);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sellableAnimals()
      .then(setAnimals)
      .catch((loadError) => {
        setError(loadError);
        setAnimals([]);
      });
  }, []);

  // Editing an existing listing skips the picker.
  useEffect(() => {
    if (!listingId) return;
    fetchDashboard()
      .then((data) => {
        const existing = (data.listings || []).find((item) => item.id === listingId);
        if (!existing) {
          setError(new Error(t("sell.notFound", { defaultValue: "That listing could not be found." })));
          return;
        }
        setDraft({
          ...emptyDraft(),
          ...existing,
          birthDate: existing.birthDate ? String(existing.birthDate).slice(0, 10) : "",
          images: existing.images || [],
          publicDataSettings: { ...emptyDraft().publicDataSettings, ...(existing.publicDataSettings || {}) },
        });
      })
      .catch(setError);
  }, [listingId, t]);

  useEffect(() => {
    if (!listingId || !animals || !draft.animalId) return;
    setSelected(animals.find((animal) => animal.appAnimalId === draft.animalId) || null);
  }, [animals, draft.animalId, listingId]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (animals || []).filter((animal) => {
      if (onlyUnlisted && animal.listing) return false;
      if (!term) return true;
      return [animal.name, animal.appAnimalId, animal.genetics].filter(Boolean).some((value) =>
        String(value).toLowerCase().includes(term)
      );
    });
  }, [animals, onlyUnlisted, query]);

  const chooseAnimal = (animal) => {
    setSelected(animal);
    setDraft((current) => ({
      ...current,
      animalId: animal.appAnimalId,
      title: animal.name,
      species: animal.species || "Ball python",
      genetics: animal.genetics,
      sex: animal.sex,
      birthDate: animal.birthDate ? String(animal.birthDate).slice(0, 10) : "",
      weight: animal.weight || "",
      feedingNotes: animal.feedingNotes || "",
      images: (animal.photos || []).map((url, index) => ({
        imageUrl: url,
        isPrimary: index === 0,
        sortOrder: index,
      })),
    }));
    setStep("price");
  };

  const setPublish = (key, value) =>
    setDraft((current) => ({
      ...current,
      publicDataSettings: { ...current.publicDataSettings, [key]: value },
    }));

  const publish = async (status) => {
    setSaving(true);
    try {
      const result = await saveListing({
        ...draft,
        id: listingId,
        status,
        availability: status === "available" ? "available" : "draft",
      });
      notify(
        status === "available"
          ? t("sell.published", { defaultValue: "Listing published." })
          : t("sell.savedDraft", { defaultValue: "Saved as a draft." })
      );
      const id = result?.listing?.id || listingId;
      navigate(status === "available" && id ? `/a/${id}` : "/dashboard");
    } catch (saveError) {
      notify(saveError?.message || t("errors.generic", { defaultValue: "Something went wrong." }), { tone: "bad" });
    } finally {
      setSaving(false);
    }
  };

  if (animals === null && !error) return <Spinner />;

  const provenance = provenanceFor(draft, selected);
  const canLeaveAnimal = Boolean(draft.animalId || draft.title);
  const canPublish = Boolean(draft.title && (draft.price || draft.price === 0));

  return (
    <div className="mk-wrap" style={{ paddingBottom: 40 }}>
      <div style={{ padding: "24px 0 0" }}>
        <h1 className="mk-h1">
          {listingId ? t("sell.editTitle", { defaultValue: "Edit listing" }) : t("sell.title", { defaultValue: "List an animal" })}
        </h1>
      </div>

      <nav className="mk-steps-rail" style={{ borderBottom: "1px solid var(--mk-rule)", marginBottom: 24 }}>
        {STEPS.map((name, index) => (
          <button
            key={name}
            type="button"
            className={`mk-steps-rail__item ${step === name ? "is-on" : ""}`}
            disabled={name !== "animal" && !canLeaveAnimal}
            onClick={() => setStep(name)}
          >
            <span className="mk-steps-rail__n">{index + 1}</span>
            {t(`sell.step.${name}`, { defaultValue: name })}
          </button>
        ))}
      </nav>

      {error ? <ErrorPanel error={error} /> : null}

      {step === "animal" ? (
        <>
          <div className="mk-row mk-row--between" style={{ marginBottom: 16, alignItems: "flex-start" }}>
            <p className="mk-muted mk-sm" style={{ margin: 0, maxWidth: "64ch" }}>
              {t("sell.pickBody", {
                defaultValue:
                  "Everything you've already logged — photos, weights, feeding, genetics, lineage — comes across with the animal. You choose what stays private in step 3.",
              })}
            </p>
            <div className="mk-row" style={{ gap: 8 }}>
              <input
                className="mk-input"
                style={{ width: 240 }}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("sell.searchAnimals", {
                  defaultValue: "Search your {{count}} animals…",
                  count: animals?.length || 0,
                })}
                aria-label={t("sell.searchAnimalsLabel", { defaultValue: "Search your animals" })}
              />
              <button
                type="button"
                className={`mk-chip ${onlyUnlisted ? "is-on" : ""}`}
                onClick={() => setOnlyUnlisted((current) => !current)}
              >
                {t("sell.notListed", { defaultValue: "Not listed" })}
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon="search"
              title={t("sell.noAnimalsTitle", { defaultValue: "Nothing to list here" })}
              body={t("sell.noAnimalsBody", {
                defaultValue:
                  "Every animal in your collection is either already listed or filtered out. You can also list something you haven't logged yet.",
              })}
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelected(null);
                    setDraft(emptyDraft());
                    setStep("price");
                  }}
                >
                  {t("sell.startBlank", { defaultValue: "Start from a blank listing" })}
                </Button>
              }
            />
          ) : (
            <div className="mk-grid">
              {filtered.map((animal) => {
                const counts = animal.counts || {};
                const preview = provenanceFor(
                  {
                    images: (animal.photos || []).map((url) => ({ imageUrl: url })),
                    publicDataSettings: {
                      showWeightHistory: true,
                      showLineage: true,
                      showGeneticTestResult: true,
                    },
                  },
                  animal
                );
                return (
                  <article
                    key={animal.appAnimalId}
                    className={`mk-card mk-listing ${animal.listing ? "" : ""}`}
                    style={animal.listing ? { opacity: 0.55 } : undefined}
                  >
                    <div className="mk-listing__photo">
                      {animal.imageUrl ? (
                        <img src={animal.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="mk-listing__nophoto">
                          <Icon name="photo" size={20} />
                        </span>
                      )}
                      {animal.listing ? (
                        <div className="mk-listing__badges">
                          <AvailabilityPill availability={animal.listing.availability} status={animal.listing.status} />
                        </div>
                      ) : null}
                    </div>
                    <div className="mk-listing__body">
                      <h3 className="mk-listing__title">
                        <button
                          type="button"
                          className="mk-listing__link mk-listing__link--button"
                          disabled={Boolean(animal.listing)}
                          onClick={() => chooseAnimal(animal)}
                        >
                          {animal.name}
                        </button>
                      </h3>
                      <span className="mk-xs mk-subtle mk-mono">{animal.appAnimalId}</span>
                      <GeneTags genetics={animal.genetics} max={2} />
                      <p className="mk-listing__facts">
                        {animal.sex ? <span>{t(`sex.${animal.sex}`, { defaultValue: animal.sex })}</span> : null}
                        {animal.weight ? <span className="mk-tnum">{grams(animal.weight, i18n.language)}</span> : null}
                      </p>
                      <div className="mk-listing__foot">
                        <ProvenanceMeter provenance={preview} />
                        <span className="mk-xs mk-subtle">
                          {t("sell.photoCount", { defaultValue: "{{count}} photos", count: counts.photos || 0 })}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div
            className="mk-row mk-row--between"
            style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--mk-rule)" }}
          >
            <span className="mk-sm mk-muted">
              {t("sell.notLoggedHint", { defaultValue: "Selling something you haven't logged?" })}{" "}
              <button
                type="button"
                className="mk-btn mk-btn--quiet mk-btn--sm"
                onClick={() => {
                  setSelected(null);
                  setDraft(emptyDraft());
                  setStep("price");
                }}
              >
                {t("sell.startBlank", { defaultValue: "Start from a blank listing" })}
              </button>
            </span>
          </div>
        </>
      ) : null}

      {step === "price" ? (
        <div className="mk-split">
          <div>
            <div className="mk-section">
              <h2 className="mk-h2">{t("sell.basics", { defaultValue: "The basics" })}</h2>
              <label className="mk-field">
                <span className="mk-label">{t("sell.listingTitle", { defaultValue: "Listing title" })}</span>
                <input
                  className="mk-input"
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </label>
              <label className="mk-field">
                <span className="mk-label">{t("sell.genetics", { defaultValue: "Genetics" })}</span>
                <input
                  className="mk-input"
                  value={draft.genetics}
                  onChange={(event) => setDraft({ ...draft, genetics: event.target.value })}
                  placeholder="Clown, het Pied"
                />
                <span className="mk-hint">
                  {t("sell.geneticsHint", {
                    defaultValue: "Separate traits with commas. Anything starting with “het” renders as a het tag.",
                  })}
                </span>
                <div style={{ marginTop: 8 }}>
                  <GeneTags genes={parseGenes(draft.genetics)} />
                </div>
              </label>
              <div className="mk-row" style={{ gap: 12, alignItems: "flex-end" }}>
                <label className="mk-field mk-grow">
                  <span className="mk-label">{t("listing.sex", { defaultValue: "Sex" })}</span>
                  <select
                    className="mk-select"
                    value={draft.sex}
                    onChange={(event) => setDraft({ ...draft, sex: event.target.value })}
                  >
                    <option value="">—</option>
                    <option value="female">{t("sex.female", { defaultValue: "Female" })}</option>
                    <option value="male">{t("sex.male", { defaultValue: "Male" })}</option>
                    <option value="unknown">{t("sex.unknown", { defaultValue: "Unknown" })}</option>
                  </select>
                </label>
                <label className="mk-field mk-grow">
                  <span className="mk-label">{t("listing.hatched", { defaultValue: "Hatched" })}</span>
                  <input
                    className="mk-input"
                    type="date"
                    value={draft.birthDate || ""}
                    onChange={(event) => setDraft({ ...draft, birthDate: event.target.value })}
                  />
                </label>
                <label className="mk-field mk-grow">
                  <span className="mk-label">{t("sell.weightGrams", { defaultValue: "Weight (g)" })}</span>
                  <input
                    className="mk-input"
                    type="number"
                    min="0"
                    value={draft.weight || ""}
                    onChange={(event) => setDraft({ ...draft, weight: event.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="mk-section">
              <h2 className="mk-h2">{t("sell.priceTerms", { defaultValue: "Price and terms" })}</h2>
              <div className="mk-row" style={{ gap: 12, alignItems: "flex-end" }}>
                <label className="mk-field" style={{ width: 180 }}>
                  <span className="mk-label">{t("sell.price", { defaultValue: "Price" })}</span>
                  <input
                    className="mk-input"
                    type="number"
                    min="0"
                    value={draft.price}
                    onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                  />
                </label>
                <label className="mk-field" style={{ width: 120 }}>
                  <span className="mk-label">{t("sell.currency", { defaultValue: "Currency" })}</span>
                  <select
                    className="mk-select"
                    value={draft.currency}
                    onChange={(event) => setDraft({ ...draft, currency: event.target.value })}
                  >
                    {["EUR", "GBP", "USD", "CHF", "SEK", "PLN", "CZK"].map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mk-field mk-grow">
                  <span className="mk-label">{t("sell.category", { defaultValue: "Life stage" })}</span>
                  <input
                    className="mk-input"
                    value={draft.category}
                    onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                    placeholder="Juvenile"
                  />
                </label>
              </div>

              <div className="mk-row" style={{ gap: 12, alignItems: "flex-end" }}>
                <label className="mk-field mk-grow">
                  <span className="mk-label">{t("sell.city", { defaultValue: "City / region" })}</span>
                  <input
                    className="mk-input"
                    value={draft.city}
                    onChange={(event) => setDraft({ ...draft, city: event.target.value })}
                  />
                </label>
                <label className="mk-field mk-grow">
                  <span className="mk-label">{t("filters.country", { defaultValue: "Country" })}</span>
                  <input
                    className="mk-input"
                    value={draft.country}
                    onChange={(event) => setDraft({ ...draft, country: event.target.value })}
                  />
                </label>
              </div>

              <div className="mk-chiprow" style={{ padding: 0 }}>
                <button
                  type="button"
                  className={`mk-chip ${draft.shippingAvailable ? "is-on" : ""}`}
                  onClick={() => setDraft({ ...draft, shippingAvailable: !draft.shippingAvailable })}
                >
                  <Icon name="truck" size={13} />
                  {t("filters.shipping", { defaultValue: "Ships" })}
                </button>
                <button
                  type="button"
                  className={`mk-chip ${draft.pickupAvailable ? "is-on" : ""}`}
                  onClick={() => setDraft({ ...draft, pickupAvailable: !draft.pickupAvailable })}
                >
                  <Icon name="pin" size={13} />
                  {t("filters.pickup", { defaultValue: "Local pickup" })}
                </button>
              </div>
            </div>

            <div className="mk-section">
              <h2 className="mk-h2">{t("sell.photos", { defaultValue: "Photos" })}</h2>
              <PhotoUploader
                images={draft.images}
                listingId={listingId}
                onChange={(images) => setDraft({ ...draft, images })}
              />
            </div>

            <div className="mk-section">
              <h2 className="mk-h2">{t("sell.words", { defaultValue: "In your words" })}</h2>
              <label className="mk-field">
                <span className="mk-label">{t("sell.description", { defaultValue: "Description" })}</span>
                <textarea
                  className="mk-textarea"
                  rows={5}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  placeholder={t("sell.descriptionPlaceholder", {
                    defaultValue: "How she feeds, what she was produced from, how you'd like to hand her over…",
                  })}
                />
              </label>
              <label className="mk-field">
                <span className="mk-label">{t("sell.temperament", { defaultValue: "Temperament notes" })}</span>
                <input
                  className="mk-input"
                  value={draft.temperamentNotes}
                  onChange={(event) => setDraft({ ...draft, temperamentNotes: event.target.value })}
                />
              </label>
            </div>

            <div className="mk-row" style={{ marginTop: 24, gap: 10 }}>
              <Button variant="outline" onClick={() => setStep("animal")}>
                {t("common.back", { defaultValue: "Back" })}
              </Button>
              <Button variant="ink" iconAfter="chevronRight" onClick={() => setStep("publish")} disabled={!draft.title}>
                {t("sell.toPublish", { defaultValue: "Choose what to publish" })}
              </Button>
            </div>
          </div>

          <aside>
            <h2 className="mk-label" style={{ margin: "0 0 10px" }}>
              {t("sell.preview", { defaultValue: "Buyer's view" })}
            </h2>
            <ListingCard listing={previewListing(draft, selected)} as="button" onSelect={() => {}} />
          </aside>
        </div>
      ) : null}

      {step === "publish" ? (
        <div className="mk-split">
          <div>
            <h2 className="mk-h1" style={{ fontSize: 21 }}>
              {t("publish.title", { defaultValue: "What should buyers see?" })}
            </h2>
            <p className="mk-muted mk-sm" style={{ maxWidth: "60ch", marginBottom: 20 }}>
              {t("publish.body", {
                defaultValue:
                  "Every switch adds a piece of the animal's record to the listing. Nothing is shared until you publish, and you can change any of this later.",
              })}
            </p>

            <div className="mk-record">
              {PUBLISH_SWITCHES.map((entry) => {
                const on = Boolean(draft.publicDataSettings[entry.key]);
                const counts = selected?.counts || {};
                const available =
                  !entry.requires ||
                  (entry.requires === "hasCertificate" ? Boolean(selected?.hasCertificate) : Number(counts[entry.requires] || 0) > 0);
                return (
                  <div className="mk-record__row" key={entry.key}>
                    <span className={`mk-record__icon mk-record__icon--${entry.tone}`}>
                      <Icon name={entry.icon} size={16} />
                    </span>
                    <span className="mk-record__text">
                      <b className="mk-record__title">{t(`publish.${entry.key}`, { defaultValue: entry.key })}</b>
                      <span className="mk-record__sub">
                        {available
                          ? t(`publish.${entry.key}Why`, { defaultValue: "" })
                          : t("publish.nothingLogged", {
                              defaultValue: "Nothing logged for this yet — turning it on publishes nothing.",
                            })}
                      </span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      className="mk-switch"
                      aria-checked={on}
                      aria-label={t(`publish.${entry.key}`, { defaultValue: entry.key })}
                      onClick={() => setPublish(entry.key, !on)}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mk-row" style={{ marginTop: 24, gap: 10 }}>
              <Button variant="outline" onClick={() => setStep("price")}>
                {t("common.back", { defaultValue: "Back" })}
              </Button>
              <Button variant="ink" iconAfter="chevronRight" onClick={() => setStep("review")}>
                {t("sell.toReview", { defaultValue: "Review and publish" })}
              </Button>
            </div>
          </div>

          <aside>
            <h2 className="mk-label" style={{ margin: "0 0 10px" }}>
              {t("publish.previewLabel", { defaultValue: "Buyer's view — updates as you switch" })}
            </h2>
            <ListingCard listing={previewListing(draft, selected)} as="button" onSelect={() => {}} />

            <div className="mk-panel mk-panel--sky" style={{ marginTop: 14 }}>
              <Icon name="shield" size={17} />
              <div className="mk-panel__body">
                <p style={{ margin: 0 }}>
                  {provenance.filled === 4
                    ? t("publish.strong", { defaultValue: "Full record. This is the strongest a listing can be." })
                    : t("publish.encourage", {
                        defaultValue:
                          "{{filled}} of 4 published. Listings carrying more of the record get more enquiries, because buyers can check them.",
                        filled: provenance.filled,
                      })}
                </p>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="mk-split">
          <div>
            <h2 className="mk-h1" style={{ fontSize: 21 }}>
              {t("sell.reviewTitle", { defaultValue: "Ready to publish" })}
            </h2>
            <dl className="mk-spec" style={{ maxWidth: 520, marginTop: 16 }}>
              <dt>{t("sell.listingTitle", { defaultValue: "Listing title" })}</dt>
              <dd>{draft.title || "—"}</dd>
              <dt>{t("sell.price", { defaultValue: "Price" })}</dt>
              <dd className="mk-tnum">{money(draft.price, draft.currency, i18n.language) || "—"}</dd>
              <dt>{t("sell.genetics", { defaultValue: "Genetics" })}</dt>
              <dd>{draft.genetics || "—"}</dd>
              <dt>{t("sell.photos", { defaultValue: "Photos" })}</dt>
              <dd>{draft.images.length}</dd>
              <dt>{t("provenance.label", { defaultValue: "Record" })}</dt>
              <dd>
                <ProvenanceMeter provenance={provenance} />
              </dd>
              <dt>{t("sell.linkedAnimal", { defaultValue: "Linked animal" })}</dt>
              <dd className="mk-mono">
                {draft.animalId || <span className="mk-muted">{t("sell.noAnimal", { defaultValue: "Not linked" })}</span>}
              </dd>
            </dl>

            {!draft.animalId ? (
              <div className="mk-panel" style={{ marginTop: 18, maxWidth: 560 }}>
                <Icon name="alert" size={18} />
                <div className="mk-panel__body">
                  <b>{t("sell.noAnimalTitle", { defaultValue: "This listing isn't linked to an animal" })}</b>
                  <p>
                    {t("sell.noAnimalBody", {
                      defaultValue:
                        "It can still be published, but it can't carry weights, feeding, lineage or a lab certificate — so it will always show an empty record.",
                    })}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mk-row" style={{ marginTop: 24, gap: 10 }}>
              <Button variant="outline" onClick={() => setStep("publish")}>
                {t("common.back", { defaultValue: "Back" })}
              </Button>
              <Button variant="outline" busy={saving} onClick={() => publish("draft")}>
                {t("sell.saveDraft", { defaultValue: "Save as draft" })}
              </Button>
              <Button variant="ink" busy={saving} disabled={!canPublish} onClick={() => publish("available")}>
                {t("sell.publish", { defaultValue: "Publish listing" })}
              </Button>
            </div>
          </div>

          <aside>
            <h2 className="mk-label" style={{ margin: "0 0 10px" }}>
              {t("sell.preview", { defaultValue: "Buyer's view" })}
            </h2>
            <ListingCard listing={previewListing(draft, selected)} as="button" onSelect={() => {}} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
