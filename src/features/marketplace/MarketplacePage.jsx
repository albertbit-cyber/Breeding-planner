import React, { useEffect, useMemo, useState } from "react";
import {
  createListingInquiry,
  fetchMarketplaceProfiles,
  fetchMyBreederProfile,
  fetchMyInquiries,
  fetchMyListings,
  saveMyBreederProfile,
  saveMyListings,
} from "../../shared/apiClient";

const AUTH_STORAGE_KEY = "breedingPlannerAuthSession";

const readRole = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return String(parsed?.role || parsed?.profile?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

const readProfile = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.profile && typeof parsed.profile === "object" ? parsed.profile : {};
  } catch {
    return {};
  }
};

const emptyProfile = {
  breederName: "",
  logoUrl: "",
  location: "",
  bio: "",
  websiteUrl: "",
  instagramHandle: "",
  facebookHandle: "",
  telegramHandle: "",
  publicContactEmail: "",
  publicContactPhone: "",
  contactPreference: "email",
  isPublic: false,
};

const createEmptyListing = () => ({
  id: `listing-${Date.now()}`,
  animalAppId: "",
  title: "",
  status: "draft",
  price: "",
  currency: "EUR",
  description: "",
  imageUrl: "",
  sex: "",
  hatchDate: "",
  genetics: "",
});

const normalizeProfile = (profile) => ({
  ...emptyProfile,
  ...(profile && typeof profile === "object" ? profile : {}),
});

const firstText = (...values) => values.map((value) => String(value || "").trim()).find(Boolean) || "";

function ProfileCard({ profile, onInquire }) {
  const displayName = firstText(profile?.breederName, profile?.user?.fullName, "Breeder");
  const contact = firstText(profile?.publicContactEmail, profile?.publicContactPhone);

  return (
    <article className="marketplace-card">
      <div className="marketplace-card__header">
        {profile?.logoUrl ? (
          <img src={profile.logoUrl} alt="" className="marketplace-card__logo" />
        ) : (
          <div className="marketplace-card__initial">{displayName.slice(0, 1).toUpperCase()}</div>
        )}
        <div>
          <h2>{displayName}</h2>
          {profile?.location ? <p>{profile.location}</p> : null}
        </div>
      </div>
      {profile?.bio ? <p className="marketplace-card__bio">{profile.bio}</p> : null}
      <div className="marketplace-card__links">
        {profile?.websiteUrl ? <a href={profile.websiteUrl} target="_blank" rel="noreferrer">Website</a> : null}
        {profile?.instagramHandle ? <span>Instagram: {profile.instagramHandle}</span> : null}
        {profile?.facebookHandle ? <span>Facebook: {profile.facebookHandle}</span> : null}
        {profile?.telegramHandle ? <span>Telegram: {profile.telegramHandle}</span> : null}
      </div>
      {contact ? (
        <div className="marketplace-card__contact">
          <span>Preferred contact: {profile?.contactPreference || "email"}</span>
          <strong>{contact}</strong>
        </div>
      ) : null}
      {Array.isArray(profile?.listings) && profile.listings.length ? (
        <div className="marketplace-listings">
          {profile.listings.map((listing) => (
            <ListingCard key={listing.id || listing.rowId} listing={listing} compact onInquire={onInquire} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function formatPrice(listing) {
  if (typeof listing?.priceCents === "number") {
    return `${(listing.priceCents / 100).toFixed(2)} ${listing.currency || "EUR"}`;
  }
  const raw = String(listing?.price || "").trim();
  return raw ? `${raw} ${listing?.currency || "EUR"}` : "";
}

function ListingCard({ listing, compact = false, onInquire }) {
  const title = firstText(listing?.title, listing?.name, "Available animal");
  const details = [
    firstText(listing?.sex),
    firstText(listing?.hatchDate),
    firstText(listing?.genetics),
  ].filter(Boolean).join(" | ");
  const price = formatPrice(listing);

  return (
    <article className={`marketplace-listing-card ${compact ? "is-compact" : ""}`}>
      {listing?.imageUrl ? <img src={listing.imageUrl} alt="" /> : null}
      <div>
        <h3>{title}</h3>
        {details ? <p>{details}</p> : null}
        {listing?.description ? <p className="marketplace-listing-card__description">{listing.description}</p> : null}
        {price ? <strong>{price}</strong> : null}
        {onInquire ? (
          <button type="button" className="marketplace-inquire" onClick={() => onInquire(listing)}>
            Ask about this animal
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function MarketplacePage() {
  const [profiles, setProfiles] = useState([]);
  const [myProfile, setMyProfile] = useState(emptyProfile);
  const [myListings, setMyListings] = useState([]);
  const [myInquiries, setMyInquiries] = useState([]);
  const [inquiryDraft, setInquiryDraft] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const role = useMemo(readRole, []);
  const authProfile = useMemo(readProfile, []);
  const canEditProfile = role === "breeder" || role === "admin";
  const canSendInquiry = role === "buyer" || role === "breeder" || role === "admin";

  const loadProfiles = async () => {
    setStatus("loading");
    setMessage("");
    try {
      const [marketplace, own] = await Promise.all([
        fetchMarketplaceProfiles(),
        canEditProfile ? fetchMyBreederProfile() : Promise.resolve({ profile: null }),
      ]);
      const listings = canEditProfile ? await fetchMyListings() : { listings: [] };
      const inquiries = await fetchMyInquiries();
      setProfiles(Array.isArray(marketplace?.profiles) ? marketplace.profiles : []);
      setMyProfile(normalizeProfile(own?.profile));
      setMyListings(Array.isArray(listings?.listings) ? listings.listings : []);
      setMyInquiries(Array.isArray(inquiries?.inquiries) ? inquiries.inquiries : []);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to load marketplace profiles.");
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const updateProfileField = (field, value) => {
    setMyProfile((prev) => ({ ...prev, [field]: value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const result = await saveMyBreederProfile(myProfile);
      setMyProfile(normalizeProfile(result?.profile));
      setMessage("Profile saved.");
      await loadProfiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile save failed.");
    }
  };

  const addListing = () => {
    setMyListings((prev) => [createEmptyListing(), ...prev]);
  };

  const updateListing = (index, field, value) => {
    setMyListings((prev) => prev.map((listing, currentIndex) => (
      currentIndex === index ? { ...listing, [field]: value } : listing
    )));
  };

  const removeListing = (index) => {
    setMyListings((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const saveListings = async () => {
    setMessage("");
    try {
      const result = await saveMyListings(myListings);
      setMyListings(Array.isArray(result?.listings) ? result.listings : []);
      setMessage("Listings saved.");
      await loadProfiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Listing save failed.");
    }
  };

  const openInquiry = (listing) => {
    setInquiryDraft({
      listingId: listing.rowId || listing.id,
      listingTitle: listing.title || listing.name || "Available animal",
      buyerName: authProfile.displayName || authProfile.fullName || "",
      buyerEmail: authProfile.email || "",
      message: "",
    });
  };

  const submitInquiry = async (event) => {
    event.preventDefault();
    if (!inquiryDraft) return;
    setMessage("");
    try {
      await createListingInquiry(inquiryDraft);
      setInquiryDraft(null);
      setMessage("Inquiry sent.");
      const inquiries = await fetchMyInquiries();
      setMyInquiries(Array.isArray(inquiries?.inquiries) ? inquiries.inquiries : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inquiry failed.");
    }
  };

  return (
    <main className="marketplace-shell">
      <header className="marketplace-header">
        <button type="button" className="marketplace-back" onClick={() => { window.location.hash = "/"; }}>
          Back to planner
        </button>
        <div>
          <h1>Breeder Marketplace</h1>
          <p>Browse public breeder profiles and contact keepers directly.</p>
        </div>
      </header>

      {canEditProfile ? (
        <>
        <section className="marketplace-editor">
          <h2>My public breeder profile</h2>
          <form onSubmit={saveProfile}>
            <label>
              <span>Breeder name</span>
              <input value={myProfile.breederName} onChange={(event) => updateProfileField("breederName", event.target.value)} />
            </label>
            <label>
              <span>Logo URL</span>
              <input value={myProfile.logoUrl} onChange={(event) => updateProfileField("logoUrl", event.target.value)} />
            </label>
            <label>
              <span>Location</span>
              <input value={myProfile.location} onChange={(event) => updateProfileField("location", event.target.value)} />
            </label>
            <label className="marketplace-editor__wide">
              <span>Bio</span>
              <textarea rows={4} value={myProfile.bio} onChange={(event) => updateProfileField("bio", event.target.value)} />
            </label>
            <label>
              <span>Website</span>
              <input value={myProfile.websiteUrl} onChange={(event) => updateProfileField("websiteUrl", event.target.value)} />
            </label>
            <label>
              <span>Instagram</span>
              <input value={myProfile.instagramHandle} onChange={(event) => updateProfileField("instagramHandle", event.target.value)} />
            </label>
            <label>
              <span>Public email</span>
              <input value={myProfile.publicContactEmail} onChange={(event) => updateProfileField("publicContactEmail", event.target.value)} />
            </label>
            <label>
              <span>Public phone</span>
              <input value={myProfile.publicContactPhone} onChange={(event) => updateProfileField("publicContactPhone", event.target.value)} />
            </label>
            <label>
              <span>Contact preference</span>
              <select value={myProfile.contactPreference} onChange={(event) => updateProfileField("contactPreference", event.target.value)}>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="social">Social</option>
              </select>
            </label>
            <label className="marketplace-editor__toggle">
              <input type="checkbox" checked={Boolean(myProfile.isPublic)} onChange={(event) => updateProfileField("isPublic", event.target.checked)} />
              <span>Publish profile in marketplace</span>
            </label>
            <div className="marketplace-editor__actions">
              <button type="submit">Save profile</button>
            </div>
          </form>
        </section>
        <section className="marketplace-editor">
          <div className="marketplace-editor__header">
            <h2>Sales listings</h2>
            <button type="button" onClick={addListing}>Add listing</button>
          </div>
          <div className="marketplace-listing-editor">
            {!myListings.length ? <p>No listings yet.</p> : null}
            {myListings.map((listing, index) => (
              <div className="marketplace-listing-editor__row" key={listing.id || index}>
                <label>
                  <span>Title</span>
                  <input value={listing.title || ""} onChange={(event) => updateListing(index, "title", event.target.value)} />
                </label>
                <label>
                  <span>Status</span>
                  <select value={listing.status || "draft"} onChange={(event) => updateListing(index, "status", event.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="available">Available</option>
                    <option value="reserved">Reserved</option>
                    <option value="sold">Sold</option>
                  </select>
                </label>
                <label>
                  <span>Price</span>
                  <input value={listing.price || ""} onChange={(event) => updateListing(index, "price", event.target.value)} />
                </label>
                <label>
                  <span>Currency</span>
                  <input value={listing.currency || "EUR"} onChange={(event) => updateListing(index, "currency", event.target.value)} />
                </label>
                <label>
                  <span>Image URL</span>
                  <input value={listing.imageUrl || ""} onChange={(event) => updateListing(index, "imageUrl", event.target.value)} />
                </label>
                <label>
                  <span>Sex</span>
                  <input value={listing.sex || ""} onChange={(event) => updateListing(index, "sex", event.target.value)} />
                </label>
                <label>
                  <span>Hatch date</span>
                  <input value={listing.hatchDate || ""} onChange={(event) => updateListing(index, "hatchDate", event.target.value)} />
                </label>
                <label>
                  <span>Genetics</span>
                  <input value={listing.genetics || ""} onChange={(event) => updateListing(index, "genetics", event.target.value)} />
                </label>
                <label className="marketplace-editor__wide">
                  <span>Description</span>
                  <textarea rows={3} value={listing.description || ""} onChange={(event) => updateListing(index, "description", event.target.value)} />
                </label>
                <button type="button" className="marketplace-remove" onClick={() => removeListing(index)}>Remove</button>
              </div>
            ))}
          </div>
          <div className="marketplace-editor__actions">
            <button type="button" onClick={saveListings}>Save listings</button>
          </div>
        </section>
        </>
      ) : null}

      {message ? <p className="marketplace-message">{message}</p> : null}
      {inquiryDraft ? (
        <section className="marketplace-editor marketplace-inquiry-form">
          <h2>Ask about {inquiryDraft.listingTitle}</h2>
          <form onSubmit={submitInquiry}>
            <label>
              <span>Your name</span>
              <input value={inquiryDraft.buyerName} onChange={(event) => setInquiryDraft((prev) => ({ ...prev, buyerName: event.target.value }))} />
            </label>
            <label>
              <span>Your email</span>
              <input type="email" value={inquiryDraft.buyerEmail} onChange={(event) => setInquiryDraft((prev) => ({ ...prev, buyerEmail: event.target.value }))} />
            </label>
            <label className="marketplace-editor__wide">
              <span>Message</span>
              <textarea rows={4} value={inquiryDraft.message} onChange={(event) => setInquiryDraft((prev) => ({ ...prev, message: event.target.value }))} />
            </label>
            <div className="marketplace-editor__actions">
              <button type="submit">Send inquiry</button>
              <button type="button" className="marketplace-secondary" onClick={() => setInquiryDraft(null)}>Cancel</button>
            </div>
          </form>
        </section>
      ) : null}
      {myInquiries.length ? (
        <section className="marketplace-editor">
          <h2>{canEditProfile ? "Listing inquiries" : "My inquiries"}</h2>
          <div className="marketplace-inquiry-list">
            {myInquiries.map((inquiry) => (
              <article key={inquiry.id} className="marketplace-inquiry-item">
                <strong>{inquiry.listingTitle || inquiry.listingId}</strong>
                <span>{inquiry.buyerName} · {inquiry.buyerEmail}</span>
                <p>{inquiry.message}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {status === "error" ? (
        <button type="button" className="marketplace-retry" onClick={loadProfiles}>Retry</button>
      ) : null}

      <section className="marketplace-list">
        {status === "loading" ? <p>Loading breeder profiles...</p> : null}
        {status === "ready" && !profiles.length ? <p>No public breeder profiles yet.</p> : null}
        {profiles.map((profile) => (
          <ProfileCard
            key={profile.id || profile.userId}
            profile={profile}
            onInquire={canSendInquiry ? openInquiry : null}
          />
        ))}
      </section>
    </main>
  );
}
