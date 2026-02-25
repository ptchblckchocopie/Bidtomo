#!/usr/bin/env node

/**
 * Seed test data for stress testing.
 * Creates 20 test users and 10 test products.
 *
 * Usage:
 *   node seed-data.js                  # Seed data
 *   node seed-data.js --cleanup        # Remove test data
 *
 * Environment:
 *   CMS_URL (default: http://localhost:3001)
 */

const CMS_URL = process.env.CMS_URL || 'http://localhost:3001';
const USER_COUNT = 20;
const PRODUCT_COUNT = 10;
const PASSWORD = 'StressTest123!';
const OUTPUT_FILE = 'seed-data.json';

const fs = require('fs');
const path = require('path');

async function apiCall(method, endpoint, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `JWT ${token}`;

  const res = await fetch(`${CMS_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

async function seed() {
  console.log(`Seeding test data against ${CMS_URL}...`);
  const users = [];
  const products = [];

  // Create test users
  console.log(`\nCreating ${USER_COUNT} test users...`);
  for (let i = 1; i <= USER_COUNT; i++) {
    const num = String(i).padStart(2, '0');
    const email = `stresstest-user-${num}@test.com`;
    const username = `stresstest-user-${num}`;

    const res = await apiCall('POST', '/api/users', {
      email,
      password: PASSWORD,
      username,
      role: 'buyer',
    });

    if (res.status === 200 || res.status === 201) {
      console.log(`  [+] Created user: ${email} (id: ${res.data.doc?.id || res.data.id})`);
      users.push({
        id: res.data.doc?.id || res.data.id,
        email,
        password: PASSWORD,
        username,
      });
    } else if (res.status === 400 && JSON.stringify(res.data).includes('unique')) {
      // User already exists, try to login to get their ID
      const loginRes = await apiCall('POST', '/api/users/login', { email, password: PASSWORD });
      if (loginRes.status === 200) {
        console.log(`  [=] User exists: ${email} (id: ${loginRes.data.user?.id})`);
        users.push({
          id: loginRes.data.user?.id,
          email,
          password: PASSWORD,
          username,
        });
      } else {
        console.log(`  [!] User exists but login failed: ${email} (status: ${loginRes.status})`);
      }
    } else {
      console.log(`  [!] Failed to create user: ${email} (status: ${res.status})`);
    }
  }

  if (users.length === 0) {
    console.error('No users created. Aborting.');
    process.exit(1);
  }

  // Login as first user (seller for products)
  const sellerLogin = await apiCall('POST', '/api/users/login', {
    email: users[0].email,
    password: PASSWORD,
  });

  if (sellerLogin.status !== 200) {
    console.error('Failed to login as seller. Aborting.');
    process.exit(1);
  }

  const sellerToken = sellerLogin.data.token;

  // Create test products
  console.log(`\nCreating ${PRODUCT_COUNT} test products...`);
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now

  for (let i = 1; i <= PRODUCT_COUNT; i++) {
    const res = await apiCall(
      'POST',
      '/api/products',
      {
        title: `Stress Test Product ${i}`,
        description: `Test product #${i} for stress testing. This is not a real listing.`,
        startingPrice: 100 + i * 10,
        bidInterval: 10,
        status: 'active',
        active: true,
        auctionEndDate: futureDate,
        region: 'NCR',
        city: 'Manila',
        condition: 'new',
      },
      sellerToken
    );

    if (res.status === 200 || res.status === 201) {
      const productId = res.data.doc?.id || res.data.id;
      console.log(`  [+] Created product: "Stress Test Product ${i}" (id: ${productId})`);
      products.push({
        id: productId,
        title: `Stress Test Product ${i}`,
        startingPrice: 100 + i * 10,
        bidInterval: 10,
      });
    } else {
      console.log(`  [!] Failed to create product ${i} (status: ${res.status}): ${JSON.stringify(res.data).slice(0, 200)}`);
    }
  }

  // Write seed data to file
  const seedData = {
    createdAt: new Date().toISOString(),
    cmsUrl: CMS_URL,
    users,
    products,
    seller: {
      id: users[0].id,
      email: users[0].email,
      token: sellerToken,
    },
  };

  const outputPath = path.join(__dirname, OUTPUT_FILE);
  fs.writeFileSync(outputPath, JSON.stringify(seedData, null, 2));
  console.log(`\nSeed data written to ${outputPath}`);
  console.log(`  Users: ${users.length}`);
  console.log(`  Products: ${products.length}`);
}

async function cleanup() {
  console.log(`Cleaning up test data from ${CMS_URL}...`);

  const outputPath = path.join(__dirname, OUTPUT_FILE);
  if (!fs.existsSync(outputPath)) {
    console.log('No seed-data.json found. Nothing to clean up.');
    return;
  }

  const seedData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));

  // Login as admin or first user to delete
  const loginRes = await apiCall('POST', '/api/users/login', {
    email: seedData.users[0].email,
    password: PASSWORD,
  });

  if (loginRes.status !== 200) {
    console.error('Failed to login for cleanup.');
    return;
  }

  const token = loginRes.data.token;

  // Delete products
  console.log('\nDeleting test products...');
  for (const product of seedData.products) {
    const res = await apiCall('DELETE', `/api/products/${product.id}`, null, token);
    console.log(`  ${res.status === 200 ? '[+]' : '[!]'} Product ${product.id}: ${res.status}`);
  }

  // Delete users (may require admin)
  console.log('\nDeleting test users...');
  for (const user of seedData.users) {
    const res = await apiCall('DELETE', `/api/users/${user.id}`, null, token);
    console.log(`  ${res.status === 200 ? '[+]' : '[!]'} User ${user.email}: ${res.status}`);
  }

  // Remove seed data file
  fs.unlinkSync(outputPath);
  console.log('\nCleanup complete. seed-data.json removed.');
}

// Main
const isCleanup = process.argv.includes('--cleanup');
(isCleanup ? cleanup : seed)().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
