import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { productListDuration, productDetailDuration, searchDuration, track } from '../helpers/report.js';

/**
 * Browse Journey — simulates users browsing the marketplace.
 * Paginated product listing, viewing details, searching.
 * Tests read-heavy database load.
 */

const CMS_URL = __ENV.CMS_URL || 'http://localhost:3001';
const VUS = parseInt(__ENV.VUS) || 50;

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: Math.floor(VUS / 2) },
        { duration: '1m', target: VUS },
        { duration: '1m', target: VUS },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    product_list_duration: ['p(95)<400', 'p(99)<1000'],
    product_detail_duration: ['p(95)<300', 'p(99)<700'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function () {
  let productIds = [];

  // Browse product listing (paginate through first 3 pages)
  group('product_listing', () => {
    for (let page = 1; page <= 3; page++) {
      const res = http.get(
        `${CMS_URL}/api/products?limit=12&page=${page}&where[status][equals]=active&where[active][equals]=true`,
        { tags: { name: 'GET /api/products' } }
      );

      track(productListDuration, res);

      check(res, {
        'product list 200': (r) => r.status === 200,
        'has docs array': (r) => {
          try { return Array.isArray(JSON.parse(r.body).docs); } catch { return false; }
        },
      });

      // Collect product IDs for detail views
      if (res.status === 200) {
        try {
          const docs = JSON.parse(res.body).docs || [];
          productIds.push(...docs.map((d) => d.id).filter(Boolean));
        } catch { /* ignore */ }
      }

      sleep(Math.random() * 1 + 0.5); // Think time between pages
    }
  });

  // View product details (pick 2-3 random products)
  group('product_detail', () => {
    const viewCount = Math.min(3, productIds.length);
    for (let i = 0; i < viewCount; i++) {
      const randomIndex = Math.floor(Math.random() * productIds.length);
      const productId = productIds[randomIndex];

      const res = http.get(`${CMS_URL}/api/products/${productId}`, {
        tags: { name: 'GET /api/products/:id' },
      });

      track(productDetailDuration, res);

      check(res, {
        'product detail 200': (r) => r.status === 200,
      });

      sleep(Math.random() * 2 + 1); // Spend time reading the product
    }
  });

  // Search (1 search per browse session)
  group('product_search', () => {
    const searchTerms = ['phone', 'laptop', 'watch', 'bag', 'shoes', 'camera', 'test'];
    const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

    const res = http.get(`${CMS_URL}/api/products/search?q=${term}&limit=12`, {
      tags: { name: 'GET /api/products/search' },
    });

    track(searchDuration, res);

    check(res, {
      'search responds': (r) => r.status === 200,
    });
  });

  sleep(Math.random() * 2 + 1);
}
