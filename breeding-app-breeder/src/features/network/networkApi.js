import { apiRequest, fetchSellerDashboard } from '../../shared/apiClient';

/**
 * The breeder network API (backend: routes/networkRoutes.ts). Conversations, transfers and joint
 * projects are server-side only; none of it travels in the breeder snapshot. What changes in the
 * keeper's own collection (an animal received, archived, lent, a partner record) arrives with the
 * next sync pull, which the caller triggers after an action that moves an animal.
 */

const enc = encodeURIComponent;
const post = (path, body = {}) => apiRequest(path, { method: 'POST', body: JSON.stringify(body) });

export const networkApi = {
  me: () => apiRequest('/network/me'),
  summary: () => apiRequest('/network/summary'),
  checkHandle: (handle) => apiRequest(`/network/handle/check?handle=${enc(handle)}`),
  setHandle: (handle) => apiRequest('/network/handle', { method: 'PUT', body: JSON.stringify({ handle }) }),
  people: (q) => apiRequest(`/network/people?q=${enc(q)}`),

  threads: (box = 'inbox') => apiRequest(`/network/threads?box=${enc(box)}`),
  thread: (id, before) => apiRequest(`/network/threads/${enc(id)}${before ? `?before=${enc(before)}` : ''}`),
  startThread: (payload) => post('/network/threads', payload),
  send: (threadId, payload) => post(`/network/threads/${enc(threadId)}/messages`, payload),
  markRead: (threadId) => post(`/network/threads/${enc(threadId)}/read`),
  setThreadStatus: (threadId, status) => post(`/network/threads/${enc(threadId)}/status`, { status }),
  report: (messageId, reason, note) => post(`/network/messages/${enc(messageId)}/report`, { reason, note }),

  blocks: () => apiRequest('/network/blocks'),
  block: (userId) => post('/network/blocks', { userId }),
  unblock: (userId) => apiRequest(`/network/blocks/${enc(userId)}`, { method: 'DELETE' }),

  transfers: () => apiRequest('/network/transfers'),
  createTransfer: (payload) => post('/network/transfers', payload),
  respondTransfer: (id, action) => post(`/network/transfers/${enc(id)}/respond`, { action }),
  returnLoan: (id, note) => post(`/network/transfers/${enc(id)}/return`, { note }),

  projects: () => apiRequest('/network/projects'),
  project: (id) => apiRequest(`/network/projects/${enc(id)}`),
  proposeProject: (payload) => post('/network/projects', payload),
  respondProject: (id, action, appAnimalId) => post(`/network/projects/${enc(id)}/respond`, { action, appAnimalId }),
  cancelProject: (id) => post(`/network/projects/${enc(id)}/cancel`),
  completeProject: (id) => post(`/network/projects/${enc(id)}/complete`),
  proposeSplit: (id, terms) => post(`/network/projects/${enc(id)}/split-proposals`, terms),
  respondSplit: (proposalId, action) => post(`/network/split-proposals/${enc(proposalId)}/respond`, { action }),
  offerShares: (id, appAnimalIds, note) => post(`/network/projects/${enc(id)}/shares`, { appAnimalIds, note }),

  /** The keeper's own published marketplace listings, to share a link to one. */
  myListings: async () => {
    const dashboard = await fetchSellerDashboard();
    return Array.isArray(dashboard?.listings) ? dashboard.listings : [];
  },
};

const MARKETPLACE_BASE = String(
  import.meta.env.VITE_MARKETPLACE_URL || 'https://albertbit-cyber.github.io/Breeding-planner/',
).replace(/\/?$/, '/');

/** The public page of a marketplace listing (the marketplace's /a/:id route). */
export const marketplaceListingUrl = (listingId) => `${MARKETPLACE_BASE}a/${encodeURIComponent(listingId)}`;

/** The error text a person should see, from whatever the API client threw. */
export const errorText = (error, fallback) => {
  const message = error?.message || error?.data?.message || error?.body?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

export const errorCode = (error) => error?.data?.code || error?.body?.code || error?.details?.code || error?.code || null;
