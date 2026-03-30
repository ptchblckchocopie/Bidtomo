import { test, expect, type Page } from '@playwright/test';

// Reusable login helper (same as sell-page.spec.ts)
async function login(page: Page, email = 'test@playwright.dev', password = 'Test1234') {
  let res = await page.request.post('http://localhost:3001/api/users/login', {
    data: { email, password },
  });

  if (!res.ok()) {
    await page.request.post('http://localhost:3001/api/users', {
      data: { email, password, name: 'PW Test', role: 'buyer', countryCode: '+63', phoneNumber: '9000000000' },
    });
    res = await page.request.post('http://localhost:3001/api/users/login', {
      data: { email, password },
    });
    if (!res.ok()) throw new Error(`Login failed: ${res.status()}`);
  }

  const data = await res.json();

  await page.goto('/');
  await page.evaluate(({ token, user }: { token: string; user: unknown }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_data', JSON.stringify(user));
  }, { token: data.token, user: data.user });

  await page.context().addCookies([{
    name: 'auth_token',
    value: data.token,
    domain: 'localhost',
    path: '/',
  }]);

  await page.reload();
  await page.waitForTimeout(1000);
}

test.describe('Browse & Product Detail', () => {

  test('products page loads and shows grid', async ({ page }) => {
    await page.goto('/products');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Should show product cards or empty state
    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(100);

    // Title should contain BidMo
    const title = await page.title();
    expect(title).toContain('BidMo');
  });

  test('product detail page loads for existing product', async ({ page, request }) => {
    // Get a product ID from API
    const res = await request.get('http://localhost:3001/api/products?limit=1&depth=0');
    const data = await res.json();

    if (data.docs.length === 0) {
      test.skip(true, 'No products in database');
      return;
    }

    const productId = data.docs[0].id;
    await page.goto(`/products/${productId}`);
    // Wait for product title to appear in page title (SPA sets it after hydration)
    await page.waitForFunction(
      (expected) => document.title.includes(expected),
      data.docs[0].title,
      { timeout: 15000 }
    );
  });

  test('product detail has SEO meta tags', async ({ page, request }) => {
    const res = await request.get('http://localhost:3001/api/products?limit=1&depth=0');
    const data = await res.json();

    if (data.docs.length === 0) {
      test.skip(true, 'No products in database');
      return;
    }

    await page.goto(`/products/${data.docs[0].id}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await page.waitForTimeout(2000);

    // Check OG tags
    const ogTitle = await page.getAttribute('meta[property="og:title"]', 'content');
    expect(ogTitle).toBeTruthy();

    const ogDesc = await page.getAttribute('meta[property="og:description"]', 'content');
    expect(ogDesc).toBeTruthy();
  });

  test('404 for non-existent product', async ({ page }) => {
    await page.goto('/products/999999');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await page.waitForTimeout(2000);

    const body = await page.textContent('body');
    // Should show error or redirect — not crash
    expect(body!.length).toBeGreaterThan(50);
  });
});

test.describe('Bidding', () => {

  test('unauthenticated user cannot place bid', async ({ page, request }) => {
    const res = await request.get('http://localhost:3001/api/products?limit=1&depth=0&where[status][equals]=available');
    const data = await res.json();

    if (data.docs.length === 0) {
      test.skip(true, 'No available products');
      return;
    }

    await page.goto(`/products/${data.docs[0].id}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await page.waitForTimeout(2000);

    // Bid section should show login prompt or be disabled
    const body = await page.textContent('body');
    const hasLoginPrompt = body!.includes('Login') || body!.includes('Sign in') || body!.includes('log in');
    const hasBidButton = await page.locator('button:has-text("Place Bid")').isVisible().catch(() => false);

    // Either show login prompt OR bid button should not be visible
    expect(hasLoginPrompt || !hasBidButton).toBeTruthy();
  });

  test('bid API rejects shill bid (seller bidding on own product)', async ({ request }) => {
    // Create a seller user
    const sellerEmail = `seller-shill-${Date.now()}@test.dev`;
    await request.post('http://localhost:3001/api/users', {
      data: { email: sellerEmail, password: 'Test1234', name: 'Shill Test Seller', role: 'buyer', countryCode: '+63', phoneNumber: '9000000099' },
    });

    const loginRes = await request.post('http://localhost:3001/api/users/login', {
      data: { email: sellerEmail, password: 'Test1234' },
    });
    const { token } = await loginRes.json();

    // Create a product as this seller
    const productRes = await request.post('http://localhost:3001/api/products', {
      headers: { Authorization: `JWT ${token}` },
      data: {
        title: 'Shill Test Product',
        description: 'Testing shill bid prevention',
        startingPrice: 100,
        bidInterval: 10,
        auctionEndDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        active: true,
        status: 'available',
      },
    });

    if (!productRes.ok()) {
      test.skip(true, 'Could not create test product');
      return;
    }

    const product = await productRes.json();

    // Try to bid on own product
    const bidRes = await request.post('http://localhost:3001/api/bid/queue', {
      headers: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' },
      data: { productId: product.doc.id, amount: 100 },
    });

    const bidData = await bidRes.json();
    // Should be rejected
    expect(bidData.error).toContain('own product');
  });

  test('bid API rejects bid below minimum', async ({ request }) => {
    // Get an available product
    const res = await request.get('http://localhost:3001/api/products?limit=1&depth=0&where[status][equals]=available');
    const data = await res.json();

    if (data.docs.length === 0) {
      test.skip(true, 'No available products');
      return;
    }

    // Create a bidder user
    const bidderEmail = `bidder-min-${Date.now()}@test.dev`;
    await request.post('http://localhost:3001/api/users', {
      data: { email: bidderEmail, password: 'Test1234', name: 'Min Bid Test', role: 'buyer', countryCode: '+63', phoneNumber: '9000000098' },
    });

    const loginRes = await request.post('http://localhost:3001/api/users/login', {
      data: { email: bidderEmail, password: 'Test1234' },
    });
    const { token } = await loginRes.json();

    // Try to bid below starting price
    const bidRes = await request.post('http://localhost:3001/api/bid/queue', {
      headers: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' },
      data: { productId: data.docs[0].id, amount: 1 },
    });

    const bidData = await bidRes.json();
    expect(bidData.error).toBeTruthy();
  });
});

test.describe('Health & API', () => {

  test('health endpoint returns expanded data', async ({ request }) => {
    const res = await request.get('http://localhost:3001/api/health');
    const data = await res.json();

    expect(data.postgres).toBeDefined();
    expect(data.redis).toBeDefined();
    expect(data.pendingExpiredAuctions).toBeDefined();
    expect(data.emailQueueDepth).toBeDefined();
    expect(data.pendingBidsBacklog).toBeDefined();
    expect(data.timestamp).toBeDefined();
  });

  test('bridge sanitizer blocks PII field queries', async ({ page }) => {
    await page.goto('/');

    // Try to query user emails through bridge
    const res = await page.request.get('/api/bridge/products?where[seller.email][like]=%25&depth=5');

    if (res.ok()) {
      const data = await res.json();
      // Should return products but without email leak
      if (data.docs?.length > 0) {
        const seller = data.docs[0].seller;
        if (typeof seller === 'object') {
          expect(seller.email).toBeUndefined();
        }
      }
    }
  });
});
