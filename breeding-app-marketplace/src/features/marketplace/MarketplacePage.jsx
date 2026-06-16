import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  createMarketplaceConversation,
  createMarketplaceListing,
  createMarketplaceSale,
  favoriteMarketplaceListing,
  fetchAdminMarketplace,
  fetchMarketplaceCatalog,
  fetchMarketplaceListingDetail,
  fetchMarketplaceStore,
  fetchSellerDashboard,
  saveMarketplaceStore,
  updateMarketplaceListing,
  updateMarketplaceListingWorkflow,
} from "../../shared/apiClient";

const AUTH_STORAGE_KEY = "breedingPlannerBreederAuthSession";

const readRole = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return String(parsed?.role || parsed?.profile?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

const initialFilters = {
  search: "",
  species: "Ball python",
  sex: "",
  availability: "",
  minPrice: "",
  maxPrice: "",
  country: "",
  shippingAvailable: "",
  pickupAvailable: "",
  sort: "newest",
  includeGenes: "",
  excludeGenes: "",
  minWeight: "",
  verifiedOnly: false,
};

const emptyListing = () => ({
  title: "",
  species: "Ball python",
  category: "",
  genetics: "",
  sex: "",
  birthDate: "",
  weight: "",
  price: "",
  currency: "EUR",
  status: "draft",
  availability: "available",
  country: "",
  city: "",
  shippingAvailable: true,
  pickupAvailable: true,
  description: "",
  feedingNotes: "",
  temperamentNotes: "",
  paymentTerms: "",
  reservationDeposit: "",
  imageUrl: "",
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

const FIELD_LABELS = {
  title: "Listing title",
  category: "Category",
  genetics: "Genetics",
  sex: "Sex",
  birthDate: "Date of birth",
  weight: "Weight (g)",
  price: "Price",
  currency: "Currency",
  availability: "Availability",
  country: "Country",
  city: "City / region",
  imageUrl: "Photo URL",
};

const PRIVACY_LABELS = {
  showAnimalId: "Share animal ID",
  showParents: "Share parent animals",
  showFeedingHistory: "Share feeding history",
  showWeightHistory: "Share weight history",
  showGeneticTestResult: "Share genetic test results",
  showDocuments: "Share documents",
  showBreederNotes: "Share breeder notes",
  showLineage: "Share lineage",
};

const ANALYTICS_LABELS = {
  totalViews: "Total views",
  totalFavorites: "Favorites",
  totalListings: "Active listings",
  totalMessages: "Messages",
  totalSales: "Sales",
  totalRevenue: "Revenue",
  conversionRate: "Conversion rate",
  responseRate: "Response rate",
};

const CATEGORIES = ["", "Hatchling", "Juvenile", "Sub-adult", "Adult", "Proven breeder", "Holdback"];

const STORE_TABS = ["Available", "Reserved", "Sold", "About", "Reviews", "Terms"];

const EDITOR_SECTIONS = [
  { title: "Basic information", fields: ["title", "category"] },
  { title: "Animal details", fields: ["sex", "birthDate", "weight"] },
  { title: "Genetics", fields: ["genetics"] },
  { title: "Pricing & availability", fields: ["price", "currency", "availability"] },
  { title: "Location & logistics", fields: ["country", "city"], checkboxes: ["shippingAvailable", "pickupAvailable"] },
  { title: "Photos", fields: ["imageUrl"] },
];

const money = (listing) =>
  listing?.price !== null && listing?.price !== undefined && listing?.price !== ""
    ? `${listing.currency || "EUR"} ${Number(listing.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : "Inquire";

const firstImage = (listing) => listing?.imageUrl || listing?.images?.[0]?.imageUrl || "";

const isNewListing = (listing) => {
  if (!listing?.publishedAt) return false;
  return (Date.now() - new Date(listing.publishedAt)) / 86400000 <= 7;
};

const availabilityVariant = (avail) => {
  const map = { available: "available", reserved: "reserved", sold: "sold", featured: "featured", hidden: "hidden", draft: "draft" };
  return map[String(avail || "available").toLowerCase()] || "available";
};

const availabilityLabel = (avail) => {
  const map = { available: "Available", reserved: "Reserved", sold: "Sold", featured: "Featured", hidden: "Hidden", draft: "Draft" };
  return map[String(avail || "available").toLowerCase()] || "Available";
};

const tagsFor = (listing) => [
  listing.shippingAvailable ? "Shipping" : "",
  listing.pickupAvailable ? "Local pickup" : "",
  /tested/i.test(String(listing.genetics || "")) ? "Genetic tested" : "",
].filter(Boolean);

const starRating = (avg, count) => {
  const n = Math.round(Number(avg) || 0);
  return `${"★".repeat(n)}${"☆".repeat(Math.max(0, 5 - n))} (${count || 0})`;
};

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onDismiss }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);
  if (!message) return null;
  return (
    <div className="market-toast" role="status">
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss">✕</button>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onClear }) {
  return (
    <div className="market-empty-state">
      <div className="market-empty-icon">🦎</div>
      <h3>No listings found</h3>
      <p>Try adjusting your filters or clearing the search to see more animals.</p>
      <button type="button" onClick={onClear}>Clear all filters</button>
    </div>
  );
}

// ─── Availability badge ───────────────────────────────────────────────────────

function AvailabilityBadge({ availability }) {
  const variant = availabilityVariant(availability);
  return <span className={`market-avail-badge market-avail-${variant}`}>{availabilityLabel(availability)}</span>;
}

// ─── Home / hero ──────────────────────────────────────────────────────────────

function MarketplaceHome({ filters, onFilter, onBrowse, onSeller }) {
  const projectCards = [
    { label: "Clown projects", gene: "Clown" },
    { label: "Pied projects", gene: "Pied" },
    { label: "Axanthic projects", gene: "Axanthic" },
    { label: "Desert Ghost projects", gene: "Desert Ghost" },
  ];
  const morphs = ["Clown", "Pied", "Axanthic", "Desert Ghost", "Lavender", "Ultramel", "Banana", "Pastel", "Spider", "Enchi"];
  return (
    <section className="marketplace-home">
      <div className="marketplace-hero">
        <div>
          <p className="marketplace-kicker">Marketplace</p>
          <h1>Find your next project animal</h1>
          <p>Browse verified breeder listings, genetics, lineage, feeding records, and health information.</p>
          <div className="marketplace-hero-search">
            <input
              value={filters.search}
              placeholder="Search by gene, morph, breeder, location..."
              onChange={(e) => onFilter("search", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onBrowse()}
            />
            <button type="button" onClick={onBrowse}>Browse animals</button>
            <button type="button" className="market-ghost-btn" onClick={onSeller}>Sell an animal</button>
          </div>
        </div>
      </div>
      <div className="marketplace-category-grid">
        {projectCards.map(({ label, gene }) => (
          <button key={label} type="button" onClick={() => { onFilter("search", gene); onBrowse(); }}>
            <span>{label}</span>
            <strong>Explore {label.toLowerCase()} →</strong>
          </button>
        ))}
      </div>
      <div className="marketplace-chip-row">
        {morphs.map((morph) => (
          <button key={morph} type="button" onClick={() => { onFilter("search", morph); onBrowse(); }}>{morph}</button>
        ))}
      </div>
    </section>
  );
}

// ─── Filters sidebar ──────────────────────────────────────────────────────────

function FiltersSidebar({ filters, onFilter, onClear, resultCount }) {
  const activeCount = [
    filters.sex, filters.availability, filters.minPrice, filters.maxPrice,
    filters.country, filters.includeGenes, filters.excludeGenes, filters.minWeight,
    filters.shippingAvailable, filters.pickupAvailable, filters.verifiedOnly ? "1" : "",
  ].filter(Boolean).length;

  return (
    <aside className="marketplace-filter-panel">
      <div className="market-filter-header">
        <h2>
          Filters{activeCount > 0 ? <span className="market-filter-count">{activeCount}</span> : null}
        </h2>
        {activeCount > 0 && (
          <button type="button" className="market-clear-link" onClick={onClear}>Clear all</button>
        )}
      </div>
      <p className="market-filter-results">{resultCount} results</p>
      <label>
        Sex
        <select value={filters.sex} onChange={(e) => onFilter("sex", e.target.value)}>
          <option value="">Any</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="unknown">Unknown</option>
        </select>
      </label>
      <label>
        Category
        <select value={filters.category || ""} onChange={(e) => onFilter("category", e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c || "Any"}</option>)}
        </select>
      </label>
      <label>
        Availability
        <select value={filters.availability} onChange={(e) => onFilter("availability", e.target.value)}>
          <option value="">Any</option>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
        </select>
      </label>
      <div className="marketplace-filter-row">
        <label>Min price<input type="number" value={filters.minPrice} onChange={(e) => onFilter("minPrice", e.target.value)} placeholder="€0" /></label>
        <label>Max price<input type="number" value={filters.maxPrice} onChange={(e) => onFilter("maxPrice", e.target.value)} placeholder="Any" /></label>
      </div>
      <label>Location<input value={filters.country} onChange={(e) => onFilter("country", e.target.value)} placeholder="Country" /></label>
      <label>Include genes<input value={filters.includeGenes} onChange={(e) => onFilter("includeGenes", e.target.value)} placeholder="e.g. Clown, Pied" /></label>
      <label>Exclude genes<input value={filters.excludeGenes} onChange={(e) => onFilter("excludeGenes", e.target.value)} placeholder="e.g. Spider" /></label>
      <label>Min weight (g)<input type="number" value={filters.minWeight} onChange={(e) => onFilter("minWeight", e.target.value)} placeholder="0" /></label>
      <label className="market-checkbox-label">
        <input type="checkbox" checked={Boolean(filters.shippingAvailable)} onChange={(e) => onFilter("shippingAvailable", e.target.checked ? "true" : "")} />
        Shipping available
      </label>
      <label className="market-checkbox-label">
        <input type="checkbox" checked={Boolean(filters.pickupAvailable)} onChange={(e) => onFilter("pickupAvailable", e.target.checked ? "true" : "")} />
        Local pickup
      </label>
      <label className="market-checkbox-label">
        <input type="checkbox" checked={Boolean(filters.verifiedOnly)} onChange={(e) => onFilter("verifiedOnly", e.target.checked)} />
        Verified breeders only
      </label>
      <label>
        Sort by
        <select value={filters.sort} onChange={(e) => onFilter("sort", e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="price_low">Price: low to high</option>
          <option value="price_high">Price: high to low</option>
          <option value="updated">Recently updated</option>
        </select>
      </label>
    </aside>
  );
}

// ─── Listing card ─────────────────────────────────────────────────────────────

function ListingCard({ listing, onSelect, onFavorite, onStore }) {
  return (
    <article
      className="market-animal-card"
      onClick={() => onSelect(listing)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(listing)}
    >
      <div className="market-animal-photo">
        {firstImage(listing)
          ? <img src={firstImage(listing)} alt={listing.title || "Animal photo"} />
          : <span className="market-no-photo">No photo</span>}
        <button
          type="button"
          className="market-heart-btn"
          onClick={(e) => { e.stopPropagation(); onFavorite(listing); }}
          aria-label={listing.isFavorited ? "Remove from favorites" : "Add to favorites"}
        >
          {listing.isFavorited ? "♥" : "♡"}
        </button>
        {isNewListing(listing) && <span className="market-new-badge">New</span>}
      </div>
      <div className="market-animal-body">
        <div className="market-badge-row">
          <AvailabilityBadge availability={listing.availability || listing.status} />
          {tagsFor(listing).map((tag) => <span key={tag} className="market-tag">{tag}</span>)}
        </div>
        <h3>{listing.title || "Untitled listing"}</h3>
        <p className="market-genetics">{listing.genetics || <em className="market-muted">Genetics on inquiry</em>}</p>
        <dl>
          <dt>Sex</dt><dd>{listing.sex || "—"}</dd>
          <dt>Weight</dt><dd>{listing.weight ? `${listing.weight} g` : "—"}</dd>
          <dt>Location</dt><dd>{[listing.city, listing.country].filter(Boolean).join(", ") || listing.seller?.location || "—"}</dd>
        </dl>
        <div className="market-card-footer">
          <strong className="market-price">{money(listing)}</strong>
          <button
            type="button"
            className="market-seller-link"
            onClick={(e) => { e.stopPropagation(); onStore(listing.sellerUserId); }}
          >
            {listing.seller?.name || "View store"}
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Contact / offer form ─────────────────────────────────────────────────────

function ContactForm({ listing, mode, onClose, onSend }) {
  const [text, setText] = useState(
    mode === "offer"
      ? `I would like to make an offer for ${listing.title}.`
      : `Hi, is ${listing.title} still available? I would love to know more.`
  );
  const [offerPrice, setOfferPrice] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    const fullText = mode === "offer" && offerPrice
      ? `${text}\n\nMy offer: ${listing.currency || "EUR"} ${offerPrice}`
      : text;
    await onSend(listing, mode, fullText);
    setSending(false);
    onClose();
  };

  return (
    <div className="market-contact-overlay" onClick={onClose}>
      <div className="market-contact-panel" onClick={(e) => e.stopPropagation()}>
        <div className="market-section-header">
          <h3>{mode === "offer" ? "Make an offer" : "Contact seller"}</h3>
          <button type="button" className="market-icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="market-muted">Listing: <strong>{listing.title}</strong></p>
        {mode === "offer" && (
          <label className="market-contact-label">
            Your offer ({listing.currency || "EUR"})
            <input type="number" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder="Enter amount" />
          </label>
        )}
        <label className="market-contact-label">
          Message
          <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="market-action-row">
          <button type="button" onClick={handleSend} disabled={sending || !text.trim()}>
            {sending ? "Sending..." : "Send message"}
          </button>
          <button type="button" className="market-ghost-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Listing detail overlay ───────────────────────────────────────────────────

function ListingDetail({ listing, onClose, onContact, onFavorite, onStore }) {
  if (!listing) return null;
  const seller = listing.seller || {};
  const avail = availabilityVariant(listing.availability || listing.status);

  return (
    <section className="market-detail-overlay" onClick={onClose}>
      <article className="market-detail-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="market-close market-icon-btn" onClick={onClose} aria-label="Close">✕</button>
        <div className="market-gallery">
          {firstImage(listing)
            ? <img src={firstImage(listing)} alt={listing.title || ""} />
            : <div className="market-gallery-placeholder">No photo available</div>}
          {(listing.images || []).length > 1 && (
            <div className="market-thumbnail-row">
              {listing.images.map((img) => <img key={img.id || img.imageUrl} src={img.imageUrl} alt="" />)}
            </div>
          )}
        </div>
        <div className="market-detail-content">
          <div className="market-badge-row">
            <AvailabilityBadge availability={listing.availability || listing.status} />
            {isNewListing(listing) && <span className="market-new-badge market-new-badge--inline">New</span>}
            {tagsFor(listing).map((tag) => <span key={tag} className="market-tag">{tag}</span>)}
          </div>
          <h2>{listing.title}</h2>
          <strong className="market-price market-price-lg">{money(listing)}</strong>
          <dl className="market-detail-list">
            <dt>Species</dt><dd>{listing.species}</dd>
            <dt>Genetics</dt><dd>{listing.genetics || "—"}</dd>
            <dt>Sex</dt><dd>{listing.sex || "—"}</dd>
            <dt>Birth / year</dt><dd>{listing.birthDate ? new Date(listing.birthDate).toLocaleDateString() : listing.year || "—"}</dd>
            <dt>Weight</dt><dd>{listing.weight ? `${listing.weight} g` : "—"}</dd>
            <dt>Location</dt><dd>{[listing.city, listing.country].filter(Boolean).join(", ") || "—"}</dd>
            <dt>Shipping</dt><dd>{listing.shippingAvailable ? "Available" : "Not offered"}</dd>
            <dt>Local pickup</dt><dd>{listing.pickupAvailable ? "Available" : "Not offered"}</dd>
          </dl>

          {listing.genetics && (
            <section className="market-detail-section">
              <h3>Genetics</h3>
              <div className="market-gene-chips">
                {listing.genetics.split(/[,/]/).map((g) => g.trim()).filter(Boolean).map((gene) => (
                  <span key={gene} className="market-gene-chip">{gene}</span>
                ))}
              </div>
            </section>
          )}

          {(listing.description || listing.temperamentNotes) && (
            <section className="market-detail-section">
              <h3>Seller description</h3>
              {listing.description && <p>{listing.description}</p>}
              {listing.temperamentNotes && <p><strong>Temperament:</strong> {listing.temperamentNotes}</p>}
            </section>
          )}

          {listing.feedingNotes && (
            <section className="market-detail-section">
              <h3>Breeding Planner data</h3>
              <p>{listing.feedingNotes}</p>
            </section>
          )}

          <section className="market-seller-card">
            <div className="market-seller-card-header">
              <div className="market-seller-avatar">{String(seller.name || "B").slice(0, 1)}</div>
              <div>
                <strong>
                  {seller.name || "Breeder"}
                  {seller.isVerified && <span className="market-verified-badge">✓ Verified</span>}
                </strong>
                {seller.location && <p className="market-muted">{seller.location}</p>}
                <div className="market-seller-meta">
                  {Number(seller.ratingAverage) > 0 && <span>{starRating(seller.ratingAverage, seller.reviewCount)}</span>}
                  {seller.responseTime && <span>Replies: {seller.responseTime}</span>}
                </div>
              </div>
            </div>
          </section>

          <div className="market-detail-actions">
            {avail !== "sold" && (
              <>
                <button type="button" onClick={() => onContact(listing, "message")}>Contact seller</button>
                <button type="button" className="market-ghost-btn" onClick={() => onContact(listing, "offer")}>Make offer</button>
              </>
            )}
            <button type="button" className="market-ghost-btn" onClick={() => onFavorite(listing)}>
              {listing.isFavorited ? "♥ Saved" : "♡ Save"}
            </button>
            <button type="button" className="market-ghost-btn" onClick={() => onStore(listing.sellerUserId)}>Open store</button>
            <button type="button" className="market-danger-link">Report listing</button>
          </div>
        </div>
      </article>
    </section>
  );
}

// ─── Store panel ──────────────────────────────────────────────────────────────

function StorePanel({ store, onClose }) {
  const [activeTab, setActiveTab] = useState("Available");
  if (!store) return null;

  const listings = store.listings || [];
  const byStatus = {
    Available: listings.filter((l) => availabilityVariant(l.availability || l.status) === "available"),
    Reserved: listings.filter((l) => availabilityVariant(l.availability || l.status) === "reserved"),
    Sold: listings.filter((l) => availabilityVariant(l.availability || l.status) === "sold"),
  };

  return (
    <section className="market-detail-overlay" onClick={onClose}>
      <article className="market-store-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="market-close market-icon-btn" onClick={onClose} aria-label="Close">✕</button>
        <div className="market-store-banner">{store.bannerUrl && <img src={store.bannerUrl} alt="" />}</div>
        <div className="market-store-header">
          {store.logoUrl
            ? <img src={store.logoUrl} alt="" className="market-store-logo" />
            : <div className="market-store-initial">{String(store.storeName || "S").slice(0, 1)}</div>}
          <div>
            <h2>{store.storeName || "Breeder Store"}</h2>
            <p className="market-muted">{[store.city, store.country].filter(Boolean).join(", ")}</p>
            <div className="market-seller-meta">
              {store.isVerified && <span className="market-verified-badge">✓ Verified</span>}
              {Number(store.ratingAverage) > 0 && <span>{starRating(store.ratingAverage, store.reviewCount)}</span>}
              {store.responseTime && <span>Replies: {store.responseTime}</span>}
            </div>
          </div>
        </div>
        <div className="market-store-tabs">
          {STORE_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`market-tab-btn${activeTab === tab ? " market-tab-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}{byStatus[tab] !== undefined && byStatus[tab].length > 0 ? ` (${byStatus[tab].length})` : ""}
            </button>
          ))}
        </div>
        <div className="market-tab-content">
          {["Available", "Reserved", "Sold"].includes(activeTab) && (
            byStatus[activeTab].length > 0
              ? <div className="market-grid">{byStatus[activeTab].map((l) => <ListingCard key={l.id} listing={l} onSelect={() => {}} onFavorite={() => {}} onStore={() => {}} />)}</div>
              : <p className="market-muted market-tab-empty">No {activeTab.toLowerCase()} listings.</p>
          )}
          {activeTab === "About" && <p>{store.about || "This breeder has not added an about section yet."}</p>}
          {activeTab === "Reviews" && (
            <p className="market-muted">
              {Number(store.reviewCount) === 0 ? "No reviews yet." : starRating(store.ratingAverage, store.reviewCount)}
            </p>
          )}
          {activeTab === "Terms" && (
            <p>{store.terms || store.shippingPolicy || store.paymentPolicy || "Terms and policies have not been published yet."}</p>
          )}
        </div>
      </article>
    </section>
  );
}

// ─── Seller dashboard ─────────────────────────────────────────────────────────

function SellerDashboard({ dashboard, onRefresh, onEditListing, onMarkStatus }) {
  const [filter, setFilter] = useState("all");
  if (!dashboard) return null;
  const analytics = dashboard.analytics || {};
  const listings = dashboard.listings || [];
  const filtered = filter === "all" ? listings : listings.filter((l) => (l.status || l.availability) === filter);

  return (
    <section className="market-seller-dashboard">
      <div className="market-section-header">
        <div>
          <h2>Seller Dashboard</h2>
          <p>Manage listings, reservations, sold animals, and store settings.</p>
        </div>
        <button type="button" onClick={onRefresh}>Refresh</button>
      </div>
      {Object.keys(analytics).length > 0 && (
        <div className="market-stats">
          {Object.entries(analytics).map(([key, value]) => (
            <div key={key} className="market-stat-card">
              <span>{ANALYTICS_LABELS[key] || key}</span>
              <strong>{String(value)}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="market-dash-filters">
        {["all", "available", "draft", "reserved", "sold"].map((f) => (
          <button
            key={f}
            type="button"
            className={`market-tab-btn${filter === f ? " market-tab-active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {` (${f === "all" ? listings.length : listings.filter((l) => (l.status || l.availability) === f).length})`}
          </button>
        ))}
      </div>
      <div className="market-dash-list">
        {filtered.length === 0 && <p className="market-muted">No listings in this category.</p>}
        {filtered.map((listing) => {
          const status = listing.status || listing.availability || "draft";
          return (
            <article key={listing.id} className="market-dash-row">
              {firstImage(listing)
                ? <img src={firstImage(listing)} alt="" className="market-dash-thumb" />
                : <div className="market-dash-thumb market-dash-thumb-empty" />}
              <div className="market-dash-info">
                <strong>{listing.title}</strong>
                <div className="market-badge-row">
                  <AvailabilityBadge availability={status} />
                  <span className="market-muted">{listing.viewsCount || 0} views · {listing.favoritesCount || 0} saved</span>
                </div>
              </div>
              <div className="market-dash-actions">
                {status === "draft" && <button type="button" onClick={() => onMarkStatus(listing, "available")}>Publish</button>}
                {status === "available" && <button type="button" onClick={() => onMarkStatus(listing, "reserved")}>Reserve</button>}
                {(status === "available" || status === "reserved") && (
                  <button type="button" className="market-ghost-btn" onClick={() => onMarkStatus(listing, "sold")}>Mark sold</button>
                )}
                <button type="button" className="market-ghost-btn" onClick={() => onEditListing(listing)}>Edit</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ─── Listing editor ───────────────────────────────────────────────────────────

function ListingEditor({ draft, setDraft, onSave, onCancel }) {
  const update = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const updatePrivacy = (key, value) =>
    setDraft((prev) => ({ ...prev, publicDataSettings: { ...(prev.publicDataSettings || {}), [key]: value } }));

  const generateDescription = () => {
    const text = [
      `${draft.sex || "This animal"} is a Ball python with ${draft.genetics || "quality genetics"}.`,
      draft.weight ? `Current weight is approximately ${draft.weight} g.` : "",
      draft.feedingNotes ? `Feeding notes: ${draft.feedingNotes}.` : "Feeding details available on request.",
      "A strong option for keepers looking for a documented project animal.",
    ].filter(Boolean).join(" ");
    update("description", text);
  };

  return (
    <section className="market-editor">
      <div className="market-section-header">
        <h2>{draft.id ? "Edit listing" : "Create listing"}</h2>
        <button type="button" className="market-icon-btn" onClick={onCancel} aria-label="Cancel">✕</button>
      </div>
      {EDITOR_SECTIONS.map(({ title, fields, checkboxes }) => (
        <div key={title} className="market-editor-section">
          <h3 className="market-editor-section-title">{title}</h3>
          <div className="market-editor-grid">
            {fields.map((field) => (
              <label key={field}>
                {FIELD_LABELS[field] || field}
                <input value={draft[field] || ""} onChange={(e) => update(field, e.target.value)} />
              </label>
            ))}
            {(checkboxes || []).map((field) => (
              <label key={field} className="market-checkbox-label">
                <input type="checkbox" checked={Boolean(draft[field])} onChange={(e) => update(field, e.target.checked)} />
                {FIELD_LABELS[field] || field}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="market-editor-section">
        <h3 className="market-editor-section-title">Description & notes</h3>
        <div className="market-editor-grid">
          <label className="market-editor-wide">
            Seller description
            <textarea rows={4} value={draft.description || ""} onChange={(e) => update("description", e.target.value)} />
          </label>
          <label>
            Feeding notes
            <textarea rows={3} value={draft.feedingNotes || ""} onChange={(e) => update("feedingNotes", e.target.value)} />
          </label>
          <label>
            Temperament notes
            <textarea rows={3} value={draft.temperamentNotes || ""} onChange={(e) => update("temperamentNotes", e.target.value)} />
          </label>
        </div>
      </div>
      <div className="market-editor-section">
        <h3 className="market-editor-section-title">Shared data</h3>
        <p className="market-muted">Choose what buyers can see on your listing.</p>
        <div className="market-privacy-grid">
          {Object.keys(emptyListing().publicDataSettings).map((key) => (
            <label key={key} className="market-checkbox-label">
              <input type="checkbox" checked={Boolean(draft.publicDataSettings?.[key])} onChange={(e) => updatePrivacy(key, e.target.checked)} />
              {PRIVACY_LABELS[key] || key}
            </label>
          ))}
        </div>
      </div>
      <div className="market-action-row">
        <button type="button" onClick={generateDescription}>Generate description</button>
        <button type="button" onClick={() => onSave({ ...draft, status: "available" })}>Save &amp; publish</button>
        <button type="button" className="market-ghost-btn" onClick={() => onSave({ ...draft, status: "draft" })}>Save as draft</button>
      </div>
    </section>
  );
}

// ─── Store settings form (replaces window.prompt) ────────────────────────────

function StoreSettingsForm({ store, onSave, onCancel }) {
  const [name, setName] = useState(store?.storeName || "");
  const [about, setAbout] = useState(store?.about || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({ storeName: name, about });
    setSaving(false);
    onCancel();
  };

  return (
    <section className="market-editor">
      <div className="market-section-header">
        <h2>Store settings</h2>
        <button type="button" className="market-icon-btn" onClick={onCancel} aria-label="Cancel">✕</button>
      </div>
      <div className="market-editor-grid">
        <label>
          Store name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Breeder Store" />
        </label>
        <label className="market-editor-wide">
          About
          <textarea rows={4} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Tell buyers about your breeding program..." />
        </label>
      </div>
      <div className="market-action-row">
        <button type="button" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? "Saving..." : "Save store profile"}
        </button>
        <button type="button" className="market-ghost-btn" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

// ─── Root page ────────────────────────────────────────────────────────────────

export default function MarketplacePage({ portalMode = "marketplace" }) {
  const [filters, setFilters] = useState(initialFilters);
  const [listings, setListings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [store, setStore] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [editorDraft, setEditorDraft] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [toast, setToast] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [contactContext, setContactContext] = useState(null);
  const [showStoreSettings, setShowStoreSettings] = useState(false);
  const debounceRef = useRef(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const role = useMemo(readRole, []);
  const isSeller = role === "breeder" || role === "admin";
  const isAdmin = role === "admin" || portalMode === "admin";

  const doLoad = async (currentFilters) => {
    try {
      const [catalog, sellerData, admin] = await Promise.all([
        fetchMarketplaceCatalog(currentFilters),
        isSeller ? fetchSellerDashboard().catch(() => null) : Promise.resolve(null),
        isAdmin ? fetchAdminMarketplace().catch(() => null) : Promise.resolve(null),
      ]);
      setListings(Array.isArray(catalog.listings) ? catalog.listings : []);
      setDashboard(sellerData);
      setAdminData(admin);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Marketplace failed to load.");
    }
  };

  useEffect(() => {
    doLoad(initialFilters);
  }, []);

  // Auto-reload on filter change with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doLoad(filtersRef.current), 600);
    return () => clearTimeout(debounceRef.current);
  }, [filters]);

  const filteredListings = useMemo(() => listings.filter((listing) => {
    const include = String(filters.includeGenes || "").toLowerCase().split(",").map((g) => g.trim()).filter(Boolean);
    const exclude = String(filters.excludeGenes || "").toLowerCase().split(",").map((g) => g.trim()).filter(Boolean);
    const genetics = String(listing.genetics || "").toLowerCase();
    if (include.length && !include.every((gene) => genetics.includes(gene))) return false;
    if (exclude.length && exclude.some((gene) => genetics.includes(gene))) return false;
    if (filters.minWeight && Number(listing.weight || 0) < Number(filters.minWeight)) return false;
    if (filters.verifiedOnly && !listing.seller?.isVerified) return false;
    return true;
  }), [filters, listings]);

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const clearFilters = () => setFilters(initialFilters);

  const selectListing = async (listing) => {
    try {
      const detail = await fetchMarketplaceListingDetail(listing.id);
      setSelected(detail.listing || listing);
    } catch {
      setSelected(listing);
    }
  };

  const openStore = async (userId) => {
    if (!userId) return;
    try {
      const data = await fetchMarketplaceStore(userId);
      setStore(data.store);
    } catch {
      setToast("Could not load store.");
    }
  };

  const favorite = async (listing) => {
    try {
      await favoriteMarketplaceListing(listing.id);
      await doLoad(filtersRef.current);
    } catch {
      setToast("Could not update favorites.");
    }
  };

  const sendContact = async (listing, mode, text) => {
    try {
      await createMarketplaceConversation({ listingId: listing.id, messageText: text });
      setToast(mode === "offer" ? "Offer sent to seller." : "Message sent to seller.");
    } catch {
      setToast("Could not send message.");
    }
  };

  const saveListing = async (draft) => {
    try {
      const payload = { ...draft, species: "Ball python" };
      const result = payload.id
        ? await updateMarketplaceListing(payload.id, payload)
        : await createMarketplaceListing(payload);
      setEditorDraft(null);
      setSelected(result.listing);
      await doLoad(filtersRef.current);
      setToast("Listing saved.");
    } catch {
      setToast("Could not save listing.");
    }
  };

  const handleSaveStore = async (data) => {
    try {
      await saveMarketplaceStore(data);
      await doLoad(filtersRef.current);
      setToast("Store profile updated.");
      setShowStoreSettings(false);
    } catch {
      setToast("Could not save store profile.");
    }
  };

  const markStatus = async (listing, status) => {
    try {
      await updateMarketplaceListingWorkflow(listing.id, { status, availability: status });
      await doLoad(filtersRef.current);
      setToast(`Listing marked as ${status}.`);
    } catch {
      setToast("Could not update listing status.");
    }
  };

  const createSaleRecord = async (listing) => {
    try {
      await createMarketplaceSale({ listingId: listing.id, saleStatus: "reserved", paymentStatus: "pending", salePrice: listing.price, currency: listing.currency });
      await markStatus(listing, "reserved");
    } catch {
      setToast("Could not create sale record.");
    }
  };

  const activeFilterCount = [
    filters.sex, filters.availability, filters.minPrice, filters.maxPrice,
    filters.country, filters.includeGenes, filters.excludeGenes, filters.minWeight,
    filters.shippingAvailable, filters.pickupAvailable, filters.verifiedOnly ? "1" : "",
  ].filter(Boolean).length;

  return (
    <main className="marketplace-v2">
      <Toast message={toast} onDismiss={() => setToast("")} />

      <header className="marketplace-topbar">
        <button type="button" onClick={() => { window.location.hash = "/"; }}>← Home</button>
        <button type="button" onClick={() => { window.location.hash = "/pricing"; }}>Pricing</button>
        {isSeller && (
          <button type="button" onClick={() => setEditorDraft(emptyListing())}>+ Create listing</button>
        )}
      </header>

      <MarketplaceHome
        filters={filters}
        onFilter={updateFilter}
        onBrowse={() => doLoad(filtersRef.current)}
        onSeller={() => isSeller
          ? setEditorDraft(emptyListing())
          : setToast("Sign in as a breeder to list animals.")}
      />

      {editorDraft && (
        <ListingEditor
          draft={editorDraft}
          setDraft={setEditorDraft}
          onSave={saveListing}
          onCancel={() => setEditorDraft(null)}
        />
      )}

      <div className="market-layout">
        <div className="market-filter-toggle-row">
          <button
            type="button"
            className="market-filter-toggle"
            onClick={() => setShowFilters((v) => !v)}
          >
            {showFilters ? "Hide filters" : `Filters${activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}`}
          </button>
          <span className="market-muted">{filteredListings.length} results</span>
        </div>
        <div className={`market-layout-inner${showFilters ? " market-filters-open" : ""}`}>
          <FiltersSidebar
            filters={filters}
            onFilter={updateFilter}
            onClear={clearFilters}
            resultCount={filteredListings.length}
          />
          <section>
            <div className="market-section-header">
              <div>
                <h2>Animal listings</h2>
                <p>{filteredListings.length} results — featured, new, and verified breeder animals.</p>
              </div>
            </div>
            {filteredListings.length === 0
              ? <EmptyState onClear={clearFilters} />
              : (
                <div className="market-grid">
                  {filteredListings.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      onSelect={selectListing}
                      onFavorite={favorite}
                      onStore={openStore}
                    />
                  ))}
                </div>
              )}
          </section>
        </div>
      </div>

      {isSeller && (
        <>
          <SellerDashboard
            dashboard={dashboard}
            onRefresh={() => doLoad(filtersRef.current)}
            onEditListing={(listing) => setEditorDraft({ ...emptyListing(), ...listing, imageUrl: firstImage(listing) })}
            onMarkStatus={markStatus}
          />
          {showStoreSettings ? (
            <StoreSettingsForm
              store={dashboard?.store}
              onSave={handleSaveStore}
              onCancel={() => setShowStoreSettings(false)}
            />
          ) : (
            <section className="market-seller-dashboard">
              <div className="market-section-header">
                <div>
                  <h2>Store settings</h2>
                  <p>Create your public store profile, policies, and contact information.</p>
                </div>
                <button type="button" onClick={() => setShowStoreSettings(true)}>
                  {dashboard?.store?.storeName ? "Edit store profile" : "Create store profile"}
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {isAdmin && adminData && (
        <section className="market-seller-dashboard">
          <h2>Admin Marketplace Panel</h2>
          <div className="market-dash-list">
            {(adminData.listings || []).map((listing) => (
              <article key={listing.id} className="market-dash-row">
                <div className="market-dash-thumb market-dash-thumb-empty" />
                <div className="market-dash-info">
                  <strong>{listing.title}</strong>
                  <span className="market-muted">{listing.seller?.name} · <AvailabilityBadge availability={listing.status} /></span>
                </div>
                <div className="market-dash-actions">
                  <button type="button" onClick={() => markStatus(listing, "available")}>Approve</button>
                  <button type="button" className="market-ghost-btn" onClick={() => markStatus(listing, "hidden")}>Hide</button>
                  <button type="button" className="market-ghost-btn" onClick={() => markStatus(listing, "featured")}>Feature</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {selected && (
        <ListingDetail
          listing={selected}
          onClose={() => setSelected(null)}
          onContact={(listing, mode) => setContactContext({ listing, mode })}
          onFavorite={favorite}
          onStore={openStore}
        />
      )}

      {contactContext && (
        <ContactForm
          listing={contactContext.listing}
          mode={contactContext.mode}
          onClose={() => setContactContext(null)}
          onSend={sendContact}
        />
      )}

      {store && <StorePanel store={store} onClose={() => setStore(null)} />}

      {selected && isSeller && selected.sellerUserId === dashboard?.store?.userId && (
        <div className="market-action-row market-owner-actions">
          <button type="button" onClick={() => createSaleRecord(selected)}>Reserve from conversation</button>
          <button type="button" className="market-ghost-btn" onClick={() => markStatus(selected, "sold")}>Mark sold</button>
        </div>
      )}
    </main>
  );
}
