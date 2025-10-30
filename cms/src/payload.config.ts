import { buildConfig } from 'payload/config';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { webpackBundler } from '@payloadcms/bundler-webpack';
import path from 'path';
import { s3Adapter } from '@payloadcms/plugin-cloud-storage/s3';
import { cloudStorage } from '@payloadcms/plugin-cloud-storage';
import { authenticateJWT } from './auth-helpers';

// Configure S3 adapter for DigitalOcean Spaces
const adapter = s3Adapter({
  config: {
    credentials: {
      accessKeyId: (process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID)!,
      secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY)!
    },
    region: process.env.S3_REGION || 'ap-southeast-1',
    endpoint: process.env.S3_ENDPOINT || 'https://sgp1.digitaloceanspaces.com'
  },
  bucket: process.env.S3_BUCKET || 'veent',
  acl: 'public-read'
});

export default buildConfig({
  serverURL: process.env.SERVER_URL || 'https://app.bidmo.to',
  cors: [
    'http://localhost:5173',
    'http://localhost:3001',
    'http://192.168.18.117:5173',
    'http://192.168.18.117:3001',
    'https://www.bidmo.to',
    'https://bidmo.to',
    'https://app.bidmo.to',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ],
  csrf: [
    'http://localhost:5173',
    'http://localhost:3001',
    'http://192.168.18.117:5173',
    'http://192.168.18.117:3001',
    'https://www.bidmo.to',
    'https://bidmo.to',
    'https://app.bidmo.to',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ],
  admin: {
    user: 'users',
    bundler: webpackBundler(),
    disable: process.env.VERCEL === '1', // Disable admin UI on Vercel serverless
    webpack: (config) => {
      // Externalize Node.js built-in modules and auth helpers for the admin bundle
      const existingExternals = config.externals && typeof config.externals === 'object' ? config.externals : {};
      config.externals = {
        ...existingExternals,
        fs: 'commonjs fs',
        path: 'commonjs path',
        './auth-helpers': 'commonjs ./auth-helpers',
        'jsonwebtoken': 'commonjs jsonwebtoken',
      };
      return config;
    },
  },
  editor: lexicalEditor({}),

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || process.env.DATABASE_URL || 'postgresql://localhost:5432/marketplace',
    },
    migrationDir: path.resolve(__dirname, '../migrations'),
    ...(process.env.NODE_ENV === 'production' && {
      ssl: process.env.DATABASE_CA_CERT ? {
        rejectUnauthorized: true,
        ca: process.env.DATABASE_CA_CERT,
      } : {
        rejectUnauthorized: false, // Accept self-signed certificates
      },
    }),
  }),
  collections: [
    {
      slug: 'users',
      auth: true,
      admin: {
        useAsTitle: 'email',
      },
      access: {
        read: () => true,
        create: () => true,
        update: ({ req }) => !!req.user,
        delete: ({ req }) => req.user?.role === 'admin',
      },
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
        },
        {
          name: 'role',
          type: 'select',
          options: [
            { label: 'Admin', value: 'admin' },
            { label: 'Seller', value: 'seller' },
            { label: 'Buyer', value: 'buyer' },
          ],
          defaultValue: 'buyer',
          required: true,
        },
        {
          name: 'currency',
          type: 'select',
          options: [
            { label: 'PHP - Philippine Peso', value: 'PHP' },
            { label: 'USD - US Dollar', value: 'USD' },
            { label: 'EUR - Euro', value: 'EUR' },
            { label: 'GBP - British Pound', value: 'GBP' },
            { label: 'JPY - Japanese Yen', value: 'JPY' },
          ],
          defaultValue: 'PHP',
          required: true,
          admin: {
            description: 'Your preferred currency for transactions',
          },
        },
      ],
    },
    {
      slug: 'products',
      admin: {
        useAsTitle: 'title',
      },
      access: {
        read: () => true,
        create: ({ req }) => !!req.user,
        update: ({ req, id }) => {
          // Admins can update any product
          if (req.user?.role === 'admin') return true;

          // All authenticated users can update (seller check is in beforeChange hook)
          return !!req.user;
        },
        delete: ({ req }) => req.user?.role === 'admin',
      },
      hooks: {
        beforeChange: [
          ({ req, data, operation }) => {
            // Automatically set seller to the logged-in user if not provided
            if (req.user && !data.seller) {
              data.seller = req.user.id;
            }

            return data;
          },
        ],
        beforeValidate: [
          async ({ req, data, operation, originalDoc }) => {
            // Check if user owns the product (except for admins)
            if (operation === 'update' && req.user?.role !== 'admin') {
              const sellerId = typeof originalDoc?.seller === 'object'
                ? originalDoc.seller.id
                : originalDoc?.seller;

              if (sellerId !== req.user?.id) {
                throw new Error('You can only edit your own products');
              }

              // Prevent editing sold products
              if (originalDoc?.status === 'sold') {
                throw new Error('Cannot edit products that have been sold');
              }

              // Prevent editing startingPrice if there are already bids
              if (data && data.startingPrice !== undefined && data.startingPrice !== originalDoc?.startingPrice) {
                const existingBids = await req.payload.find({
                  collection: 'bids',
                  where: {
                    product: {
                      equals: originalDoc.id,
                    },
                  },
                  limit: 1,
                });

                if (existingBids.docs.length > 0) {
                  throw new Error('Cannot change starting price after bids have been placed');
                }
              }
            }
            return data;
          },
        ],
        afterChange: [
          async ({ req, doc, operation, previousDoc }) => {
            // Create automatic conversation when product is sold
            if (operation === 'update' && doc.status === 'sold' && previousDoc?.status !== 'sold') {
              // Run in background without blocking the response
              setImmediate(async () => {
                try {
                  // Find the highest bidder
                  const bids = await req.payload.find({
                    collection: 'bids',
                    where: {
                      product: {
                        equals: doc.id,
                      },
                    },
                    sort: '-amount',
                    limit: 1,
                  });

                  if (bids.docs.length > 0) {
                    const highestBid: any = bids.docs[0];
                    const bidderId = typeof highestBid.bidder === 'object' && highestBid.bidder ? highestBid.bidder.id : highestBid.bidder;
                    const sellerId = typeof doc.seller === 'object' && doc.seller ? (doc.seller as any).id : doc.seller;

                    // Create initial message from seller to buyer
                    await req.payload.create({
                      collection: 'messages',
                      data: {
                        product: doc.id,
                        sender: sellerId,
                        receiver: bidderId,
                        message: `Congratulations! Your bid has been accepted for "${doc.title}". Let's discuss the next steps for completing this transaction.`,
                        read: false,
                      },
                    });

                    // Create transaction record
                    await req.payload.create({
                      collection: 'transactions',
                      data: {
                        product: doc.id,
                        seller: sellerId,
                        buyer: bidderId,
                        amount: highestBid.amount,
                        status: 'pending',
                        notes: `Transaction created for "${doc.title}" with winning bid of ${highestBid.amount}`,
                      },
                    });

                    console.log(`Auto-created conversation and transaction for sold product: ${doc.title} (ID: ${doc.id})`);
                  }
                } catch (error) {
                  console.error('Error creating automatic conversation:', error);
                }
              });
            }

            // Broadcast product update via SSE for any product change
            if (operation === 'update') {
              const broadcast = (global as any).broadcastProductUpdate;
              if (broadcast) {
                setImmediate(() => {
                  broadcast(String(doc.id));
                });
              }
            }

            return doc;
          },
        ],
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'description',
          type: 'textarea',
          required: true,
        },
        {
          name: 'keywords',
          type: 'array',
          admin: {
            description: 'Keywords for search and SEO purposes',
          },
          fields: [
            {
              name: 'keyword',
              type: 'text',
              required: true,
            },
          ],
        },
        {
          name: 'images',
          type: 'array',
          minRows: 1,
          maxRows: 5,
          admin: {
            description: 'Upload 1-5 product images',
          },
          fields: [
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              required: true,
            },
          ],
        },
        {
          name: 'startingPrice',
          type: 'number',
          required: true,
          min: 100,
          admin: {
            description: 'Minimum starting price: 100',
          },
        },
        {
          name: 'bidInterval',
          type: 'number',
          required: true,
          defaultValue: 1,
          min: 1,
          admin: {
            description: 'Minimum increment for each bid',
          },
        },
        {
          name: 'currentBid',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'seller',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          admin: {
            readOnly: true,
            position: 'sidebar',
            description: 'Automatically set to the current user',
          },
        },
        {
          name: 'auctionEndDate',
          type: 'date',
          required: true,
          defaultValue: () => {
            const tomorrow = new Date();
            tomorrow.setHours(tomorrow.getHours() + 24);
            return tomorrow.toISOString();
          },
          validate: (value: string) => {
            if (!value) return true; // Allow empty for now, required will catch it

            const auctionEnd = new Date(value);
            const now = new Date();

            // Add 30 seconds buffer to account for request processing time
            const minTime = new Date(now.getTime() - 30000);

            if (auctionEnd <= minTime) {
              return 'Auction end date must be in the future';
            }

            return true;
          },
          admin: {
            date: {
              pickerAppearance: 'dayAndTime',
              displayFormat: 'PPpp', // Shows date and time in user's locale
            },
            description: 'Auction end date and time (24 hours from now by default)',
          },
        },
        {
          name: 'region',
          type: 'text',
          admin: {
            description: 'Region/Province where the product is located',
          },
        },
        {
          name: 'city',
          type: 'text',
          admin: {
            description: 'City/Municipality where the product is located',
          },
        },
        {
          name: 'delivery_options',
          type: 'select',
          options: [
            { label: 'Delivery', value: 'delivery' },
            { label: 'Meetup', value: 'meetup' },
            { label: 'Both', value: 'both' },
          ],
          admin: {
            description: 'How the buyer can receive the product',
          },
        },
        {
          name: 'active',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description: 'Product is active and visible on Browse Products page',
            position: 'sidebar',
          },
        },
        {
          name: 'status',
          type: 'select',
          options: [
            { label: 'Available', value: 'available' },
            { label: 'Sold', value: 'sold' },
            { label: 'Ended', value: 'ended' },
          ],
          defaultValue: 'available',
          admin: {
            readOnly: true,
            description: 'System-managed status',
            position: 'sidebar',
          },
        },
      ],
    },
    {
      slug: 'bids',
      admin: {
        useAsTitle: 'id',
      },
      access: {
        read: () => true,
        create: async ({ req }) => {
          console.log('Bid create access check - req.user:', req.user?.id, req.user?.email);

          // Try to authenticate via JWT if not already authenticated
          const user = await authenticateJWT(req);

          if (user) {
            console.log('Bid create access result: true');
            return true;
          }

          console.log('Bid create access result: false (no valid auth)');
          return false;
        },
        update: ({ req }) => req.user?.role === 'admin',
        delete: ({ req }) => req.user?.role === 'admin',
      },
      hooks: {
        beforeChange: [
          async ({ req, data, operation }) => {
            // Convert product to integer if it's a string
            if (typeof data.product === 'string') {
              data.product = parseInt(data.product, 10);
            }

            // Automatically set bidder to the logged-in user if not provided
            if (req.user && !data.bidder) {
              data.bidder = req.user.id;
            }
            // Set bid time to now if not provided
            if (!data.bidTime) {
              data.bidTime = new Date().toISOString();
            }

            return data;
          },
        ],
        afterChange: [
          async ({ req, doc, operation }) => {
            // Update product's currentBid when a new bid is created
            // Run asynchronously without blocking response
            if (operation === 'create' && doc.product && doc.amount) {
              setImmediate(async () => {
                try {
                  let productId: any = doc.product;

                  // Handle different product ID formats
                  if (typeof productId === 'object' && productId.id) {
                    productId = productId.id;
                  }

                  // Ensure it's a valid number
                  if (typeof productId === 'string') {
                    productId = parseInt(productId, 10);
                  }

                  if (isNaN(productId) || !productId) {
                    return;
                  }

                  // Fetch the current product
                  const product: any = await req.payload.findByID({
                    collection: 'products',
                    id: productId,
                  });

                  // Update currentBid if this bid is higher
                  if (!product.currentBid || doc.amount > product.currentBid) {
                    await req.payload.update({
                      collection: 'products',
                      id: productId,
                      data: {
                        currentBid: doc.amount,
                      },
                    });
                  }

                  // Broadcast real-time update via SSE
                  const broadcast = (global as any).broadcastProductUpdate;
                  if (broadcast) {
                    await broadcast(String(productId));
                  }
                } catch (error) {
                  console.error('Background error updating currentBid:', error);
                }
              });
            }
            return doc;
          },
        ],
      },
      fields: [
        {
          name: 'product',
          type: 'relationship',
          relationTo: 'products',
          required: true,
        },
        {
          name: 'bidder',
          type: 'relationship',
          relationTo: 'users',
          admin: {
            readOnly: true,
            position: 'sidebar',
            description: 'Automatically set to the current user',
          },
        },
        {
          name: 'amount',
          type: 'number',
          required: true,
          min: 0,
        },
        {
          name: 'bidTime',
          type: 'date',
          admin: {
            readOnly: true,
            date: {
              pickerAppearance: 'dayAndTime',
            },
            description: 'Automatically set to current time',
          },
        },
        {
          name: 'censorName',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Hide bidder full name in bid history (shows only first letters)',
          },
        },
      ],
    },
    {
      slug: 'messages',
      admin: {
        useAsTitle: 'id',
      },
      access: {
        read: ({ req }) => {
          // Users can only read messages they sent or received
          if (!req.user) return false;
          // Return true - filtering will be done via hooks
          return true;
        },
        create: ({ req }) => !!req.user,
        update: ({ req }) => !!req.user,
        delete: ({ req }) => req.user?.role === 'admin',
      },
      hooks: {
        beforeChange: [
          ({ req, data }) => {
            // Automatically set sender to the logged-in user
            if (req.user && !data.sender) {
              data.sender = req.user.id;
            }
            return data;
          },
        ],
        afterRead: [
          async ({ req, doc }) => {
            // Filter out messages user shouldn't see
            if (!req.user) return null;

            const senderId = typeof doc.sender === 'object' ? doc.sender.id : doc.sender;
            const receiverId = typeof doc.receiver === 'object' ? doc.receiver.id : doc.receiver;

            if (senderId === req.user.id || receiverId === req.user.id) {
              return doc;
            }

            return null;
          },
        ],
      },
      fields: [
        {
          name: 'product',
          type: 'relationship',
          relationTo: 'products',
          required: true,
          admin: {
            description: 'Product this conversation is about',
          },
        },
        {
          name: 'sender',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          admin: {
            readOnly: true,
            position: 'sidebar',
            description: 'Automatically set to the current user',
          },
        },
        {
          name: 'receiver',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          admin: {
            description: 'User receiving this message',
          },
        },
        {
          name: 'message',
          type: 'textarea',
          required: true,
        },
        {
          name: 'read',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Has the receiver read this message?',
          },
        },
      ],
    },
    {
      slug: 'transactions',
      admin: {
        useAsTitle: 'id',
      },
      access: {
        read: ({ req }) => {
          // Users can only read their own transactions
          if (!req.user) return false;
          return true; // Filtering done via hooks
        },
        create: ({ req }) => req.user?.role === 'admin',
        update: ({ req }) => !!req.user,
        delete: ({ req }) => req.user?.role === 'admin',
      },
      hooks: {
        afterRead: [
          async ({ req, doc }) => {
            // Filter out transactions user shouldn't see
            if (!req.user) return null;

            const buyerId = typeof doc.buyer === 'object' ? doc.buyer.id : doc.buyer;
            const sellerId = typeof doc.seller === 'object' ? doc.seller.id : doc.seller;

            if (buyerId === req.user.id || sellerId === req.user.id) {
              return doc;
            }

            return null;
          },
        ],
      },
      fields: [
        {
          name: 'product',
          type: 'relationship',
          relationTo: 'products',
          required: true,
          admin: {
            description: 'Product that was sold',
          },
        },
        {
          name: 'seller',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          admin: {
            description: 'Seller of the product',
          },
        },
        {
          name: 'buyer',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          admin: {
            description: 'Buyer who won the auction',
          },
        },
        {
          name: 'amount',
          type: 'number',
          required: true,
          admin: {
            description: 'Final sale price',
          },
        },
        {
          name: 'status',
          type: 'select',
          options: [
            { label: 'Pending', value: 'pending' },
            { label: 'In Progress', value: 'in_progress' },
            { label: 'Completed', value: 'completed' },
            { label: 'Cancelled', value: 'cancelled' },
          ],
          defaultValue: 'pending',
          required: true,
        },
        {
          name: 'notes',
          type: 'textarea',
          admin: {
            description: 'Transaction notes or details',
          },
        },
      ],
    },
    {
      slug: 'media',
      upload: {
        mimeTypes: ['image/*'],
        imageSizes: [
          {
            name: 'thumbnail',
            width: 400,
            height: 300,
          },
          {
            name: 'card',
            width: 768,
            height: 1024,
          },
        ],
      },
      access: {
        read: () => true,
        create: ({ req }) => !!req.user,
        update: ({ req }) => !!req.user,
        delete: ({ req }) => req.user?.role === 'admin',
      },
      fields: [
        {
          name: 'alt',
          type: 'text',
        },
      ],
    },
  ],
  plugins: [
    cloudStorage({
      collections: {
        media: {
          adapter: adapter,
          prefix: 'bidmoto', // Empty prefix to match existing files at bucket root
          disableLocalStorage: true
        }
      }
    })
  ],
  typescript: {
    outputFile: path.resolve(__dirname, 'payload-types.ts'),
  },
  graphQL: {
    schemaOutputFile: path.resolve(__dirname, 'generated-schema.graphql'),
  },
});
