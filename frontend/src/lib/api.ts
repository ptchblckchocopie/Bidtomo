// API utility functions for interacting with backend via SvelteKit bridge
// All requests go through /api/bridge/* to avoid exposing PayloadCMS structure

import { browser } from '$app/environment';
import { getAuthToken, authStore } from './stores/auth';
import { goto } from '$app/navigation';

// Bridge API base URL - uses relative paths in browser, absolute for SSR
function getBridgeUrl(): string {
  if (browser) {
    // In browser, use relative paths (same origin)
    return '';
  }
  // For SSR, we can't call our own API routes, so return empty string
  // SSR requests will need to be handled differently if needed
  return '';
}

const BRIDGE_URL = getBridgeUrl();

// Helper function to get auth headers
function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `JWT ${token}`;
  }

  return headers;
}

// Handle expired/invalid token: auto-logout and redirect to login
let isLoggingOut = false;
function handleExpiredToken() {
  if (!browser || isLoggingOut) return;
  isLoggingOut = true;
  authStore.logout();
  goto('/login');
  // Reset flag after a short delay to prevent re-triggering during redirect
  setTimeout(() => { isLoggingOut = false; }, 2000);
}

export interface Product {
  id: string;
  title: string;
  description: string;
  keywords?: Array<{
    keyword: string;
  }>;
  startingPrice: number;
  bidInterval: number;
  currentBid?: number;
  auctionEndDate: string;
  active: boolean;
  status: 'available' | 'sold' | 'ended';
  region?: string;
  city?: string;
  delivery_options?: 'delivery' | 'meetup' | 'both';
  seller: {
    id: string;
    name: string;
    email: string;
    currency: 'PHP' | 'USD' | 'EUR' | 'GBP' | 'JPY';
  };
  images?: Array<{
    image: {
      url: string;
      alt?: string;
    };
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'seller' | 'buyer';
  currency: 'PHP' | 'USD' | 'EUR' | 'GBP' | 'JPY';
}

export interface Bid {
  id: string;
  product: string | Product;
  bidder: string | User;
  amount: number;
  bidTime: string;
  censorName?: boolean;
}

export interface Message {
  id: string;
  product: string | Product;
  sender: string | User;
  receiver: string | User;
  message: string;
  read: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  product: string | Product;
  seller: string | User;
  buyer: string | User;
  amount: number;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'voided';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Rating {
  id: string;
  transaction: string | Transaction;
  rater: string | User;
  ratee: string | User;
  raterRole: 'buyer' | 'seller';
  rating: number;
  comment?: string;
  followUp?: {
    rating?: number;
    comment?: string;
    createdAt?: string;
  };
  hasFollowUp: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VoidRequest {
  id: string;
  transaction: string | Transaction;
  product: string | Product;
  initiator: string | User;
  initiatorRole: 'buyer' | 'seller';
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejectionReason?: string;
  approvedAt?: string;
  sellerChoice?: 'restart_bidding' | 'offer_second_bidder';
  secondBidderOffer?: {
    offeredTo: string | User;
    offerAmount: number;
    offerStatus: 'pending' | 'accepted' | 'declined' | 'expired';
    offeredAt: string;
    respondedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PublicUserProfile {
  id: string;
  name: string;
  censorName: boolean;
  role: 'admin' | 'seller' | 'buyer';
  currency: 'PHP' | 'USD' | 'EUR' | 'GBP' | 'JPY';
  createdAt: string;
}

export interface UserRatingStats {
  averageRating: number;
  totalRatings: number;
  asSeller: {
    averageRating: number;
    totalRatings: number;
  };
  asBuyer: {
    averageRating: number;
    totalRatings: number;
  };
}

export interface UserLimits {
  bids: {
    current: number;
    max: number;
    remaining: number;
  };
  posts: {
    current: number;
    max: number;
    remaining: number;
  };
}

// Fetch all products (only active ones for browse page)
export async function fetchProducts(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  region?: string;
  city?: string;
  customFetch?: typeof fetch;
}): Promise<{ docs: Product[]; totalDocs: number; totalPages: number; page: number; limit: number }> {
  try {
    const queryParams = new URLSearchParams();

    // Pagination
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    // Track the current and index for building complex queries
    let andIndex = 0;

    // Filter by status
    if (params?.status === 'active') {
      // Active auctions - status is 'available' AND active=true
      queryParams.append(`where[and][${andIndex}][status][equals]`, 'available');
      andIndex++;
      queryParams.append(`where[and][${andIndex}][active][equals]`, 'true');
      andIndex++;
    } else if (params?.status === 'ended') {
      // Ended auctions - status is 'ended' or 'sold'
      queryParams.append(`where[and][${andIndex}][or][0][status][equals]`, 'ended');
      queryParams.append(`where[and][${andIndex}][or][1][status][equals]`, 'sold');
      andIndex++;
    } else if (params?.status === 'hidden') {
      // Hidden items - active=false (admin only)
      queryParams.append(`where[and][${andIndex}][active][equals]`, 'false');
      andIndex++;
    }

    // Filter by location
    if (params?.region && params.region.trim()) {
      queryParams.append(`where[and][${andIndex}][region][contains]`, params.region.trim());
      andIndex++;
    }
    if (params?.city && params.city.trim()) {
      queryParams.append(`where[and][${andIndex}][city][contains]`, params.city.trim());
      andIndex++;
    }

    // Search - using OR logic for title, description, keywords, region, and city
    if (params?.search && params.search.trim()) {
      const searchTerm = params.search.trim();
      queryParams.append(`where[and][${andIndex}][or][0][title][contains]`, searchTerm);
      queryParams.append(`where[and][${andIndex}][or][1][description][contains]`, searchTerm);
      queryParams.append(`where[and][${andIndex}][or][2][keywords.keyword][contains]`, searchTerm);
      queryParams.append(`where[and][${andIndex}][or][3][region][contains]`, searchTerm);
      queryParams.append(`where[and][${andIndex}][or][4][city][contains]`, searchTerm);
      andIndex++;
    }

    // Sort by creation date (newest first)
    queryParams.append('sort', '-createdAt');

    const fetchFn = params?.customFetch || fetch;
    const response = await fetchFn(`${BRIDGE_URL}/api/bridge/products?${queryParams.toString()}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch products');
    }

    const data = await response.json();
    return {
      docs: data.docs || [],
      totalDocs: data.totalDocs || 0,
      totalPages: data.totalPages || 0,
      page: data.page || 1,
      limit: data.limit || 10
    };
  } catch (error) {
    console.error('Error fetching products:', error);
    return {
      docs: [],
      totalDocs: 0,
      totalPages: 0,
      page: 1,
      limit: 10
    };
  }
}

// Fetch active products where the user has placed bids
export async function fetchMyBidsProducts(params?: {
  page?: number;
  limit?: number;
  search?: string;
  customFetch?: typeof fetch;
}): Promise<{ docs: Product[]; totalDocs: number; totalPages: number; page: number; limit: number }> {
  try {
    const currentUser = await getCurrentUser(params?.customFetch);
    if (!currentUser) {
      return {
        docs: [],
        totalDocs: 0,
        totalPages: 0,
        page: 1,
        limit: params?.limit || 12
      };
    }

    // First, fetch all bids by the current user
    const queryParams = new URLSearchParams();
    queryParams.append('where[bidder][equals]', currentUser.id);
    queryParams.append('limit', '1000'); // Get all user's bids

    const fetchFn = params?.customFetch || fetch;
    const bidsResponse = await fetchFn(`${BRIDGE_URL}/api/bridge/bids?${queryParams.toString()}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!bidsResponse.ok) {
      throw new Error('Failed to fetch user bids');
    }

    const bidsData = await bidsResponse.json();
    const bids: Bid[] = bidsData.docs || [];

    // Extract unique product IDs from bids
    const productIds = new Set<string>();
    bids.forEach(bid => {
      const productId = typeof bid.product === 'object' ? bid.product.id : bid.product;
      productIds.add(productId);
    });

    if (productIds.size === 0) {
      return {
        docs: [],
        totalDocs: 0,
        totalPages: 0,
        page: params?.page || 1,
        limit: params?.limit || 12
      };
    }

    // Fetch products where user has bids and status is active or available
    const productQueryParams = new URLSearchParams();

    // Filter by product IDs
    const productIdArray = Array.from(productIds);
    productIdArray.forEach((id, index) => {
      productQueryParams.append(`where[id][in][${index}]`, id);
    });

    // Filter by available status AND active=true
    productQueryParams.append('where[and][0][status][equals]', 'available');
    productQueryParams.append('where[and][1][active][equals]', 'true');

    // Search
    if (params?.search && params.search.trim()) {
      const searchTerm = params.search.trim();
      productQueryParams.append('where[and][2][or][0][title][contains]', searchTerm);
      productQueryParams.append('where[and][2][or][1][description][contains]', searchTerm);
      productQueryParams.append('where[and][2][or][2][keywords.keyword][contains]', searchTerm);
    }

    // Pagination
    if (params?.page) productQueryParams.append('page', params.page.toString());
    if (params?.limit) productQueryParams.append('limit', params.limit.toString());

    // Sort by creation date (newest first)
    productQueryParams.append('sort', '-createdAt');

    const productsResponse = await fetchFn(`${BRIDGE_URL}/api/bridge/products?${productQueryParams.toString()}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!productsResponse.ok) {
      throw new Error('Failed to fetch products');
    }

    const productsData = await productsResponse.json();
    return {
      docs: productsData.docs || [],
      totalDocs: productsData.totalDocs || 0,
      totalPages: productsData.totalPages || 0,
      page: productsData.page || 1,
      limit: productsData.limit || 12
    };
  } catch (error) {
    console.error('Error fetching my bids products:', error);
    return {
      docs: [],
      totalDocs: 0,
      totalPages: 0,
      page: 1,
      limit: params?.limit || 12
    };
  }
}

// Fetch products by seller
export async function fetchProductsBySeller(sellerId: string): Promise<Product[]> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/products?where[seller][equals]=${sellerId}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch seller products');
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error fetching seller products:', error);
    return [];
  }
}

// Fetch active products for seller (not ended by time)
export async function fetchActiveProductsBySeller(sellerId: string, customFetch?: typeof fetch): Promise<Product[]> {
  try {
    const fetchFn = customFetch || fetch;
    const now = new Date().toISOString();
    const response = await fetchFn(
      `${BRIDGE_URL}/api/bridge/products?where[and][0][seller][equals]=${sellerId}&where[and][1][status][equals]=available&where[and][2][active][equals]=true&where[and][3][auctionEndDate][greater_than]=${now}`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch active products');
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error fetching active products:', error);
    return [];
  }
}

// Fetch hidden products for seller
export async function fetchHiddenProductsBySeller(sellerId: string, customFetch?: typeof fetch): Promise<Product[]> {
  try {
    const fetchFn = customFetch || fetch;
    const response = await fetchFn(
      `${BRIDGE_URL}/api/bridge/products?where[and][0][seller][equals]=${sellerId}&where[and][1][active][equals]=false`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch hidden products');
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error fetching hidden products:', error);
    return [];
  }
}

// Fetch ended products for seller (sold, ended, or past auction date)
export async function fetchEndedProductsBySeller(sellerId: string, customFetch?: typeof fetch): Promise<Product[]> {
  try {
    const fetchFn = customFetch || fetch;
    const now = new Date().toISOString();
    const response = await fetchFn(
      `${BRIDGE_URL}/api/bridge/products?where[and][0][seller][equals]=${sellerId}&where[and][1][or][0][status][equals]=sold&where[and][1][or][1][status][equals]=ended&where[and][1][or][2][and][0][status][equals]=available&where[and][1][or][2][and][1][auctionEndDate][less_than_equal]=${now}`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch ended products');
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error fetching ended products:', error);
    return [];
  }
}

// Fetch a single product by ID
export async function fetchProduct(id: string, customFetch?: typeof fetch): Promise<Product | null> {
  try {
    const fetchFn = customFetch || fetch;
    const response = await fetchFn(`${BRIDGE_URL}/api/bridge/products/${id}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch product');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

// Check product status for updates (lightweight endpoint)
export async function checkProductStatus(id: string): Promise<{
  id: string;
  updatedAt: string;
  status: string;
  currentBid?: number;
  latestBidTime?: string;
  bidCount: number;
} | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/products/${id}/status`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to check product status');
    }

    return await response.json();
  } catch (error) {
    console.error('Error checking product status:', error);
    return null;
  }
}

// Create a new product
export async function createProduct(productData: {
  title: string;
  description: string;
  keywords?: Array<{ keyword: string }>;
  startingPrice: number;
  bidInterval?: number;
  auctionEndDate: string;
  images?: Array<{ image: string }>;
  region?: string;
  city?: string;
  delivery_options?: 'delivery' | 'meetup' | 'both';
}): Promise<Product | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/products`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(productData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to create product:', response.status, errorText);
      throw new Error('Failed to create product');
    }

    const data = await response.json();
    console.log('Create product response:', data);
    // PayloadCMS returns { message: "...", doc: { ... } }
    // Return only the doc (the actual product object)
    return data.doc || data;
  } catch (error) {
    console.error('Error creating product:', error);
    return null;
  }
}

// Update a product
export async function updateProduct(
  productId: string,
  productData: {
    title?: string;
    description?: string;
    keywords?: Array<{ keyword: string }>;
    bidInterval?: number;
    auctionEndDate?: string;
    active?: boolean;
    status?: 'available' | 'sold' | 'ended';
    images?: Array<{ image: string }>;
    region?: string;
    city?: string;
    delivery_options?: 'delivery' | 'meetup' | 'both';
  }
): Promise<Product | null> {
  try {
    console.log('Updating product:', productId, productData);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(`${BRIDGE_URL}/api/bridge/products/${productId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(productData),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log('Update response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Update failed with status:', response.status, errorText);
      throw new Error(`Failed to update product: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('Update successful:', result);
    // PayloadCMS returns { message: "...", doc: { ... } }
    // Return only the doc (the actual product object)
    return result.doc || result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Update timed out after 30 seconds');
      throw new Error('Request timed out. The server might be processing your request.');
    }
    console.error('Error updating product:', error);
    throw error;
  }
}

// Login
export async function login(email: string, password: string): Promise<{ user: User; token: string } | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Error logging in:', error);
    return null;
  }
}

// Logout
export async function logout(): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/users/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    return response.ok;
  } catch (error) {
    console.error('Error logging out:', error);
    return false;
  }
}

// Get current user
export async function getCurrentUser(customFetch?: typeof fetch): Promise<User | null> {
  try {
    const fetchFn = customFetch || fetch;
    const response = await fetchFn(`${BRIDGE_URL}/api/bridge/users/me`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        handleExpiredToken();
      }
      return null;
    }

    const data = await response.json();
    return data.user || null;
  } catch (error) {
    console.error('Error fetching current user:', error);
    return null;
  }
}

// Place a bid
export async function placeBid(productId: string, amount: number, censorName: boolean = false): Promise<Bid | null> {
  try {
    console.log('Placing bid:', { productId, amount, censorName, headers: getAuthHeaders() });

    const response = await fetch(`${BRIDGE_URL}/api/bridge/bids`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        product: productId,
        amount,
        censorName,
        // bidder and bidTime are set automatically by backend
      }),
    });

    console.log('Bid response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('Bid failed:', response.status, errorData);
      throw new Error(errorData?.message || 'Failed to place bid');
    }

    const data = await response.json();
    console.log('Bid placed successfully:', data);
    // PayloadCMS returns { message: "...", doc: { ... } }
    // Return only the doc (the actual bid object)
    return data.doc || data;
  } catch (error) {
    console.error('Error placing bid:', error);
    return null;
  }
}

// Fetch bids for a product
export async function fetchProductBids(productId: string, customFetch?: typeof fetch): Promise<Bid[]> {
  try {
    const fetchFn = customFetch || fetch;
    const response = await fetchFn(`${BRIDGE_URL}/api/bridge/bids?where[product][equals]=${productId}&sort=-bidTime&limit=1000`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch bids');
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error fetching bids:', error);
    return [];
  }
}

// Fetch user's purchases (products they won)
export async function fetchMyPurchases(): Promise<Product[]> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/products?where[status][in][0]=sold&where[status][in][1]=ended&limit=100`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch purchases');
    }

    const data = await response.json();
    const products = data.docs || [];

    // Filter to only include products where the current user is the highest bidder
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];

    const purchases: Product[] = [];
    for (const product of products) {
      // Fetch bids for this product to check if user is the winner
      const bids = await fetchProductBids(product.id);
      if (bids.length > 0) {
        const highestBid = bids[0];
        const bidderId = typeof highestBid.bidder === 'object' ? highestBid.bidder.id : highestBid.bidder;
        if (bidderId === currentUser.id) {
          purchases.push(product);
        }
      }
    }

    return purchases;
  } catch (error) {
    console.error('Error fetching purchases:', error);
    return [];
  }
}

// Send a message
export async function sendMessage(productId: string, receiverId: string, message: string): Promise<Message | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/messages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        product: productId,
        receiver: receiverId,
        message,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    const data = await response.json();
    // PayloadCMS returns { message: "...", doc: { ... } }
    // Return only the doc (the actual message object)
    return data.doc || data;
  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
}

// Fetch messages for a product (conversation between buyer and seller)
export async function fetchProductMessages(
  productId: string,
  after?: string,
  options?: { limit?: number; before?: string; latest?: boolean }
): Promise<Message[]> {
  try {
    // When loading latest messages, sort descending and reverse the result
    const sortOrder = options?.latest ? '-createdAt' : 'createdAt';
    let url = `${BRIDGE_URL}/api/bridge/messages?where[product][equals]=${productId}&sort=${sortOrder}`;

    // If 'after' timestamp is provided, only fetch messages created after that time
    if (after) {
      url += `&where[createdAt][greater_than]=${after}`;
    }

    // If 'before' timestamp is provided, only fetch messages created before that time (for loading older)
    if (options?.before) {
      url += `&where[createdAt][less_than]=${options.before}`;
    }

    // Add limit if provided
    if (options?.limit) {
      url += `&limit=${options.limit}`;
    }

    const response = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch messages');
    }

    const data = await response.json();
    const messages = data.docs || [];

    // Reverse messages if we loaded latest (to get chronological order)
    return options?.latest ? messages.reverse() : messages;
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
}

// Fetch a single message by ID
export async function fetchMessageById(messageId: string | number): Promise<Message | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/messages/${messageId}?depth=1`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching message:', error);
    return null;
  }
}

// Fetch all conversations (grouped by product)
export async function fetchConversations(): Promise<{ product: Product; lastMessage: Message; unreadCount: number }[]> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/messages?limit=1000&sort=-createdAt`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        handleExpiredToken();
        return [];
      }
      throw new Error('Failed to fetch conversations');
    }

    const data = await response.json();
    const messages: Message[] = data.docs || [];

    // Get current user
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return [];
    }

    // Filter messages to only include those where current user is involved
    const userMessages = messages.filter(message => {
      const senderId = typeof message.sender === 'object' ? message.sender.id : message.sender;
      const receiverId = typeof message.receiver === 'object' ? message.receiver.id : message.receiver;
      return senderId === currentUser.id || receiverId === currentUser.id;
    });

    // Group messages by product
    const conversationsMap = new Map<string, { product: Product; lastMessage: Message; unreadCount: number }>();

    for (const message of userMessages) {
      const product = typeof message.product === 'object' ? message.product : null;
      if (!product) continue;

      const productId = product.id;

      if (!conversationsMap.has(productId)) {
        conversationsMap.set(productId, {
          product,
          lastMessage: message,
          unreadCount: 0,
        });
      }

      // Count unread messages (received by current user)
      const receiverId = typeof message.receiver === 'object' ? message.receiver.id : message.receiver;
      if (receiverId === currentUser.id && !message.read) {
        conversationsMap.get(productId)!.unreadCount++;
      }
    }

    return Array.from(conversationsMap.values());
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
}

// Get total unread message count
export async function getUnreadMessageCount(): Promise<number> {
  try {
    const conversations = await fetchConversations();
    return conversations.reduce((total, conv) => total + conv.unreadCount, 0);
  } catch (error) {
    console.error('Error fetching unread message count:', error);
    return 0;
  }
}

// Set typing status
export async function setTypingStatus(productId: string, isTyping: boolean): Promise<void> {
  try {
    await fetch(`${BRIDGE_URL}/api/bridge/typing`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        product: productId,
        isTyping,
      }),
    });
  } catch (error) {
    console.error('Error setting typing status:', error);
  }
}

// Get typing status for a product
export async function getTypingStatus(productId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/typing/${productId}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.typing || false;
  } catch (error) {
    console.error('Error getting typing status:', error);
    return false;
  }
}

// Mark message as read
export async function markMessageAsRead(messageId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/messages/${messageId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ read: true }),
    });

    return response.ok;
  } catch (error) {
    console.error('Error marking message as read:', error);
    return false;
  }
}

// Fetch user's transactions
export async function fetchMyTransactions(): Promise<Transaction[]> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/transactions?limit=100&sort=-createdAt`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch transactions');
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
}

// Update transaction status
export async function updateTransactionStatus(
  transactionId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled',
  notes?: string
): Promise<Transaction | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ status, ...(notes && { notes }) }),
    });

    if (!response.ok) {
      throw new Error('Failed to update transaction');
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating transaction:', error);
    return null;
  }
}

// Delete media from PayloadCMS
export async function deleteMedia(mediaId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/media/${mediaId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('Failed to delete media:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting media:', error);
    return false;
  }
}

// Upload media to PayloadCMS
export async function uploadMedia(file: File): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const token = getAuthToken();
    console.log('Upload token present:', !!token);
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `JWT ${token}`;
    } else {
      console.error('No auth token found - user may not be logged in');
    }

    const response = await fetch(`${BRIDGE_URL}/api/bridge/media`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      console.error('Failed to upload media:', response.status);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return null;
    }

    const data = await response.json();
    return data.doc?.id || data.id;
  } catch (error) {
    console.error('Error uploading media:', error);
    return null;
  }
}

// Get user limits (bidding and posting)
export async function getUserLimits(): Promise<UserLimits | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/users/limits`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user limits');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user limits:', error);
    return null;
  }
}

// ============ Rating Functions ============

// Create a rating for a transaction
export async function createRating(
  transactionId: string,
  rating: number,
  comment?: string
): Promise<Rating | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/ratings`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        transaction: transactionId,
        rating,
        comment,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.errors?.[0]?.message || 'Failed to create rating');
    }

    const data = await response.json();
    return data.doc || data;
  } catch (error) {
    console.error('Error creating rating:', error);
    throw error;
  }
}

// Add follow-up to an existing rating
export async function addRatingFollowUp(
  ratingId: string,
  followUpRating: number,
  followUpComment?: string
): Promise<Rating | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/ratings/${ratingId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        followUp: {
          rating: followUpRating,
          comment: followUpComment,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.errors?.[0]?.message || 'Failed to add follow-up');
    }

    const data = await response.json();
    return data.doc || data;
  } catch (error) {
    console.error('Error adding follow-up:', error);
    throw error;
  }
}

// Fetch ratings for a user (received)
export async function fetchUserRatings(
  userId: string,
  type: 'received' | 'given' = 'received'
): Promise<Rating[]> {
  try {
    const response = await fetch(
      `${BRIDGE_URL}/api/bridge/users/${userId}/ratings?type=${type}&depth=3`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch user ratings');
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error fetching user ratings:', error);
    return [];
  }
}

// Calculate user rating stats from ratings
export function calculateUserRatingStats(ratings: Rating[]): UserRatingStats {
  const sellerRatings = ratings.filter(r => r.raterRole === 'buyer'); // Buyers rate sellers
  const buyerRatings = ratings.filter(r => r.raterRole === 'seller'); // Sellers rate buyers

  const calcAverage = (ratingsList: Rating[]) => {
    if (ratingsList.length === 0) return 0;
    const sum = ratingsList.reduce((acc, r) => acc + r.rating, 0);
    return sum / ratingsList.length;
  };

  return {
    averageRating: calcAverage(ratings),
    totalRatings: ratings.length,
    asSeller: {
      averageRating: calcAverage(sellerRatings),
      totalRatings: sellerRatings.length,
    },
    asBuyer: {
      averageRating: calcAverage(buyerRatings),
      totalRatings: buyerRatings.length,
    },
  };
}

// Fetch public user profile
export async function fetchUserProfile(userId: string): Promise<PublicUserProfile | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/users/${userId}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user profile');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

// Fetch user's products (for public profile)
export async function fetchUserProducts(
  userId: string,
  params?: {
    status?: 'available' | 'sold' | 'ended';
    active?: boolean;
    limit?: number;
    page?: number;
  }
): Promise<{ docs: Product[]; totalDocs: number; totalPages: number }> {
  try {
    const queryParams = new URLSearchParams();

    if (params?.status) {
      queryParams.append('where[status][equals]', params.status);
    }
    if (params?.active !== undefined) {
      queryParams.append('where[active][equals]', String(params.active));
    }
    if (params?.limit) {
      queryParams.append('limit', String(params.limit));
    }
    if (params?.page) {
      queryParams.append('page', String(params.page));
    }

    queryParams.append('sort', '-createdAt');

    const response = await fetch(
      `${BRIDGE_URL}/api/bridge/users/${userId}/products?${queryParams.toString()}`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch user products');
    }

    const data = await response.json();
    return {
      docs: data.docs || [],
      totalDocs: data.totalDocs || 0,
      totalPages: data.totalPages || 0,
    };
  } catch (error) {
    console.error('Error fetching user products:', error);
    return { docs: [], totalDocs: 0, totalPages: 0 };
  }
}

// Fetch rating for a specific transaction by the current user
export async function fetchMyRatingForTransaction(transactionId: string): Promise<Rating | null> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;

    const response = await fetch(
      `${BRIDGE_URL}/api/bridge/ratings?where[transaction][equals]=${transactionId}&where[rater][equals]=${currentUser.id}&depth=1`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch rating');
    }

    const data = await response.json();
    return data.docs?.[0] || null;
  } catch (error) {
    console.error('Error fetching rating:', error);
    return null;
  }
}

// Fetch transaction for a product
export async function fetchTransactionForProduct(productId: string): Promise<Transaction | null> {
  try {
    const response = await fetch(
      `${BRIDGE_URL}/api/bridge/transactions?where[product][equals]=${productId}&depth=1`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch transaction');
    }

    const data = await response.json();
    return data.docs?.[0] || null;
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return null;
  }
}

// Create a void request for a transaction
export async function createVoidRequest(
  transactionId: string,
  reason: string
): Promise<{ success: boolean; voidRequest?: VoidRequest; error?: string }> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/void-request/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ transactionId, reason }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to create void request' };
    }

    return { success: true, voidRequest: data.voidRequest };
  } catch (error) {
    console.error('Error creating void request:', error);
    return { success: false, error: 'Failed to create void request' };
  }
}

// Respond to a void request (approve or reject)
export async function respondToVoidRequest(
  voidRequestId: string,
  action: 'approve' | 'reject',
  rejectionReason?: string
): Promise<{ success: boolean; voidRequest?: VoidRequest; error?: string; requiresSellerChoice?: boolean }> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/void-request/respond`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ voidRequestId, action, rejectionReason }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to respond to void request' };
    }

    return { success: true, voidRequest: data.voidRequest, requiresSellerChoice: data.requiresSellerChoice };
  } catch (error) {
    console.error('Error responding to void request:', error);
    return { success: false, error: 'Failed to respond to void request' };
  }
}

// Submit seller's choice after void is approved
export async function submitSellerChoice(
  voidRequestId: string,
  choice: 'restart_bidding' | 'offer_second_bidder'
): Promise<{ success: boolean; voidRequest?: VoidRequest; error?: string; notifiedBidders?: number; onlyOption?: string }> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/void-request/seller-choice`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ voidRequestId, choice }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to submit seller choice', onlyOption: data.onlyOption };
    }

    return { success: true, voidRequest: data.voidRequest, notifiedBidders: data.notifiedBidders };
  } catch (error) {
    console.error('Error submitting seller choice:', error);
    return { success: false, error: 'Failed to submit seller choice' };
  }
}

// Respond to second bidder offer
export async function respondToSecondBidderOffer(
  voidRequestId: string,
  action: 'accept' | 'decline'
): Promise<{ success: boolean; voidRequest?: VoidRequest; error?: string }> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/void-request/second-bidder-response`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ voidRequestId, action }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to respond to offer' };
    }

    return { success: true, voidRequest: data.voidRequest };
  } catch (error) {
    console.error('Error responding to second bidder offer:', error);
    return { success: false, error: 'Failed to respond to offer' };
  }
}

// Get void requests for a transaction
export async function getVoidRequestsForTransaction(
  transactionId: string
): Promise<VoidRequest[]> {
  try {
    const response = await fetch(
      `${BRIDGE_URL}/api/bridge/void-request/${transactionId}`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch void requests');
    }

    const data = await response.json();
    return data.voidRequests || [];
  } catch (error) {
    console.error('Error fetching void requests:', error);
    return [];
  }
}
