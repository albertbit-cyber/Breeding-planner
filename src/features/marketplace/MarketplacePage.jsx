import React, { useEffect, useMemo, useState } from "react";
import {
  fetchMarketplaceProfiles,
  fetchMyBreederProfile,
  saveMyBreederProfile,
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

const normalizeProfile = (profile) => ({
  ...emptyProfile,
  ...(profile && typeof profile === "object" ? profile : {}),
});

const firstText = (...values) => values.map((value) => String(value || "").trim()).find(Boolean) || "";

function ProfileCard({ profile }) {
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
    </article>
  );
}

export default function MarketplacePage() {
  const [profiles, setProfiles] = useState([]);
  const [myProfile, setMyProfile] = useState(emptyProfile);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const role = useMemo(readRole, []);
  const canEditProfile = role === "breeder" || role === "admin";

  const loadProfiles = async () => {
    setStatus("loading");
    setMessage("");
    try {
      const [marketplace, own] = await Promise.all([
        fetchMarketplaceProfiles(),
        canEditProfile ? fetchMyBreederProfile() : Promise.resolve({ profile: null }),
      ]);
      setProfiles(Array.isArray(marketplace?.profiles) ? marketplace.profiles : []);
      setMyProfile(normalizeProfile(own?.profile));
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
      ) : null}

      {message ? <p className="marketplace-message">{message}</p> : null}
      {status === "error" ? (
        <button type="button" className="marketplace-retry" onClick={loadProfiles}>Retry</button>
      ) : null}

      <section className="marketplace-list">
        {status === "loading" ? <p>Loading breeder profiles...</p> : null}
        {status === "ready" && !profiles.length ? <p>No public breeder profiles yet.</p> : null}
        {profiles.map((profile) => (
          <ProfileCard key={profile.id || profile.userId} profile={profile} />
        ))}
      </section>
    </main>
  );
}
