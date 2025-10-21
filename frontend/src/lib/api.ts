// API utility functions for interacting with PayloadCMS backend

import { getAuthToken } from './stores/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
  status: 'active' | 'ended' | 'sold' | 'cancelled';
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
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Fetch all products
export async function fetchProducts(): Promise<Product[]> {
  try {
    const response = await fetch(`${API_URL}/api/products`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch products');
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

// Fetch products by seller
export async function fetchProductsBySeller(sellerId: string): Promise<Product[]> {
  try {
    const response = await fetch(`${API_URL}/api/products?where[seller][equals]=${sellerId}`, {
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

// Fetch a single product by ID
export async function fetchProduct(id: string): Promise<Product | null> {
  try {
    const response = await fetch(`${API_URL}/api/products/${id}`, {
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
    const response = await fetch(`${API_URL}/api/products/${id}/status`, {
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
}): Promise<Product | null> {
  try {
    const response = await fetch(`${API_URL}/api/products`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(productData),
    });

    if (!response.ok) {
      throw new Error('Failed to create product');
    }

    return await response.json();
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
    status?: 'active' | 'ended' | 'sold' | 'cancelled';
  }
): Promise<Product | null> {
  try {
    console.log('Updating product:', productId, productData);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(`${API_URL}/api/products/${productId}`, {
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
    return result;
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
    const response = await fetch(`${API_URL}/api/users/login`, {
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
    const response = await fetch(`${API_URL}/api/users/logout`, {
      method: 'POST',
      credentials: 'include',
    });

    return response.ok;
  } catch (error) {
    console.error('Error logging out:', error);
    return false;
  }
}

// Get current user
export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await fetch(`${API_URL}/api/users/me`, {
      credentials: 'include',
    });

    if (!response.ok) {
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

    const response = await fetch(`${API_URL}/api/bids`, {
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
    return data;
  } catch (error) {
    console.error('Error placing bid:', error);
    return null;
  }
}

// Fetch bids for a product
export async function fetchProductBids(productId: string): Promise<Bid[]> {
  try {
    const response = await fetch(`${API_URL}/api/bids?where[product][equals]=${productId}&sort=-bidTime`, {
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
    const response = await fetch(`${API_URL}/api/products?where[status][in][0]=sold&where[status][in][1]=ended&limit=100`, {
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
    const response = await fetch(`${API_URL}/api/messages`, {
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

    return await response.json();
  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
}

// Fetch messages for a product (conversation between buyer and seller)
export async function fetchProductMessages(productId: string): Promise<Message[]> {
  try {
    const response = await fetch(`${API_URL}/api/messages?where[product][equals]=${productId}&sort=createdAt`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch messages');
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
}

// Fetch all conversations (grouped by product)
export async function fetchConversations(): Promise<{ product: Product; lastMessage: Message; unreadCount: number }[]> {
  try {
    const response = await fetch(`${API_URL}/api/messages?limit=1000&sort=-createdAt`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch conversations');
    }

    const data = await response.json();
    const messages: Message[] = data.docs || [];

    // Group messages by product
    const conversationsMap = new Map<string, { product: Product; lastMessage: Message; unreadCount: number }>();

    for (const message of messages) {
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
      const currentUser = await getCurrentUser();
      if (currentUser) {
        const receiverId = typeof message.receiver === 'object' ? message.receiver.id : message.receiver;
        if (receiverId === currentUser.id && !message.read) {
          conversationsMap.get(productId)!.unreadCount++;
        }
      }
    }

    return Array.from(conversationsMap.values());
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
}

// Mark message as read
export async function markMessageAsRead(messageId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/messages/${messageId}`, {
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
    const response = await fetch(`${API_URL}/api/transactions?limit=100&sort=-createdAt`, {
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
    const response = await fetch(`${API_URL}/api/transactions/${transactionId}`, {
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
