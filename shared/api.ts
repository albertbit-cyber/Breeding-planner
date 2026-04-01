export {
  AUTH_TOKEN_STORAGE_KEY as TOKEN_KEY,
  apiRequest,
  calculateOrderPrice,
  clearAuthToken,
  createOrder,
  fetchMyOrders,
  fetchOrderById,
  fetchOrders,
  fetchPricingConfig,
  fetchTestCatalog,
  getAuthToken,
  getCurrentUser,
  getHealth,
  login,
  register,
  setAuthToken,
  updateOrderStatus,
} from "../src/shared/apiClient";

export { getSharedApiConfig, validateSharedApiUrl } from "../src/shared/config/api";

