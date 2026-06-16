import React, { useEffect, useMemo, useState } from "react";
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

const money = (listing) => listing?.price !== null && listing?.price !== undefined && listing?.price !== ""
  ? `${listing.currency || "EUR"} ${Number(listing.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  : "Inquire";

const firstImage = (listing) => listing?.imageUrl || listing?.images?.[0]?.imageUrl || "";

const tagsFor = (listing) => [
  listing.availability || listing.status || "available",
  listing.publishedAt ? "New" : "",
  listing.shippingAvailable ? "Shipping available" : "",
  listing.pickupAvailable ? "Local pickup" : "",
  /tested/i.test(String(listing.genetics || "")) ? "Genetic tested" : "",
].filter(Boolean).slice(0, 5);

function MarketplaceHome({ filters, onFilter, onBrowse, onSeller }) {
  const projectCards = ["Clown projects", "Pied projects", "Axanthic projects", "Desert Ghost projects"];
  const morphs = ["Clown", "Pied", "Axanthic", "Desert Ghost", "Lavender", "Ultramel"];
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
              placeholder="Search genetics, breeder, morph, location"
              onChange={(event) => onFilter("search", event.target.value)}
            />
            <button type="button" onClick={onBrowse}>Browse animals</button>
            <button type="button" onClick={onSeller}>Sell an animal</button>
          </div>
        </div>
      </div>
      <div className="marketplace-category-grid">
        {projectCards.map((project) => (
          <button key={project} type="button" onClick={() => onFilter("search", project.replace(" projects", ""))}>
            <span>{project}</span>
            <strong>Explore ball pythons</strong>
          </button>
        ))}
      </div>
      <div className="marketplace-chip-row">
        {morphs.map((morph) => (
          <button key={morph} type="button" onClick={() => onFilter("search", morph)}>{morph}</button>
        ))}
      </div>
    </section>
  );
}

function FiltersSidebar({ filters, onFilter, onClear }) {
  return (
    <aside className="marketplace-filter-panel">
      <h2>Advanced filters</h2>
      <label>Species<input value="Ball python" readOnly /></label>
      <label>Category<input value={filters.category || ""} onChange={(e) => onFilter("category", e.target.value)} /></label>
      <label>Sex<select value={filters.sex} onChange={(e) => onFilter("sex", e.target.value)}>
        <option value="">Any</option><option value="male">Male</option><option value="female">Female</option><option value="unknown">Unknown</option>
      </select></label>
      <label>Availability<select value={filters.availability} onChange={(e) => onFilter("availability", e.target.value)}>
        <option value="">Any</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="sold">Sold</option>
      </select></label>
      <div className="marketplace-filter-row">
        <label>Min price<input type="number" value={filters.minPrice} onChange={(e) => onFilter("minPrice", e.target.value)} /></label>
        <label>Max price<input type="number" value={filters.maxPrice} onChange={(e) => onFilter("maxPrice", e.target.value)} /></label>
      </div>
      <label>Location<input value={filters.country} onChange={(e) => onFilter("country", e.target.value)} /></label>
      <label>Include genes<input value={filters.includeGenes} onChange={(e) => onFilter("includeGenes", e.target.value)} /></label>
      <label>Exclude genes<input value={filters.excludeGenes} onChange={(e) => onFilter("excludeGenes", e.target.value)} /></label>
      <label>Minimum weight<input type="number" value={filters.minWeight} onChange={(e) => onFilter("minWeight", e.target.value)} /></label>
      <label><input type="checkbox" checked={Boolean(filters.shippingAvailable)} onChange={(e) => onFilter("shippingAvailable", e.target.checked ? "true" : "")} /> Shipping available</label>
      <label><input type="checkbox" checked={Boolean(filters.pickupAvailable)} onChange={(e) => onFilter("pickupAvailable", e.target.checked ? "true" : "")} /> Local pickup</label>
      <label><input type="checkbox" checked={Boolean(filters.verifiedOnly)} onChange={(e) => onFilter("verifiedOnly", e.target.checked)} /> Verified breeders</label>
      <label>Sort<select value={filters.sort} onChange={(e) => onFilter("sort", e.target.value)}>
        <option value="newest">Newest</option><option value="price_low">Price low to high</option><option value="price_high">Price high to low</option><option value="updated">Recently updated</option>
      </select></label>
      <button type="button" onClick={onClear}>Clear filters</button>
    </aside>
  );
}

function ListingCard({ listing, onSelect, onFavorite, onStore }) {
  return (
    <article className="market-animal-card">
      <div className="market-animal-photo">
        {firstImage(listing) ? <img src={firstImage(listing)} alt="" /> : <span>No photo</span>}
        <button type="button" onClick={() => onFavorite(listing)}>Favorite</button>
      </div>
      <div className="market-animal-body">
        <div className="market-badge-row">{tagsFor(listing).map((tag) => <span key={tag}>{tag}</span>)}</div>
        <h3>{listing.title}</h3>
        <p>{listing.species} {listing.year ? `- ${listing.year}` : ""}</p>
        <strong>{listing.genetics || "Genetics on inquiry"}</strong>
        <dl>
          <dt>Sex</dt><dd>{listing.sex || "-"}</dd>
          <dt>Weight</dt><dd>{listing.weight ? `${listing.weight} g` : "-"}</dd>
          <dt>Location</dt><dd>{[listing.city, listing.country].filter(Boolean).join(", ") || listing.seller?.location || "-"}</dd>
        </dl>
        <div className="market-card-footer">
          <strong>{money(listing)}</strong>
          <button type="button" onClick={() => onStore(listing.sellerUserId)}>Seller: {listing.seller?.name || "Breeder"}</button>
        </div>
        <button type="button" onClick={() => onSelect(listing)}>Quick view</button>
      </div>
    </article>
  );
}

function ListingDetail({ listing, onClose, onContact, onFavorite, onStore }) {
  if (!listing) return null;
  return (
    <section className="market-detail-overlay">
      <article className="market-detail-panel">
        <button type="button" className="market-close" onClick={onClose}>Close</button>
        <div className="market-gallery">
          {firstImage(listing) ? <img src={firstImage(listing)} alt="" /> : <div>No photo</div>}
          <div>{(listing.images || []).map((image) => <img key={image.id || image.imageUrl} src={image.imageUrl} alt="" />)}</div>
        </div>
        <div className="market-detail-content">
          <div className="market-badge-row">{tagsFor(listing).map((tag) => <span key={tag}>{tag}</span>)}</div>
          <h2>{listing.title}</h2>
          <strong>{money(listing)}</strong>
          <dl className="market-detail-list">
            <dt>Species</dt><dd>{listing.species}</dd>
            <dt>Genetics</dt><dd>{listing.genetics || "-"}</dd>
            <dt>Sex</dt><dd>{listing.sex || "-"}</dd>
            <dt>Birth / year</dt><dd>{listing.birthDate ? new Date(listing.birthDate).toLocaleDateString() : listing.year || "-"}</dd>
            <dt>Weight</dt><dd>{listing.weight ? `${listing.weight} g` : "-"}</dd>
            <dt>Shipping</dt><dd>{listing.shippingAvailable ? "Available" : "Not offered"}</dd>
          </dl>
          <section>
            <h3>Genetics Panel</h3>
            <p>{listing.genetics || "Visual, het, possible het, parent genetics, and probability notes can be published by the breeder."}</p>
          </section>
          <section>
            <h3>Breeding Planner Data</h3>
            <p>{listing.feedingNotes || "Feeding history summary, weight chart summary, shed history, lineage, certificates, and notes appear here when the breeder makes them public."}</p>
          </section>
          <section>
            <h3>Seller Description</h3>
            <p>{listing.description || "No seller description yet."}</p>
            {listing.temperamentNotes ? <p>Temperament: {listing.temperamentNotes}</p> : null}
          </section>
          <section>
            <h3>Trust</h3>
            <p>{listing.seller?.isVerified ? "Verified breeder" : "Unverified breeder"} - rating {listing.seller?.ratingAverage || 0} from {listing.seller?.reviewCount || 0} reviews - {listing.seller?.responseTime}</p>
          </section>
          <div className="market-action-row">
            <button type="button" onClick={() => onContact(listing)}>Contact seller</button>
            <button type="button" onClick={() => onContact(listing, "offer")}>Make offer</button>
            <button type="button" onClick={() => onFavorite(listing)}>Add to favorites</button>
            <button type="button" onClick={() => onStore(listing.sellerUserId)}>Open store</button>
            <button type="button">Report listing</button>
          </div>
        </div>
      </article>
    </section>
  );
}

function StorePanel({ store, onClose }) {
  if (!store) return null;
  const tabs = ["Available", "Reserved", "Sold", "About", "Reviews", "Terms"];
  return (
    <section className="market-detail-overlay">
      <article className="market-store-panel">
        <button type="button" className="market-close" onClick={onClose}>Close</button>
        <div className="market-store-banner">{store.bannerUrl ? <img src={store.bannerUrl} alt="" /> : null}</div>
        <div className="market-store-header">
          {store.logoUrl ? <img src={store.logoUrl} alt="" /> : <div>{String(store.storeName || "S").slice(0, 1)}</div>}
          <div>
            <h2>{store.storeName}</h2>
            <p>{[store.city, store.country].filter(Boolean).join(", ")} - {store.isVerified ? "Verified breeder" : "Unverified"} - {store.ratingAverage || 0} rating</p>
          </div>
        </div>
        <div className="market-chip-row">{tabs.map((tab) => <span key={tab}>{tab}</span>)}</div>
        <p>{store.about || "This breeder has not added an about section yet."}</p>
        <div className="market-grid">
          {(store.listings || []).map((listing) => <ListingCard key={listing.id} listing={listing} onSelect={() => {}} onFavorite={() => {}} onStore={() => {}} />)}
        </div>
        <section><h3>Terms</h3><p>{store.terms || store.shippingPolicy || store.paymentPolicy || "Terms and policies have not been published yet."}</p></section>
      </article>
    </section>
  );
}

function SellerDashboard({ dashboard, onRefresh, onEditListing }) {
  if (!dashboard) return null;
  const analytics = dashboard.analytics || {};
  return (
    <section className="market-seller-dashboard">
      <div className="market-section-header">
        <div><h2>Seller Dashboard</h2><p>Manage active listings, drafts, reservations, sold animals, messages, offers, and store settings.</p></div>
        <button type="button" onClick={onRefresh}>Refresh</button>
      </div>
      <div className="market-stats">
        {Object.entries(analytics).map(([key, value]) => <div key={key}><span>{key}</span><strong>{String(value)}</strong></div>)}
      </div>
      <div className="market-grid">
        {(dashboard.listings || []).map((listing) => (
          <article key={listing.id} className="market-admin-row">
            <strong>{listing.title}</strong>
            <span>{listing.status} / {listing.availability}</span>
            <span>{listing.viewsCount || 0} views - {listing.favoritesCount || 0} favorites</span>
            <button type="button" onClick={() => onEditListing(listing)}>Edit listing</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ListingEditor({ draft, setDraft, onSave, onCancel }) {
  const update = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const updatePrivacy = (key, value) => setDraft((prev) => ({
    ...prev,
    publicDataSettings: { ...(prev.publicDataSettings || {}), [key]: value },
  }));
  const generateDescription = () => {
    const next = [
      `${draft.sex || "This animal"} is a Ball python with ${draft.genetics || "quality genetics"}.`,
      draft.weight ? `Current weight is approximately ${draft.weight} g.` : "",
      draft.feedingNotes ? `Feeding notes: ${draft.feedingNotes}.` : "Feeding details available on request.",
      "A strong option for keepers looking for a documented project animal.",
    ].filter(Boolean).join(" ");
    update("description", next);
  };
  return (
    <section className="market-editor">
      <div className="market-section-header"><h2>Listing Editor</h2><button type="button" onClick={onCancel}>Cancel</button></div>
      <div className="market-editor-grid">
        <label>species<input value="Ball python" readOnly /></label>
        {["title", "category", "genetics", "sex", "birthDate", "weight", "price", "currency", "availability", "country", "city", "imageUrl"].map((field) => (
          <label key={field}>{field}<input value={draft[field] || ""} onChange={(e) => update(field, e.target.value)} /></label>
        ))}
        <label>Description<textarea rows={4} value={draft.description || ""} onChange={(e) => update("description", e.target.value)} /></label>
        <label>Feeding notes<textarea rows={3} value={draft.feedingNotes || ""} onChange={(e) => update("feedingNotes", e.target.value)} /></label>
        <label>Temperament notes<textarea rows={3} value={draft.temperamentNotes || ""} onChange={(e) => update("temperamentNotes", e.target.value)} /></label>
        <label><input type="checkbox" checked={Boolean(draft.shippingAvailable)} onChange={(e) => update("shippingAvailable", e.target.checked)} /> Shipping available</label>
        <label><input type="checkbox" checked={Boolean(draft.pickupAvailable)} onChange={(e) => update("pickupAvailable", e.target.checked)} /> Pickup available</label>
      </div>
      <h3>Public data controls</h3>
      <div className="market-privacy-grid">
        {Object.keys(emptyListing().publicDataSettings).map((key) => (
          <label key={key}><input type="checkbox" checked={Boolean(draft.publicDataSettings?.[key])} onChange={(e) => updatePrivacy(key, e.target.checked)} /> {key}</label>
        ))}
      </div>
      <div className="market-action-row">
        <button type="button" onClick={generateDescription}>Generate sales description</button>
        <button type="button" onClick={() => onSave({ ...draft, status: draft.status === "draft" ? "available" : draft.status })}>Save listing</button>
      </div>
    </section>
  );
}

export default function MarketplacePage({ portalMode = "marketplace" }) {
  const [filters, setFilters] = useState(initialFilters);
  const [listings, setListings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [store, setStore] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [editorDraft, setEditorDraft] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [message, setMessage] = useState("");
  const role = useMemo(readRole, []);
  const isSeller = role === "breeder" || role === "admin";
  const isAdmin = role === "admin" || portalMode === "admin";

  const load = async () => {
    const [catalog, sellerData, admin] = await Promise.all([
      fetchMarketplaceCatalog(filters),
      isSeller ? fetchSellerDashboard().catch(() => null) : Promise.resolve(null),
      isAdmin ? fetchAdminMarketplace().catch(() => null) : Promise.resolve(null),
    ]);
    setListings(Array.isArray(catalog.listings) ? catalog.listings : []);
    setDashboard(sellerData);
    setAdminData(admin);
  };

  useEffect(() => { load().catch((err) => setMessage(err instanceof Error ? err.message : "Marketplace failed to load.")); }, []);

  const filteredListings = useMemo(() => listings.filter((listing) => {
    const include = String(filters.includeGenes || "").toLowerCase().split(",").map((item) => item.trim()).filter(Boolean);
    const exclude = String(filters.excludeGenes || "").toLowerCase().split(",").map((item) => item.trim()).filter(Boolean);
    const genetics = String(listing.genetics || "").toLowerCase();
    if (include.length && !include.every((gene) => genetics.includes(gene))) return false;
    if (exclude.length && exclude.some((gene) => genetics.includes(gene))) return false;
    if (filters.minWeight && Number(listing.weight || 0) < Number(filters.minWeight)) return false;
    if (filters.verifiedOnly && !listing.seller?.isVerified) return false;
    return true;
  }), [filters, listings]);

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const reloadWithFilters = () => load().catch((err) => setMessage(err instanceof Error ? err.message : "Filter refresh failed."));
  const clearFilters = () => setFilters(initialFilters);

  const selectListing = async (listing) => {
    const detail = await fetchMarketplaceListingDetail(listing.id);
    setSelected(detail.listing || listing);
  };

  const openStore = async (userId) => {
    if (!userId) return;
    const data = await fetchMarketplaceStore(userId);
    setStore(data.store);
  };

  const favorite = async (listing) => {
    await favoriteMarketplaceListing(listing.id);
    await load();
  };

  const contact = async (listing, mode = "message") => {
    const text = mode === "offer"
      ? `I would like to make an offer for ${listing.title}.`
      : `Is ${listing.title} still available?`;
    await createMarketplaceConversation({ listingId: listing.id, messageText: text });
    setMessage("Message sent to seller.");
  };

  const saveListing = async (draft) => {
    const nextDraft = { ...draft, species: "Ball python" };
    const result = nextDraft.id ? await updateMarketplaceListing(nextDraft.id, nextDraft) : await createMarketplaceListing(nextDraft);
    setEditorDraft(null);
    setSelected(result.listing);
    await load();
  };

  const saveStoreProfile = async () => {
    await saveMarketplaceStore({
      storeName: window.prompt("Store name", dashboard?.store?.storeName || "My Breeder Store") || "My Breeder Store",
      about: dashboard?.store?.about || "",
    });
    await load();
  };

  const markStatus = async (listing, status) => {
    await updateMarketplaceListingWorkflow(listing.id, { status, availability: status });
    await load();
  };

  const createSaleRecord = async (listing) => {
    await createMarketplaceSale({ listingId: listing.id, saleStatus: "reserved", paymentStatus: "pending", salePrice: listing.price, currency: listing.currency });
    await markStatus(listing, "reserved");
  };

  return (
    <main className="marketplace-v2">
      <header className="marketplace-topbar">
        <button type="button" onClick={() => { window.location.hash = "/"; }}>Start</button>
        <button type="button" onClick={() => { window.location.hash = "/pricing"; }}>Pricing</button>
        {isSeller ? <button type="button" onClick={() => setEditorDraft(emptyListing())}>Create marketplace listing</button> : null}
      </header>
      <MarketplaceHome filters={filters} onFilter={updateFilter} onBrowse={reloadWithFilters} onSeller={() => setEditorDraft(emptyListing())} />
      {message ? <div className="market-message">{message}</div> : null}
      {editorDraft ? <ListingEditor draft={editorDraft} setDraft={setEditorDraft} onSave={saveListing} onCancel={() => setEditorDraft(null)} /> : null}
      <div className="market-layout">
        <FiltersSidebar filters={filters} onFilter={updateFilter} onClear={clearFilters} />
        <section>
          <div className="market-section-header">
            <div><h2>Animal listings</h2><p>{filteredListings.length} results - featured animals, new listings, verified breeders, and recently added animals.</p></div>
            <button type="button" onClick={reloadWithFilters}>Apply filters</button>
          </div>
          <div className="market-grid">
            {filteredListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} onSelect={selectListing} onFavorite={favorite} onStore={openStore} />
            ))}
          </div>
        </section>
      </div>
      {isSeller ? (
        <>
          <SellerDashboard dashboard={dashboard} onRefresh={load} onEditListing={(listing) => setEditorDraft({ ...emptyListing(), ...listing, imageUrl: firstImage(listing) })} />
          <section className="market-seller-dashboard">
            <div className="market-section-header">
              <div><h2>Store settings</h2><p>Create public store profile, policies, and contact information.</p></div>
              <button type="button" onClick={saveStoreProfile}>Create / update store profile</button>
            </div>
          </section>
        </>
      ) : null}
      {isAdmin && adminData ? (
        <section className="market-seller-dashboard">
          <h2>Admin Marketplace Panel</h2>
          <div className="market-grid">
            {(adminData.listings || []).map((listing) => (
              <article key={listing.id} className="market-admin-row">
                <strong>{listing.title}</strong>
                <span>{listing.seller?.name} - {listing.status}</span>
                <button type="button" onClick={() => markStatus(listing, "available")}>Approve</button>
                <button type="button" onClick={() => markStatus(listing, "hidden")}>Hide</button>
                <button type="button" onClick={() => markStatus(listing, "featured")}>Feature</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {selected ? (
        <ListingDetail
          listing={selected}
          onClose={() => setSelected(null)}
          onContact={contact}
          onFavorite={favorite}
          onStore={openStore}
        />
      ) : null}
      {store ? <StorePanel store={store} onClose={() => setStore(null)} /> : null}
      {selected && isSeller && selected.sellerUserId === dashboard?.store?.userId ? (
        <div className="market-action-row">
          <button type="button" onClick={() => createSaleRecord(selected)}>Reserve from conversation</button>
          <button type="button" onClick={() => markStatus(selected, "sold")}>Mark sold</button>
        </div>
      ) : null}
    </main>
  );
}
