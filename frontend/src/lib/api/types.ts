export interface Product {
  id: string;
  title: string;
  description: string;
  keywords?: Array<{
    keyword: string;
  }>;
  startingPrice: number;
  bidInterval: number;
  autoExtendMinutes?: number;
  currentBid?: number;
  auctionEndDate: string;
  active: boolean;
  status: 'available' | 'sold' | 'ended';
  region?: string;
  city?: string;
  delivery_options?: 'delivery' | 'meetup' | 'both';
  categories?: string[];
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
      sizes?: {
        thumbnail?: { url?: string; width?: number; height?: number };
        card?: { url?: string; width?: number; height?: number };
      };
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
  profilePicture?: {
    id: string;
    url: string;
    filename: string;
  } | string | null;
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
  profilePicture?: {
    id: string;
    url: string;
    filename: string;
  } | string | null;
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

export interface Report {
  id: string;
  product: Product | string;
  reporter: User | string;
  reason: 'spam' | 'inappropriate' | 'scam' | 'counterfeit' | 'other';
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved';
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsDashboard {
  period: { from: string; to: string };
  overview: {
    totalUsers: number;
    activeUsers7d: number;
    totalProducts: number;
    productsSold: number;
    totalBids: number;
    totalSearches: number;
  };
  timeSeries: {
    labels: string[];
    registrations: number[];
    bids: number[];
    productViews: number[];
    searches: number[];
    productsSold: number[];
  };
  topSearchKeywords: { keyword: string; count: number }[];
  topViewedProducts: { id: number; title: string; views: number }[];
  topSoldProducts: { id: number; title: string; sales: number }[];
  eventBreakdown: { eventType: string; count: number }[];
}
