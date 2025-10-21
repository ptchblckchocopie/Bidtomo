import payload from 'payload';
import dotenv from 'dotenv';

dotenv.config();

async function createConversationsForSoldProducts() {
  console.log('Starting conversation creation for sold products...\n');

  try {
    // Initialize Payload
    await payload.init({
      secret: process.env.PAYLOAD_SECRET || '',
      mongoURL: process.env.DATABASE_URL || '',
      local: true,
    });

    // Find all sold products
    const soldProducts = await payload.find({
      collection: 'products',
      where: {
        status: {
          equals: 'sold',
        },
      },
      limit: 1000,
    });

    console.log(`Found ${soldProducts.docs.length} sold products\n`);

    let conversationsCreated = 0;
    let skipped = 0;

    for (const product of soldProducts.docs) {
      try {
        // Check if conversation already exists
        const existingMessages = await payload.find({
          collection: 'messages',
          where: {
            product: {
              equals: product.id,
            },
          },
          limit: 1,
        });

        if (existingMessages.docs && existingMessages.docs.length > 0) {
          console.log(`⏭️  Skipped: "${product.title}" (conversation already exists)`);
          skipped++;
          continue;
        }

        // Find the highest bidder
        const bids = await payload.find({
          collection: 'bids',
          where: {
            product: {
              equals: product.id,
            },
          },
          sort: '-amount',
          limit: 1,
        });

        if (!bids.docs || bids.docs.length === 0) {
          console.log(`⚠️  Skipped: "${product.title}" (no bids found)`);
          skipped++;
          continue;
        }

        const highestBid: any = bids.docs[0];
        const bidderId = typeof highestBid.bidder === 'object' && highestBid.bidder ? highestBid.bidder.id : highestBid.bidder;
        const sellerId = typeof product.seller === 'object' && product.seller ? (product.seller as any).id : product.seller;

        // Create initial message from seller to buyer
        await payload.create({
          collection: 'messages',
          data: {
            product: product.id,
            sender: sellerId,
            receiver: bidderId,
            message: `Congratulations! Your bid has been accepted for "${product.title}". Let's discuss the next steps for completing this transaction.`,
            read: false,
          },
        });

        console.log(`✅ Created conversation for: "${product.title}"`);
        conversationsCreated++;
      } catch (error) {
        console.error(`❌ Error processing "${product.title}":`, error);
      }
    }

    console.log('\n==============================================');
    console.log(`Summary:`);
    console.log(`  Total sold products: ${soldProducts.docs.length}`);
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
