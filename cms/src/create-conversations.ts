import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_URL = process.env.SERVER_URL || 'http://localhost:3001';

async function createConversationsForSoldProducts() {
  console.log('Starting conversation creation for sold products...\n');

  try {
    // You'll need to be logged in as admin to run this
    // Get admin credentials
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.ADMIN_PASSWORD || 'admin';

    // Login to get token
    console.log('Logging in as admin...');
    const loginResponse = await fetch(`${API_URL}/api/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!loginResponse.ok) {
      throw new Error('Failed to login. Please create an admin user first or set ADMIN_EMAIL and ADMIN_PASSWORD.');
    }

    const loginData: any = await loginResponse.json();
    const { token } = loginData;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `JWT ${token}`,
    };

    // Find all sold products
    const productsResponse = await fetch(`${API_URL}/api/products?where[status][equals]=sold&limit=1000`, {
      headers,
    });
    const productsData: any = await productsResponse.json();
    const soldProducts = productsData.docs || [];

    console.log(`Found ${soldProducts.length} sold products\n`);

    let conversationsCreated = 0;
    let skipped = 0;

    for (const product of soldProducts) {
      try {
        // Check if conversation already exists
        const messagesResponse = await fetch(`${API_URL}/api/messages?where[product][equals]=${product.id}&limit=1`, {
          headers,
        });
        const messagesData: any = await messagesResponse.json();

        if (messagesData.docs && messagesData.docs.length > 0) {
          console.log(`⏭️  Skipped: "${product.title}" (conversation already exists)`);
          skipped++;
          continue;
        }

        // Find the highest bidder
        const bidsResponse = await fetch(`${API_URL}/api/bids?where[product][equals]=${product.id}&sort=-amount&limit=1`, {
          headers,
        });
        const bidsData: any = await bidsResponse.json();

        if (!bidsData.docs || bidsData.docs.length === 0) {
          console.log(`⚠️  Skipped: "${product.title}" (no bids found)`);
          skipped++;
          continue;
        }

        const highestBid = bidsData.docs[0];
        const bidderId = typeof highestBid.bidder === 'object' ? highestBid.bidder.id : highestBid.bidder;
        const sellerId = typeof product.seller === 'object' ? product.seller.id : product.seller;

        // Create initial message from seller to buyer
        const createMessageResponse = await fetch(`${API_URL}/api/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            product: product.id,
            sender: sellerId,
            receiver: bidderId,
            message: `Congratulations! Your bid has been accepted for "${product.title}". Let's discuss the next steps for completing this transaction.`,
            read: false,
          }),
        });

        if (createMessageResponse.ok) {
          console.log(`✅ Created conversation for: "${product.title}"`);
          conversationsCreated++;
        } else {
          console.error(`❌ Failed to create conversation for "${product.title}"`);
        }
      } catch (error) {
        console.error(`❌ Error processing "${product.title}":`, error);
      }
    }

    console.log('\n==============================================');
    console.log(`Summary:`);
    console.log(`  Total sold products: ${soldProducts.length}`);
    console.log(`  Conversations created: ${conversationsCreated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log('==============================================\n');

    process.exit(0);
  } catch (error: any) {
    console.error('Fatal error:', error.message || error);
    process.exit(1);
  }
}

// Run the script
createConversationsForSoldProducts().catch(console.error);
