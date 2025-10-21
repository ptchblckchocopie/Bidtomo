// Script to sync product currentBid with highest bid in bid history
// Run this once to fix existing products that have bids

const payload = require('payload');
require('dotenv').config();

async function syncProductBids() {
  try {
    // Initialize Payload
    await payload.init({
      secret: process.env.PAYLOAD_SECRET || 'your-secret-key',
      mongoURL: process.env.DATABASE_URL,
      local: true,
    });

    console.log('Fetching all bids...');

    // Fetch all bids
    const bids = await payload.find({
      collection: 'bids',
      limit: 1000,
      sort: '-amount',
    });

    console.log(`Found ${bids.docs.length} bids`);

    // Group bids by product and find highest bid for each
    const productBids = {};

    for (const bid of bids.docs) {
      const productId = typeof bid.product === 'string' ? bid.product : bid.product.id;

      if (!productBids[productId] || bid.amount > productBids[productId]) {
        productBids[productId] = bid.amount;
      }
    }

    console.log(`Updating ${Object.keys(productBids).length} products...`);

    // Update each product with its highest bid
    for (const [productId, highestBid] of Object.entries(productBids)) {
      try {
        await payload.update({
          collection: 'products',
          id: productId,
          data: {
            currentBid: highestBid,
          },
        });
        console.log(`Updated product ${productId} with currentBid: ${highestBid}`);
      } catch (error) {
        console.error(`Error updating product ${productId}:`, error.message);
      }
    }

    console.log('Sync complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

syncProductBids();
