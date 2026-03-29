import { BRIDGE_URL, getAuthHeaders, extractErrorMessage } from './_shared';
import { trackSearch } from '../analytics';
import type { Product } from './types';

export async function fetchProducts(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  region?: string;
  city?: string;
  category?: string;
  customFetch?: typeof fetch;
}): Promise<{ docs: Product[]; totalDocs: number; totalPages: number; page: number; limit: number }> {
  const empty = { docs: [], totalDocs: 0, totalPages: 0, page: 1, limit: params?.limit || 10 };

  try {
    const fetchFn = params?.customFetch || fetch;

    // Try Elasticsearch first when there's a search query
    if (params?.search && params.search.trim()) {
      try {
        const esParams = new URLSearchParams();
        esParams.append('q', params.search.trim());
        if (params.status) esParams.append('status', params.status);
        if (params.region) esParams.append('region', params.region);
        if (params.city) esParams.append('city', params.city);
        if (params.category) esParams.append('categories', params.category);
        if (params.page) esParams.append('page', params.page.toString());
        if (params.limit) esParams.append('limit', params.limit.toString());

        const esResponse = await fetchFn(`${BRIDGE_URL}/api/bridge/products/search?${esParams.toString()}`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        });

        if (esResponse.ok) {
          const esData = await esResponse.json();
          if (!esData.fallback) {
            return {
              docs: esData.docs || [],
              totalDocs: esData.totalDocs || 0,
              totalPages: esData.totalPages || 0,
              page: esData.page || 1,
              limit: esData.limit || 10,
            };
          }
        }
      } catch {
        // ES failed — fall through to Payload search
      }
    }

    // Fallback: Payload CMS query
    const queryParams = new URLSearchParams();

    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    let andIndex = 0;

    if (params?.status === 'active') {
      queryParams.append(`where[and][${andIndex}][status][equals]`, 'available');
      andIndex++;
      queryParams.append(`where[and][${andIndex}][active][equals]`, 'true');
      andIndex++;
    } else if (params?.status === 'ended') {
      queryParams.append(`where[and][${andIndex}][or][0][status][equals]`, 'ended');
      queryParams.append(`where[and][${andIndex}][or][1][status][equals]`, 'sold');
      andIndex++;
    } else if (params?.status === 'hidden') {
      queryParams.append(`where[and][${andIndex}][active][equals]`, 'false');
      andIndex++;
    }

    if (params?.region && params.region.trim()) {
      queryParams.append(`where[and][${andIndex}][region][contains]`, params.region.trim());
      andIndex++;
    }
    if (params?.city && params.city.trim()) {
      queryParams.append(`where[and][${andIndex}][city][contains]`, params.city.trim());
      andIndex++;
    }

    if (params?.category && params.category.trim()) {
      queryParams.append(`where[and][${andIndex}][categories][contains]`, params.category.trim());
      andIndex++;
    }

    if (params?.search && params.search.trim()) {
      const searchTerm = params.search.trim();
      queryParams.append(`where[and][${andIndex}][or][0][title][contains]`, searchTerm);
      queryParams.append(`where[and][${andIndex}][or][1][description][contains]`, searchTerm);
      queryParams.append(`where[and][${andIndex}][or][2][keywords.keyword][contains]`, searchTerm);
      queryParams.append(`where[and][${andIndex}][or][3][region][contains]`, searchTerm);
      queryParams.append(`where[and][${andIndex}][or][4][city][contains]`, searchTerm);
      andIndex++;
    }

    queryParams.append('sort', '-createdAt');
    queryParams.append('depth', '1');

    const response = await fetchFn(`${BRIDGE_URL}/api/bridge/products?${queryParams.toString()}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch products');
    }

    const data = await response.json();
    const result = {
      docs: data.docs || [],
      totalDocs: data.totalDocs || 0,
      totalPages: data.totalPages || 0,
      page: data.page || 1,
      limit: data.limit || 10
    };

    if (params?.search?.trim()) {
      trackSearch(params.search.trim(), { status: params.status, region: params.region, city: params.city }, result.totalDocs);
    }

    return result;
  } catch (error) {
    console.error('Error fetching products:', error);
    return empty;
  }
}

export async function fetchMyBidsProducts(params?: {
  page?: number;
  limit?: number;
  search?: string;
  customFetch?: typeof fetch;
}): Promise<{ docs: Product[]; totalDocs: number; totalPages: number; page: number; limit: number }> {
  try {
    const { getCurrentUser } = await import('./auth');
    const currentUser = await getCurrentUser(params?.customFetch);
    if (!currentUser) {
      return { docs: [], totalDocs: 0, totalPages: 0, page: 1, limit: params?.limit || 12 };
    }

    const queryParams = new URLSearchParams();
    queryParams.append('where[bidder][equals]', currentUser.id);
    queryParams.append('limit', '1000');

    const fetchFn = params?.customFetch || fetch;
    const bidsResponse = await fetchFn(`${BRIDGE_URL}/api/bridge/bids?${queryParams.toString()}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!bidsResponse.ok) {
      throw new Error('Failed to fetch user bids');
    }

    const bidsData = await bidsResponse.json();
    const bids = bidsData.docs || [];

    const productIds = new Set<string>();
    bids.forEach((bid: any) => {
      const productId = typeof bid.product === 'object' ? bid.product.id : bid.product;
      productIds.add(productId);
    });

    if (productIds.size === 0) {
      return { docs: [], totalDocs: 0, totalPages: 0, page: params?.page || 1, limit: params?.limit || 12 };
    }

    const productQueryParams = new URLSearchParams();
    const productIdArray = Array.from(productIds);
    productIdArray.forEach((id, index) => {
      productQueryParams.append(`where[id][in][${index}]`, id);
    });

    productQueryParams.append('where[and][0][status][equals]', 'available');
    productQueryParams.append('where[and][1][active][equals]', 'true');

    if (params?.search && params.search.trim()) {
      const searchTerm = params.search.trim();
      productQueryParams.append('where[and][2][or][0][title][contains]', searchTerm);
      productQueryParams.append('where[and][2][or][1][description][contains]', searchTerm);
      productQueryParams.append('where[and][2][or][2][keywords.keyword][contains]', searchTerm);
    }

    if (params?.page) productQueryParams.append('page', params.page.toString());
    if (params?.limit) productQueryParams.append('limit', params.limit.toString());
    productQueryParams.append('sort', '-createdAt');
    productQueryParams.append('depth', '1');

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
    return { docs: [], totalDocs: 0, totalPages: 0, page: 1, limit: params?.limit || 12 };
  }
}

export async function fetchProductsBySeller(sellerId: string): Promise<Product[]> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/products?where[seller][equals]=${sellerId}&depth=1`, {
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

export async function fetchActiveProductsBySeller(sellerId: string, customFetch?: typeof fetch): Promise<Product[]> {
  try {
    const fetchFn = customFetch || fetch;
    const now = new Date().toISOString();
    const response = await fetchFn(
      `${BRIDGE_URL}/api/bridge/products?where[and][0][seller][equals]=${sellerId}&where[and][1][status][equals]=available&where[and][2][active][equals]=true&where[and][3][auctionEndDate][greater_than]=${now}&depth=1`,
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

export async function fetchHiddenProductsBySeller(sellerId: string, customFetch?: typeof fetch): Promise<Product[]> {
  try {
    const fetchFn = customFetch || fetch;
    const response = await fetchFn(
      `${BRIDGE_URL}/api/bridge/products?where[and][0][seller][equals]=${sellerId}&where[and][1][active][equals]=false&depth=1`,
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

export async function fetchEndedProductsBySeller(sellerId: string, customFetch?: typeof fetch): Promise<Product[]> {
  try {
    const fetchFn = customFetch || fetch;
    const now = new Date().toISOString();
    const response = await fetchFn(
      `${BRIDGE_URL}/api/bridge/products?where[and][0][seller][equals]=${sellerId}&where[and][1][or][0][status][equals]=sold&where[and][1][or][1][status][equals]=ended&where[and][1][or][2][and][0][status][equals]=available&where[and][1][or][2][and][1][auctionEndDate][less_than_equal]=${now}&depth=1`,
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

export async function fetchProduct(id: string, customFetch?: typeof fetch): Promise<Product | null> {
  try {
    const fetchFn = customFetch || fetch;
    const response = await fetchFn(`${BRIDGE_URL}/api/bridge/products/${id}?depth=1`, {
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

export async function createProduct(productData: {
  title: string;
  description: string;
  keywords?: Array<{ keyword: string }>;
  startingPrice: number;
  bidInterval?: number;
  autoExtendMinutes?: number;
  auctionEndDate: string;
  images?: Array<{ image: string }>;
  region?: string;
  city?: string;
  delivery_options?: 'delivery' | 'meetup' | 'both';
  categories?: string[];
}): Promise<Product | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/products`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(productData),
    });

    if (!response.ok) {
      const msg = await extractErrorMessage(response, 'Failed to create product');
      console.error('Failed to create product:', response.status, msg);
      throw new Error(msg);
    }

    const data = await response.json();
    return data.doc || data;
  } catch (error) {
    console.error('Error creating product:', error);
    return null;
  }
}

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
    categories?: string[];
  }
): Promise<Product | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${BRIDGE_URL}/api/bridge/products/${productId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(productData),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const msg = await extractErrorMessage(response, 'Failed to update product');
      console.error('Update failed with status:', response.status, msg);
      throw new Error(msg);
    }

    const result = await response.json();
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
