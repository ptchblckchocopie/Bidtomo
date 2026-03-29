// Barrel re-export — all consumers can keep importing from '$lib/api'

// Error handling
export { ApiError } from './_shared';

// Types
export type {
  Product,
  User,
  Bid,
  Message,
  Transaction,
  Rating,
  VoidRequest,
  PublicUserProfile,
  UserRatingStats,
  UserLimits,
  Report,
  AnalyticsDashboard,
} from './types';

// Auth
export { login, logout, getCurrentUser } from './auth';

// Products
export {
  fetchProducts,
  fetchMyBidsProducts,
  fetchProductsBySeller,
  fetchActiveProductsBySeller,
  fetchHiddenProductsBySeller,
  fetchEndedProductsBySeller,
  fetchProduct,
  checkProductStatus,
  createProduct,
  updateProduct,
} from './products';

// Bids
export { placeBid, fetchProductBids } from './bids';

// Messages
export {
  sendMessage,
  fetchProductMessages,
  fetchMessageById,
  fetchConversations,
  getUnreadMessageCount,
  setTypingStatus,
  getTypingStatus,
  markMessageAsRead,
} from './messages';

// Transactions
export {
  fetchMyTransactions,
  updateTransactionStatus,
  fetchTransactionForProduct,
  fetchMyPurchases,
} from './transactions';

// Ratings
export {
  createRating,
  addRatingFollowUp,
  fetchUserRatings,
  calculateUserRatingStats,
  fetchMyRatingForTransaction,
} from './ratings';

// Users
export {
  searchUsers,
  fetchUserProfile,
  fetchUserProducts,
  getUserLimits,
} from './users';

// Watchlist
export { fetchWatchlist, addToWatchlist, removeFromWatchlist } from './watchlist';

// Media
export { deleteMedia, uploadMedia } from './media';

// Reports
export { reportProduct, fetchReports, updateReport } from './reports';

// Analytics
export { fetchAnalyticsDashboard } from './analytics';

// Void Requests
export {
  createVoidRequest,
  respondToVoidRequest,
  submitSellerChoice,
  respondToSecondBidderOffer,
  getVoidRequestsForTransaction,
} from './void-requests';
