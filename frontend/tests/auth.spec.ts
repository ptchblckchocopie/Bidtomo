import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {

  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    // Wait for SPA to hydrate — look for any input appearing
    await page.locator('input').first().waitFor({ state: 'visible', timeout: 15000 });
    const count = await page.locator('input').count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('register page renders', async ({ page }) => {
    await page.goto('/register');
    await page.locator('input').first().waitFor({ state: 'visible', timeout: 15000 });
    const count = await page.locator('input').count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('login with wrong credentials stays on login page', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input').first().waitFor({ state: 'visible', timeout: 15000 });

    const inputs = page.locator('input');
    await inputs.nth(0).fill('wrong@example.com');
    await inputs.nth(1).fill('WrongPassword1');

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);

    expect(page.url()).toContain('/login');
  });

  test('weak password rejected on registration', async ({ page, request }) => {
    // Try to register via API with weak password
    const res = await request.post('http://localhost:3001/api/users', {
      data: {
        email: `weakpw-${Date.now()}@test.dev`,
        password: 'abc',
        name: 'Weak PW Test',
        role: 'buyer',
        countryCode: '+63',
        phoneNumber: '9000000001',
      },
    });

    // Should be rejected (400 or 500 with error about password strength)
    if (res.ok()) {
      // If it somehow succeeded, the hook should have blocked it
      const data = await res.json();
      expect(data.errors).toBeDefined();
    } else {
      expect(res.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('successful login via API sets auth token', async ({ page, request }) => {
    const email = `e2e-auth-${Date.now()}@test.dev`;
    const password = 'TestPass123';

    // Create user (ignore if already exists)
    const createRes = await request.post('http://localhost:3001/api/users', {
      data: { email, password, name: 'E2E Auth Test', role: 'buyer', countryCode: '+63', phoneNumber: '9000000002' },
    });

    // Login via API
    const res = await request.post('http://localhost:3001/api/users/login', {
      data: { email, password },
    });

    if (!res.ok()) {
      const err = await res.json().catch(() => ({}));
      // Skip if rate limited (previous test runs hit the limiter)
      if (res.status() === 429) {
        test.skip(true, 'Rate limited — try again in 15 minutes');
        return;
      }
      console.log('Create status:', createRes.status(), 'Login error:', JSON.stringify(err));
    }
    expect(res.ok()).toBeTruthy();

    const data = await res.json();
    expect(data.token).toBeTruthy();
    expect(data.user.email).toBe(email);

    // Inject token into browser and verify it persists
    await page.goto('/');
    await page.evaluate(({ token, user }: { token: string; user: unknown }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user_data', JSON.stringify(user));
    }, { token: data.token, user: data.user });

    await page.reload();
    await page.waitForTimeout(2000);

    const storedToken = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(storedToken).toBe(data.token);
  });
});
