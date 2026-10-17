import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import PaginationControls from "../components/PaginationControls.jsx";
import Spinner from "../components/Spinner.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import useAdminActor from "../hooks/useAdminActor";
import { useToast } from "../hooks/useToast.jsx";
import {
  fetchAdminMarketplaceListings,
  fetchAdminMarketplaceStores,
  fetchMarketplaceStats,
  moderateMarketplaceListing,
  refreshMarketplaceListingPhotos,
  resolveApiMediaUrl,
  verifyMarketplaceStore,
} from "../../shared/apiClient";

/**
 * The marketplace console: how much is on the marketplace and what state it is in, the ads table
 * with moderation, and the stores. It replaces a copy of the public marketplace that had a short
 * moderation list attached (which checked the breeder app's session, so it never showed here).
 */

const STATUS_FILTERS = [
  ["", "All live ads"],
  ["available", "Available"],
  ["reserved", "Reserved"],
  ["sold", "Sold"],
  ["draft", "Draft"],
  ["hidden", "Hidden"],
  ["featured", "Featured"],
  ["no_photos", "Without photos"],
  ["reported", "Open reports"],
  ["archived", "Archived"],
];

const SORTS = [
  ["newest", "Newest"],
  ["updated", "Recently updated"],
  ["views", "Most viewed"],
  ["favorites", "Most saved"],
  ["price_high", "Price, high first"],
  ["price_low", "Price, low first"],
  ["oldest", "Oldest"],
];

const formatNumber = (value) => Number(value || 0).toLocaleString();

const formatPrice = (price, currency) => {
  if (price === null || price === undefined) return "-";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "EUR", maximumFractionDigits: 0 }).format(Number(price));
  } catch {
    return `${price} ${currency || ""}`.trim();
  }
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
};

function Stat({ label, value, hint, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className="admin-stat-card" onClick={onClick}>
      <span className="admin-stat-label">{label}</span>
      <span className="admin-stat-value">{formatNumber(value)}</span>
      {hint && <span className="admin-stat-link">{hint}</span>}
    </Tag>
  );
}

function BarList({ rows, labelKey, valueKey, empty }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey] || 0)));
  if (!rows.length) return <p className="admin-muted">{empty}</p>;
  return (
    <ul className="admin-barlist">
      {rows.map((row) => (
        <li key={row[labelKey]}>
          <span className="admin-barlist__label" title={row[labelKey]}>{row[labelKey]}</span>
          <span className="admin-barlist__track" aria-hidden="true">
            <span className="admin-barlist__fill" style={{ width: `${(Number(row[valueKey] || 0) / max) * 100}%` }} />
          </span>
          <span className="admin-barlist__value">{formatNumber(row[valueKey])}</span>
        </li>
      ))}
    </ul>
  );
}

function Overview({ stats, onFilter }) {
  const listings = stats.listings || {};
  const engagement = stats.engagement || {};
  const sellers = stats.sellers || {};
  const byStatus = Object.entries(listings.byStatus || {}).map(([status, count]) => ({ status, count }));
  return (
    <>
      <div className="admin-card-grid admin-mkt-stats">
        <Stat label="Ads in the catalogue" value={listings.listed} hint="Available or reserved" onClick={() => onFilter("")} />
        <Stat label="All ads (not archived)" value={listings.total} />
        <Stat label="New this week" value={listings.newThisWeek} hint={`${formatNumber(listings.newThisMonth)} in 30 days`} />
        <Stat label="Featured" value={listings.featured} hint="View →" onClick={() => onFilter("featured")} />
        <Stat label="Listed without photos" value={listings.withoutPhotos} hint="View →" onClick={() => onFilter("no_photos")} />
        <Stat label="Open reports" value={stats.openReports} hint="View →" onClick={() => onFilter("reported")} />
        <Stat label="Views" value={engagement.views} hint={`${formatNumber(engagement.favorites)} saves`} />
        <Stat label="Buyer conversations" value={engagement.conversations} hint={`${formatNumber(engagement.conversationsThisWeek)} this week`} />
        <Stat label="Sellers with ads" value={sellers.withListings} hint={`${formatNumber(sellers.stores)} stores, ${formatNumber(sellers.verifiedStores)} verified`} />
        <Stat label="Completed sales" value={(stats.sales || {}).completed} />
      </div>
      <div className="admin-mkt-breakdown">
        <div className="admin-panel">
          <h3>Ads by status</h3>
          <BarList rows={byStatus} labelKey="status" valueKey="count" empty="No ads yet." />
        </div>
        <div className="admin-panel">
          <h3>Listed by species</h3>
          <BarList rows={stats.bySpecies || []} labelKey="species" valueKey="count" empty="Nothing listed yet." />
        </div>
        <div className="admin-panel">
          <h3>Top sellers</h3>
          <BarList rows={stats.topSellers || []} labelKey="name" valueKey="listed" empty="No sellers yet." />
        </div>
      </div>
    </>
  );
}

function ListingActions({ listing, canWrite, onModerate, onPhotos }) {
  if (!canWrite) return <span className="admin-muted">Read only</span>;
  const archived = Boolean(listing.archivedAt);
  return (
    <div className="admin-row-actions">
      {archived ? (
        <button type="button" onClick={() => onModerate(listing, { status: "draft" }, "Restore")}>Restore</button>
      ) : (
        <>
          {listing.status !== "available" && (
            <button type="button" onClick={() => onModerate(listing, { status: "available" }, "Approve")}>Approve</button>
          )}
          {listing.status !== "hidden" && (
            <button type="button" onClick={() => onModerate(listing, { status: "hidden" }, "Hide")}>Hide</button>
          )}
          <button type="button" onClick={() => onModerate(listing, { isFeatured: !listing.isFeatured }, listing.isFeatured ? "Unfeature" : "Feature")}>
            {listing.isFeatured ? "Unfeature" : "Feature"}
          </button>
          {listing.animalId && <button type="button" onClick={() => onPhotos(listing)}>Photos</button>}
          <button type="button" className="admin-btn-danger" onClick={() => onModerate(listing, { status: "archived" }, "Archive")}>Archive</button>
        </>
      )}
    </div>
  );
}

function AdsTable({ canWrite, preset }) {
  const toast = useToast();
  const [filters, setFilters] = useState({ q: "", status: "", sort: "newest", page: 1, pageSize: 25 });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null);

  const load = (next = filters) => {
    setLoading(true); setError("");
    fetchAdminMarketplaceListings(next)
      .then((data) => { setRows(data.listings || []); setTotal(Number(data.total || 0)); })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load ads."))
      .finally(() => setLoading(false));
  };

  // First load, and again whenever an overview card picks a filter (preset.n changes each click).
  useEffect(() => {
    const next = preset ? { ...filters, status: preset.status, page: 1 } : filters;
    setFilters(next);
    load(next);
  }, [preset?.n]); // eslint-disable-line

  const set = (key, value, reload = false) => {
    const next = { ...filters, [key]: value, page: 1 };
    setFilters(next);
    if (reload) load(next);
  };

  const run = async (listing, change, label) => {
    setConfirm(null);
    try {
      await moderateMarketplaceListing(listing.id, change);
      toast(`${label}: ${listing.title}`);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : `${label} failed.`, "error");
    }
  };

  const onModerate = (listing, change, label) => {
    if (change.status === "archived" || change.status === "hidden") setConfirm({ listing, change, label });
    else run(listing, change, label);
  };

  const onPhotos = async (listing) => {
    try {
      const result = await refreshMarketplaceListingPhotos(listing.id);
      const reason = Object.keys(result.skipped || {})[0];
      toast(result.withPhotos ? `Photos taken from the animal: ${listing.title}` : `No photos taken: ${reason || "nothing stored"}`, result.withPhotos ? "success" : "error");
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Photo refresh failed.", "error");
    }
  };

  return (
    <>
      {confirm && (
        <ConfirmModal
          title={`${confirm.label} "${confirm.listing.title}"?`}
          message={confirm.change.status === "archived"
            ? "The ad leaves the marketplace and the seller's live ads. It can be restored as a draft."
            : "The ad stops showing to buyers, photos included. Approve brings it back."}
          confirmLabel={confirm.label}
          danger
          onConfirm={() => run(confirm.listing, confirm.change, confirm.label)}
          onCancel={() => setConfirm(null)}
        />
      )}
      <div className="admin-filters">
        <input
          value={filters.q}
          onChange={(e) => set("q", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(filters)}
          placeholder="Search title, genetics, animal ID, seller…"
          aria-label="Search ads"
        />
        <select value={filters.status} onChange={(e) => set("status", e.target.value, true)} aria-label="Filter by status">
          {STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={filters.sort} onChange={(e) => set("sort", e.target.value, true)} aria-label="Sort">
          {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" onClick={() => load(filters)}>Apply</button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-table-wrap">
        <table className="admin-table admin-mkt-table">
          <thead>
            <tr>
              <th>Ad</th>
              <th>Seller</th>
              <th>Price</th>
              <th>Status</th>
              <th>Photos</th>
              <th>Views / saves</th>
              <th>Reports</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((listing) => (
              <tr key={listing.id}>
                <td>
                  <div className="admin-mkt-ad">
                    {listing.imageUrl
                      ? <img src={resolveApiMediaUrl(listing.imageUrl)} alt="" className="admin-mkt-thumb" loading="lazy" />
                      : <span className="admin-mkt-thumb admin-mkt-thumb--empty" aria-label="No photo">—</span>}
                    <div className="admin-mkt-ad__text">
                      <strong>{listing.title}{listing.isFeatured && <span className="admin-mkt-featured" title="Featured"> ★</span>}</strong>
                      <span className="admin-muted">{[listing.species, listing.genetics].filter(Boolean).join(" · ") || "-"}</span>
                      {listing.animalId && <span className="admin-muted mono">{listing.animalId}</span>}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="admin-mkt-ad__text">
                    <span>{listing.seller?.name || "-"}</span>
                    <span className="admin-muted">{listing.sellerEmail}</span>
                  </div>
                </td>
                <td>{formatPrice(listing.price, listing.currency)}</td>
                <td><StatusBadge value={listing.archivedAt ? "archived" : listing.status} /></td>
                <td>{listing.photoCount}</td>
                <td>{formatNumber(listing.viewsCount)} / {formatNumber(listing.favoritesCount)}</td>
                <td>{listing.openReports ? <StatusBadge value={`${listing.openReports} open`} /> : "-"}</td>
                <td>{formatDate(listing.createdAt)}</td>
                <td><ListingActions listing={listing} canWrite={canWrite} onModerate={onModerate} onPhotos={onPhotos} /></td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 24 }}>
                  {loading ? <Spinner /> : <span className="admin-muted">No ads match.</span>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="admin-table-footer">
        <span className="admin-muted">{formatNumber(total)} ads</span>
        <PaginationControls
          page={filters.page}
          pageSize={filters.pageSize}
          total={total}
          onPage={(page) => { const next = { ...filters, page }; setFilters(next); load(next); }}
        />
      </div>
    </>
  );
}

function StoresTable({ canWrite }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true); setError("");
    fetchAdminMarketplaceStores()
      .then((data) => setStores(data.stores || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load stores."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggle = async (store) => {
    try {
      await verifyMarketplaceStore(store.userId, !store.isVerified);
      toast(`${store.storeName} ${store.isVerified ? "is no longer verified" : "is verified"}.`);
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed.", "error");
    }
  };

  return (
    <>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Store</th>
              <th>Owner</th>
              <th>Location</th>
              <th>Live ads</th>
              <th>Rating</th>
              <th>Verified</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.id}>
                <td><strong>{store.storeName}</strong></td>
                <td>{store.email || store.user?.fullName || "-"}</td>
                <td>{[store.city, store.country].filter(Boolean).join(", ") || "-"}</td>
                <td>{formatNumber(store.listed)}</td>
                <td>{store.reviewCount ? `${Number(store.ratingAverage).toFixed(1)} (${store.reviewCount})` : "-"}</td>
                <td><StatusBadge value={store.isVerified ? "verified" : "unverified"} /></td>
                <td>
                  <div className="admin-row-actions">
                    <button type="button" onClick={() => navigate(`/admin/users/${store.userId}`)}>Owner</button>
                    {canWrite && <button type="button" onClick={() => toggle(store)}>{store.isVerified ? "Unverify" : "Verify"}</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!stores.length && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 24 }}>
                  {loading ? <Spinner /> : <span className="admin-muted">No stores yet.</span>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function MarketplaceAdminPage() {
  const toast = useToast();
  const { canWrite } = useAdminActor();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("ads");
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = () => {
    setError("");
    fetchMarketplaceStats()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load marketplace numbers."));
  };

  useEffect(() => { loadStats(); }, []);

  const [preset, setPreset] = useState(null);
  const filterAds = (status) => {
    setTab("ads");
    setPreset((prev) => ({ status, n: (prev?.n || 0) + 1 }));
  };

  const refreshAllPhotos = async () => {
    setRefreshing(true);
    try {
      const result = await refreshMarketplaceListingPhotos();
      const skipped = Object.entries(result.skipped || {}).map(([reason, count]) => `${count} ${reason}`).join(", ");
      toast(`Checked ${result.checked} ads: ${result.updated} updated, ${result.withPhotos} with photos.${skipped ? ` Skipped: ${skipped}.` : ""}`);
      loadStats();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Photo refresh failed.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AdminLayout breadcrumbs={[{ label: "Marketplace" }]}>
      <div className="admin-section">
        <div className="admin-section-header">
          <div>
            <h2>Marketplace</h2>
            <p>What is listed, how buyers respond, and moderation for ads and stores.</p>
          </div>
          <div className="admin-row-actions">
            <button type="button" onClick={loadStats}>Refresh</button>
            {canWrite && (
              <button type="button" onClick={refreshAllPhotos} disabled={refreshing} title="Take every ad's photos from its animal's stored photos">
                {refreshing ? "Taking photos…" : "Take photos from animals"}
              </button>
            )}
          </div>
        </div>
        {error && <div className="admin-error">{error}</div>}
        {!stats && !error ? <Spinner label="Loading marketplace…" /> : stats && <Overview stats={stats} onFilter={filterAds} />}
      </div>

      <div className="admin-section">
        <div className="admin-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "ads"} className={`admin-tab${tab === "ads" ? " is-active" : ""}`} onClick={() => setTab("ads")}>Ads</button>
          <button type="button" role="tab" aria-selected={tab === "stores"} className={`admin-tab${tab === "stores" ? " is-active" : ""}`} onClick={() => setTab("stores")}>Stores</button>
        </div>
        {tab === "ads" ? <AdsTable canWrite={canWrite} preset={preset} /> : <StoresTable canWrite={canWrite} />}
      </div>
    </AdminLayout>
  );
}
