import { getSharedApiConfig } from "../shared/config/api";
import {
  acceptMarketplaceOffer,
  addMarketplaceMessage,
  blockMarketplaceUser,
  createMarketplaceConversation,
  createMarketplaceListing,
  createMarketplaceReview,
  createSavedSearch,
  deleteSavedSearch,
  favoriteMarketplaceListing,
  fetchMarketplaceCatalog,
  fetchMarketplaceComparables,
  fetchMarketplaceConversation,
  fetchMarketplaceConversations,
  fetchMarketplaceFavorites,
  fetchMarketplaceListingDetail,
  fetchMarketplaceReviewableSales,
  fetchMarketplaceStore,
  fetchMarketplaceStoreReviews,
  fetchSavedSearches,
  fetchSellableAnimals,
  fetchSellerDashboard,
  markMarketplaceConversationRead,
  reportMarketplaceMessage,
  saveMarketplaceStore,
  updateMarketplaceListing,
  updateMarketplaceListingWorkflow,
} from "../shared/apiClient";

/**
 * Uploaded media is served by the API, not by the static host, so a stored
 * `/marketplace/media/:id` has to be resolved against the API base before it
 * can go in an `img` tag. Absolute URLs (a CDN later) pass through untouched.
 */
export const resolveMediaUrl = (url) => {
  const value = String(url || "");
  if (!value) return "";
  if (/^(?:https?:)?\/\//i.test(value) || value.startsWith("data:")) return value;
  const config = getSharedApiConfig();
  if (!config.ok || !config.baseUrl) return value;
  return `${config.baseUrl}${value.startsWith("/") ? value : `/${value}`}`;
};

const withMedia = (listing) => {
  if (!listing) return listing;
  return {
    ...listing,
    imageUrl: resolveMediaUrl(listing.imageUrl),
    images: (listing.images || []).map((image) => ({ ...image, imageUrl: resolveMediaUrl(image.imageUrl) })),
  };
};

/** Strips empty values so the query string carries only real filters. */
export const toQuery = (filters) => {
  const out = {};
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === false) return;
    out[key] = value === true ? "true" : value;
  });
  return out;
};

export const browse = async (filters) => {
  const result = await fetchMarketplaceCatalog(toQuery(filters));
  return { ...result, listings: (result.listings || []).map(withMedia) };
};

export const listingDetail = async (id) => {
  const result = await fetchMarketplaceListingDetail(id);
  return withMedia(result.listing);
};

export const comparables = async (id) => (await fetchMarketplaceComparables(id)).comparables;

export const store = async (userId) => {
  const result = await fetchMarketplaceStore(userId);
  const value = result.store || null;
  if (!value) return null;
  return { ...value, listings: (value.listings || []).map(withMedia) };
};

export const storeReviews = (userId) => fetchMarketplaceStoreReviews(userId);

export const dashboard = async () => {
  const result = await fetchSellerDashboard();
  return { ...result, listings: (result.listings || []).map(withMedia) };
};

export const sellableAnimals = async () => {
  const result = await fetchSellableAnimals();
  return (result.animals || []).map((animal) => ({
    ...animal,
    imageUrl: resolveMediaUrl(animal.imageUrl),
    photos: (animal.photos || []).map(resolveMediaUrl),
  }));
};

export const conversations = async () => (await fetchMarketplaceConversations()).conversations || [];
export const conversation = async (id) => (await fetchMarketplaceConversation(id)).conversation;
export const markRead = (id) => markMarketplaceConversationRead(id);
export const sendMessage = (id, payload) => addMarketplaceMessage(id, payload);
export const startConversation = (payload) => createMarketplaceConversation(payload);
export const acceptOffer = (id, payload) => acceptMarketplaceOffer(id, payload);
export const reportMessage = (id, payload) => reportMarketplaceMessage(id, payload);
export const blockUser = (payload) => blockMarketplaceUser(payload);

export const favorite = (id) => favoriteMarketplaceListing(id);
export const favorites = async () => ((await fetchMarketplaceFavorites()).listings || []).map(withMedia);
export const saveListing = (payload) =>
  payload.id ? updateMarketplaceListing(payload.id, payload) : createMarketplaceListing(payload);
export const setListingStatus = (id, status) =>
  updateMarketplaceListingWorkflow(id, { status, availability: status });
export const saveStore = (payload) => saveMarketplaceStore(payload);

export const savedSearches = async () => (await fetchSavedSearches()).searches || [];
export const saveSearch = (payload) => createSavedSearch(payload);
export const removeSearch = (id) => deleteSavedSearch(id);

export const reviewableSales = async () => (await fetchMarketplaceReviewableSales()).sales || [];
export const submitReview = (payload) => createMarketplaceReview(payload);
