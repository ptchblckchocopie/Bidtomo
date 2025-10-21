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

// Create a new product
export async function createProduct(productData: {
  title: string;
  description: string;
  startingPrice: number;
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
    bidInterval?: number;
    auctionEndDate?: string;
    status?: 'active' | 'ended' | 'sold' | 'cancelled';
  }
): Promise<Product | null> {
  try {
    const response = await fetch(`${API_URL}/api/products/${productId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(productData),
    });

    if (!response.ok) {
      throw new Error('Failed to update product');
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating product:', error);
    return null;
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
export async function placeBid(productId: string, amount: number): Promise<Bid | null> {
  try {
    console.log('Placing bid:', { productId, amount, headers: getAuthHeaders() });

    const response = await fetch(`${API_URL}/api/bids`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        product: productId,
        amount,
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
