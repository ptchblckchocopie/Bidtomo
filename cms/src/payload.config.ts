import dotenv from 'dotenv';
dotenv.config();

import { buildConfig } from 'payload/config';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { webpackBundler } from '@payloadcms/bundler-webpack';
// Note: Using custom emailService.ts for emails instead of Payload's email adapter
// The @payloadcms/email-resend is for Payload v3, not v2
import path from 'path';
import { s3Adapter } from '@payloadcms/plugin-cloud-storage/s3';
import { cloudStorage } from '@payloadcms/plugin-cloud-storage';
import { authenticateJWT } from './auth-helpers';
import { EmailTemplates } from './collections/EmailTemplates';

// Configure S3 adapter for Supabase Storage
const adapter = s3Adapter({
  config: {
    credentials: {
      accessKeyId: (process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID)!,
      secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY)!
    },
    region: process.env.S3_REGION || 'ap-northeast-2',
    endpoint: process.env.S3_ENDPOINT || 'https://htcdkqplcmdbyjlvzono.storage.supabase.co/storage/v1/s3',
    forcePathStyle: true,
  },
  bucket: process.env.S3_BUCKET || 'bidmo-media',
  acl: 'public-read'
});

const isProduction = process.env.NODE_ENV === 'production';

export default buildConfig({
  serverURL: process.env.SERVER_URL || '',
  cors: [
    'http://localhost:5173',
    'http://localhost:3001',
    'https://www.bidmo.to',
    'https://bidmo.to',
    'https://app.bidmo.to',
    'https://cms-production-d0f7.up.railway.app',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ],
  csrf: [
    'http://localhost:5173',
    'http://localhost:3001',
    'https://www.bidmo.to',
    'https://bidmo.to',
    'https://app.bidmo.to',
    'https://cms-production-d0f7.up.railway.app',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ],
  admin: {
    user: 'users',
    bundler: webpackBundler(),
    disable: process.env.VERCEL === '1', // Disable admin UI on Vercel serverless
    webpack: (config) => {
      // Provide browser-compatible fallbacks for Node.js built-in modules
      config.resolve = {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          // Override Payload's built-in Unauthorized view with custom redirect version
          [path.resolve(__dirname, '../node_modules/payload/dist/admin/components/views/Unauthorized/index')]:
            path.resolve(__dirname, '../src/components/UnauthorizedView.tsx'),
        },
        fallback: {
          ...config.resolve?.fallback,
          fs: false,
          path: require.resolve('path-browserify'),
          crypto: false,
          stream: false,
          os: false,
          util: false,
          buffer: false,
        },
      };
      // Externalize server-only modules that shouldn't be in browser bundle
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'jsonwebtoken',
        'jwa',
        'jws',
      ];
      return config;
    },
  },
  editor: lexicalEditor({}),

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || process.env.DATABASE_URL || 'postgresql://localhost:5432/marketplace',
    },
    migrationDir: path.resolve(__dirname, '../migrations'),
    push: process.env.DB_PUSH === 'true', // Enable via env var for staging schema sync
    ...(process.env.NODE_ENV === 'production' && {
      ssl: process.env.DATABASE_CA_CERT ? {
        rejectUnauthorized: true,
        ca: process.env.DATABASE_CA_CERT,
      } : {
        rejectUnauthorized: false, // Railway proxy uses self-signed certs; set DATABASE_CA_CERT for full verification
      },
    }),
  }),
  // Using custom emailService.ts for emails - see services/emailService.ts
  collections: [
    {
      slug: 'users',
      auth: {
        verify: false,
        maxLoginAttempts: 5,
      },
      admin: {
        useAsTitle: 'email',
        hidden: ({ user }) => user?.role !== 'admin',
      },
      access: {
        admin: ({ req }) => req.user?.role === 'admin',
        read: () => true,
        create: () => true,
        update: ({ req }) => !!req.user,
        delete: ({ req }) => req.user?.role === 'admin',
      },
      hooks: {
        beforeChange: [
          ({ req, data, operation }: any) => {
            // Prevent role escalation: only admins can set/change the role field
            if (req.user?.role !== 'admin') {
              if (operation === 'create') {
                // Force default role on registration — ignore any client-supplied role
                data.role = 'buyer';
              } else if (operation === 'update') {
                // Strip role from update payload for non-admins
                delete data.role;
              }
            }
            return data;
          },
        ],
        afterRead: [
          ({ req, doc }: any) => {
            // Skip PII stripping for internal/local API calls (no Express response object)
            // This preserves email access for server.ts email notifications, bid processing, etc.
            if (!req.res) return doc;

            // Admins see everything
            if (req.user?.role === 'admin') return doc;

            // Users see their own full profile
            if (req.user?.id === doc.id) return doc;

            // Strip PII for everyone else (including populated relations in products, bids, etc.)
            const { email, phoneNumber, countryCode, ...publicData } = doc;
            return publicData;
          },
        ],
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
        {
          name: 'countryCode',
          type: 'text',
          defaultValue: '+63',
          admin: {
            description: 'Phone country code',
          },
        },
        {
          name: 'phoneNumber',
          type: 'text',
          admin: {
            description: 'Phone number without country code',
          },
        },
        {
          name: 'censorName',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Hide your real name on public profile (shows as "User ***")',
          },
        },
        {
          name: 'profilePicture',
          type: 'upload',
          relationTo: 'media',
          admin: {
            description: 'Your profile picture',
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
        read: (({ req }: any) => {
          // Admins see everything
          if (req.user?.role === 'admin') return true;

          // Authenticated non-admins see active products + their own listings
          if (req.user) {
            return {
              or: [
                { active: { equals: true } },
                { seller: { equals: req.user.id } },
              ],
            };
          }

          // Unauthenticated users see only active products
          return {
            active: { equals: true },
          };
        }) as any,
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
              const sellerId = originalDoc?.seller && typeof originalDoc.seller === 'object'
                ? originalDoc.seller.id
                : originalDoc?.seller;

              if (sellerId !== req.user?.id) {
                throw new Error('You can only edit your own products');
              }

              // Prevent editing sold products
              if (originalDoc?.status === 'sold') {
                throw new Error('Cannot edit products that have been sold');
              }

              // Prevent editing startingPrice, auctionEndDate, or status if there are already bids
              // Prevent editing startingPrice, auctionEndDate, or status if there are already bids
              const hasStartingPriceChange = data?.startingPrice !== undefined && data.startingPrice !== originalDoc?.startingPrice;
              const hasEndDateChange = data?.auctionEndDate !== undefined && data.auctionEndDate !== originalDoc?.auctionEndDate;
              const hasStatusChange = data?.status !== undefined && data.status !== originalDoc?.status;

              if (hasStartingPriceChange || hasEndDateChange || hasStatusChange) {
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
                  if (hasStartingPriceChange) {
                    throw new Error('Cannot change starting price after bids have been placed');
                  }
                  if (hasEndDateChange) {
                    throw new Error('Cannot change auction end date after bids have been placed');
                  }
                  if (hasStatusChange) {
                    throw new Error('Cannot change product status after bids have been placed');
                  }
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

              // Notify all channels when product visibility changes (e.g. admin hides it)
              if (previousDoc && doc.active !== previousDoc.active) {
                const visibilityPayload = {
                  type: 'product_visibility',
                  productId: doc.id,
                  active: doc.active,
                  title: doc.title,
                };

                // Notify seller via user SSE
                const publishMsg = (global as any).publishMessageNotification;
                if (publishMsg) {
                  const sellerId = typeof doc.seller === 'object' && doc.seller ? (doc.seller as any).id : doc.seller;
                  if (sellerId) {
                    setImmediate(() => {
                      publishMsg(sellerId, visibilityPayload)
                        .catch((err: Error) => console.error('Error publishing product_visibility to seller:', err));
                    });
                  }
                }

                // Notify global SSE (browse page) and product SSE (detail page)
                const publishGlobal = (global as any).publishGlobalEvent;
                const publishProduct = (global as any).publishProductUpdate;
                setImmediate(() => {
                  if (publishGlobal) {
                    publishGlobal(visibilityPayload)
                      .catch((err: Error) => console.error('Error publishing product_visibility to global:', err));
                  }
                  if (publishProduct) {
                    publishProduct(doc.id, visibilityPayload)
                      .catch((err: Error) => console.error('Error publishing product_visibility to product:', err));
                  }
                });
              }
            }

            // Publish new_product event to global SSE when a product is created
            if (operation === 'create') {
              const publishGlobal = (global as any).publishGlobalEvent;
              if (publishGlobal) {
                const sellerId = typeof doc.seller === 'object' && doc.seller ? (doc.seller as any).id : doc.seller;
                const sellerName = typeof doc.seller === 'object' && doc.seller ? (doc.seller as any).name : undefined;
                setImmediate(() => {
                  publishGlobal({
                    type: 'new_product',
                    product: {
                      id: doc.id,
                      title: doc.title,
                      startingPrice: doc.startingPrice,
                      auctionEndDate: doc.auctionEndDate,
                      status: doc.status,
                      region: doc.region,
                      city: doc.city,
                      seller: { id: sellerId, name: sellerName },
                      images: doc.images,
                    },
                  }).catch((err: Error) => console.error('Error publishing new_product event:', err));
                });
              }
            }

            // Index/update product in Elasticsearch
            const esIndex = (global as any).indexProduct;
            const esUpdate = (global as any).updateProductIndex;
            if (operation === 'create' && esIndex) {
              setImmediate(() => {
                esIndex(doc).catch((err: Error) => console.error('ES index error:', err));
              });
            } else if (operation === 'update' && esUpdate && previousDoc) {
              // Only update ES when search-relevant fields change (skip currentBid-only updates)
              const searchFieldsChanged =
                doc.title !== previousDoc.title ||
                doc.description !== previousDoc.description ||
                doc.status !== previousDoc.status ||
                doc.active !== previousDoc.active ||
                doc.region !== previousDoc.region ||
                doc.city !== previousDoc.city;
              if (searchFieldsChanged) {
                setImmediate(() => {
                  esUpdate(doc.id, {
                    title: doc.title,
                    description: doc.description,
                    keywords: (doc.keywords || []).map((k: any) => k.keyword || k).filter(Boolean).join(' '),
                    currentBid: doc.currentBid || 0,
                    status: doc.status || 'available',
                    active: doc.active !== false,
                    region: doc.region || '',
                    city: doc.city || '',
                    updatedAt: doc.updatedAt,
                  }).catch((err: Error) => console.error('ES update error:', err));
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
          validate: (value: string, { operation }: any) => {
            if (!value) return true; // Allow empty for now, required will catch it

            // Only enforce future date on create, not on updates
            // (admins need to unhide products with past auction dates)
            if (operation === 'update') return true;

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
        beforeValidate: [
          async ({ req, data, operation }: any) => {
            // Enforce business rules when bids are created via Payload REST API (POST /api/bids).
            // The bid-worker bypasses Payload ORM and has its own SQL-level validation,
            // but this hook protects against direct REST API abuse.
            if (operation === 'create' && data?.product) {
              const productId = typeof data.product === 'string' ? parseInt(data.product, 10) : data.product;
              const product: any = await req.payload.findByID({
                collection: 'products',
                id: productId,
                overrideAccess: true,
              });

              if (!product) throw new Error('Product not found');
              if (product.status !== 'available') throw new Error(`Product is ${product.status}`);
              if (!product.active) throw new Error('Product is not active');
              if (new Date(product.auctionEndDate) <= new Date()) throw new Error('Auction has ended');

              // Shill bidding check: bidder cannot be the seller
              const sellerId = typeof product.seller === 'object' ? product.seller.id : product.seller;
              const bidderId = data.bidder || req.user?.id;
              if (sellerId === bidderId) throw new Error('You cannot bid on your own product');

              // Minimum bid check
              const currentBid = Number(product.currentBid) || 0;
              const bidInterval = Number(product.bidInterval) || 1;
              const startingPrice = Number(product.startingPrice) || 0;
              const minimumBid = currentBid > 0 ? currentBid + bidInterval : startingPrice;
              if (typeof data.amount !== 'number' || !isFinite(data.amount) || data.amount <= 0) {
                throw new Error('Invalid bid amount');
              }
              if (data.amount < minimumBid) {
                throw new Error(`Bid must be at least ${minimumBid}`);
              }

              // Cap maximum bid to prevent griefing (10x current price or 10M, whichever is larger)
              const maxBid = Math.max((currentBid || startingPrice) * 10, 10_000_000);
              if (data.amount > maxBid) {
                throw new Error(`Bid amount exceeds maximum allowed (${maxBid})`);
              }
            }
            return data;
          },
        ],
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
        read: (({ req }: any) => {
          if (!req.user) return false;
          if (req.user.role === 'admin') return true;
          // DB-level filter: only messages where user is sender or receiver
          return {
            or: [
              { sender: { equals: req.user.id } },
              { receiver: { equals: req.user.id } },
            ],
          };
        }) as any,
        create: ({ req }) => !!req.user,
        update: (({ req }: any) => {
          if (!req.user) return false;
          if (req.user.role === 'admin') return true;
          // DB-level filter: only sender or receiver can update their messages
          return {
            or: [
              { sender: { equals: req.user.id } },
              { receiver: { equals: req.user.id } },
            ],
          };
        }) as any,
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
        afterChange: [
          async ({ req, doc, operation }) => {
            // Publish notification to receiver via SSE when message is created
            if (operation === 'create') {
              try {
                const receiverId = typeof doc.receiver === 'object' ? doc.receiver.id : doc.receiver;
                const senderId = typeof doc.sender === 'object' ? doc.sender.id : doc.sender;
                const productId = typeof doc.product === 'object' ? doc.product.id : doc.product;

                // Get sender info from doc if populated, or from request user
                const senderData = typeof doc.sender === 'object' ? doc.sender : (req.user?.id === senderId ? req.user : null);

                // Use global function (defined in server.ts) to avoid webpack bundling Redis
                const publishMessageNotification = (global as any).publishMessageNotification;
                if (publishMessageNotification) {
                  // Publish immediately - don't wait for response
                  publishMessageNotification(receiverId, {
                    type: 'new_message',
                    messageId: doc.id,
                    productId,
                    senderId,
                    preview: doc.message?.substring(0, 50) + (doc.message?.length > 50 ? '...' : ''),
                    // Include full message data for instant display
                    message: {
                      id: doc.id,
                      message: doc.message,
                      sender: senderData ? { id: senderData.id, name: senderData.name, email: senderData.email } : { id: senderId },
                      receiver: { id: receiverId },
                      product: { id: productId },
                      read: false,
                      createdAt: doc.createdAt,
                      updatedAt: doc.updatedAt,
                    },
                  }).catch((err: Error) => console.error('Error publishing message notification:', err));
                }
              } catch (error) {
                console.error('Error in message afterChange hook:', error);
              }
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
        read: (({ req }: any) => {
          if (!req.user) return false;
          if (req.user.role === 'admin') return true;
          // DB-level filter: only transactions where user is buyer or seller
          return {
            or: [
              { buyer: { equals: req.user.id } },
              { seller: { equals: req.user.id } },
            ],
          };
        }) as any,
        create: ({ req }) => req.user?.role === 'admin',
        update: (({ req }: any) => {
          if (!req.user) return false;
          if (req.user.role === 'admin') return true;
          // DB-level filter: only buyer or seller can update their transactions
          return {
            or: [
              { buyer: { equals: req.user.id } },
              { seller: { equals: req.user.id } },
            ],
          };
        }) as any,
        delete: ({ req }) => req.user?.role === 'admin',
      },
      hooks: {
        beforeChange: [
          ({ req, data, operation, originalDoc }: any) => {
            // Prevent non-admins from changing critical fields on transactions
            if (operation === 'update' && req.user?.role !== 'admin') {
              // Only allow status transitions that make sense, and block amount/relationship changes
              delete data.product;
              delete data.seller;
              delete data.buyer;
              delete data.amount;
              // Only allow status changes to: in_progress, completed (from pending/in_progress)
              if (data.status) {
                const allowed: Record<string, string[]> = {
                  pending: ['in_progress'],
                  in_progress: ['completed'],
                };
                const currentStatus = originalDoc?.status || 'pending';
                if (!allowed[currentStatus]?.includes(data.status)) {
                  throw new Error(`Cannot change status from ${currentStatus} to ${data.status}`);
                }
              }
            }
            return data;
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
            { label: 'Voided', value: 'voided' },
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
        {
          name: 'voidRequest',
          type: 'relationship',
          relationTo: 'void-requests',
          admin: {
            description: 'Associated void request if voided',
          },
        },
      ],
    },
    // Void Requests Collection
    {
      slug: 'void-requests',
      admin: {
        useAsTitle: 'id',
        group: 'Transactions',
      },
      access: {
        read: (({ req }: any) => {
          if (!req.user) return false;
          if (req.user.role === 'admin') return true;
          // DB-level filter: only void requests initiated by this user
          // (the other transaction party accesses via the custom API endpoints in server.ts,
          //  which use overrideAccess: true)
          return { initiator: { equals: req.user.id } };
        }) as any,
        create: ({ req }) => !!req.user,
        // Restrict direct updates: only admins can modify void requests via REST API.
        // All user-facing mutations go through custom endpoints in server.ts which use overrideAccess: true.
        update: ({ req }) => req.user?.role === 'admin',
        delete: ({ req }) => req.user?.role === 'admin',
      },
      fields: [
        {
          name: 'transaction',
          type: 'relationship',
          relationTo: 'transactions',
          required: true,
          admin: {
            description: 'Transaction being voided',
          },
        },
        {
          name: 'product',
          type: 'relationship',
          relationTo: 'products',
          required: true,
          admin: {
            description: 'Product associated with this void request',
          },
        },
        {
          name: 'initiator',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          admin: {
            description: 'User who initiated the void request',
          },
        },
        {
          name: 'initiatorRole',
          type: 'select',
          options: [
            { label: 'Buyer', value: 'buyer' },
            { label: 'Seller', value: 'seller' },
          ],
          required: true,
          admin: {
            description: 'Role of the initiator in this transaction',
          },
        },
        {
          name: 'reason',
          type: 'textarea',
          required: true,
          admin: {
            description: 'Reason for voiding the transaction',
          },
        },
        {
          name: 'status',
          type: 'select',
          options: [
            { label: 'Pending', value: 'pending' },
            { label: 'Approved', value: 'approved' },
            { label: 'Rejected', value: 'rejected' },
            { label: 'Cancelled', value: 'cancelled' },
          ],
          defaultValue: 'pending',
          required: true,
          admin: {
            description: 'Current status of the void request',
          },
        },
        {
          name: 'rejectionReason',
          type: 'textarea',
          admin: {
            description: 'Reason for rejection (if rejected)',
          },
        },
        {
          name: 'approvedAt',
          type: 'date',
          admin: {
            description: 'When the void request was approved',
          },
        },
        {
          name: 'sellerChoice',
          type: 'select',
          options: [
            { label: 'Restart Bidding', value: 'restart_bidding' },
            { label: 'Offer to 2nd Bidder', value: 'offer_second_bidder' },
          ],
          admin: {
            description: 'Seller choice after void is approved',
          },
        },
        {
          name: 'secondBidderOffer',
          type: 'group',
          admin: {
            description: 'Details of offer to second highest bidder',
          },
          fields: [
            {
              name: 'offeredTo',
              type: 'relationship',
              relationTo: 'users',
              admin: {
                description: '2nd highest bidder offered to',
              },
            },
            {
              name: 'offerAmount',
              type: 'number',
              admin: {
                description: 'Amount offered (their bid amount)',
              },
            },
            {
              name: 'offerStatus',
              type: 'select',
              options: [
                { label: 'Pending', value: 'pending' },
                { label: 'Accepted', value: 'accepted' },
                { label: 'Declined', value: 'declined' },
                { label: 'Expired', value: 'expired' },
              ],
              admin: {
                description: 'Status of the offer to 2nd bidder',
              },
            },
            {
              name: 'offeredAt',
              type: 'date',
              admin: {
                description: 'When the offer was sent',
              },
            },
            {
              name: 'respondedAt',
              type: 'date',
              admin: {
                description: 'When the 2nd bidder responded',
              },
            },
          ],
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
        update: ({ req }) => req.user?.role === 'admin',
        delete: ({ req }) => req.user?.role === 'admin',
      },
      fields: [
        {
          name: 'alt',
          type: 'text',
        },
      ],
    },
    {
      slug: 'ratings',
      admin: {
        useAsTitle: 'id',
      },
      access: {
        read: () => true, // Public - anyone can read ratings
        create: ({ req }) => !!req.user, // Must be authenticated
        update: async ({ req, id }) => {
          // Only the rater can update their own rating
          if (!req.user) return false;
          if (req.user.role === 'admin') return true;
          return true; // Detailed check in beforeChange hook
        },
        delete: ({ req }) => req.user?.role === 'admin',
      },
      hooks: {
        beforeChange: [
          async ({ req, data, operation, originalDoc }) => {
            if (operation === 'create') {
              // Auto-set rater to logged-in user
              if (req.user && !data.rater) {
                data.rater = req.user.id;
              }

              // Validate: prevent duplicate ratings (one per transaction per rater)
              if (data.transaction && req.user) {
                const existingRating = await req.payload.find({
                  collection: 'ratings',
                  where: {
                    and: [
                      { transaction: { equals: data.transaction } },
                      { rater: { equals: req.user.id } },
                    ],
                  },
                  limit: 1,
                });

                if (existingRating.docs.length > 0) {
                  throw new Error('You have already rated this transaction');
                }
              }

              // Validate: user must be part of the transaction
              if (data.transaction && req.user) {
                const transaction: any = await req.payload.findByID({
                  collection: 'transactions',
                  id: data.transaction,
                });

                if (!transaction) {
                  throw new Error('Transaction not found');
                }

                const buyerId = typeof transaction.buyer === 'object' ? transaction.buyer.id : transaction.buyer;
                const sellerId = typeof transaction.seller === 'object' ? transaction.seller.id : transaction.seller;

                if (req.user.id !== buyerId && req.user.id !== sellerId) {
                  throw new Error('You are not part of this transaction');
                }

                // Auto-set raterRole based on user's role in transaction
                if (req.user.id === buyerId) {
                  data.raterRole = 'buyer';
                  data.ratee = sellerId; // Buyer rates seller
                } else {
                  data.raterRole = 'seller';
                  data.ratee = buyerId; // Seller rates buyer
                }
              }
            }

            if (operation === 'update') {
              // Only rater can update
              if (req.user?.role !== 'admin') {
                const raterId = typeof originalDoc?.rater === 'object' ? originalDoc.rater.id : originalDoc?.rater;
                if (raterId !== req.user?.id) {
                  throw new Error('You can only update your own rating');
                }
              }

              // Check if follow-up already exists
              if (originalDoc?.hasFollowUp) {
                throw new Error('You can only add one follow-up to your rating');
              }

              // Check 30-day limit for follow-up
              const createdAt = new Date(originalDoc?.createdAt);
              const now = new Date();
              const daysDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
              if (daysDiff > 30) {
                throw new Error('You can only add a follow-up within 30 days of your original rating');
              }

              // If adding follow-up, set hasFollowUp and timestamp
              if (data.followUp && data.followUp.rating) {
                data.hasFollowUp = true;
                data.followUp.createdAt = new Date().toISOString();
              }
            }

            return data;
          },
        ],
      },
      fields: [
        {
          name: 'transaction',
          type: 'relationship',
          relationTo: 'transactions',
          required: true,
          admin: {
            description: 'The transaction being rated',
          },
        },
        {
          name: 'rater',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          admin: {
            readOnly: true,
            description: 'User giving the rating (auto-set)',
          },
        },
        {
          name: 'ratee',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          admin: {
            readOnly: true,
            description: 'User being rated (auto-set)',
          },
        },
        {
          name: 'raterRole',
          type: 'select',
          options: [
            { label: 'Buyer', value: 'buyer' },
            { label: 'Seller', value: 'seller' },
          ],
          required: true,
          admin: {
            readOnly: true,
            description: 'Role of rater in the transaction (auto-set)',
          },
        },
        {
          name: 'rating',
          type: 'number',
          required: true,
          min: 1,
          max: 5,
          admin: {
            description: 'Rating from 1 to 5 stars',
          },
        },
        {
          name: 'comment',
          type: 'textarea',
          admin: {
            description: 'Optional comment about the transaction',
          },
        },
        {
          name: 'followUp',
          type: 'group',
          admin: {
            description: 'Follow-up rating (can only be added once within 30 days)',
          },
          fields: [
            {
              name: 'rating',
              type: 'number',
              min: 1,
              max: 5,
              admin: {
                description: 'Follow-up rating from 1 to 5 stars',
              },
            },
            {
              name: 'comment',
              type: 'textarea',
              admin: {
                description: 'Follow-up comment',
              },
            },
            {
              name: 'createdAt',
              type: 'date',
              admin: {
                readOnly: true,
                description: 'When the follow-up was added',
              },
            },
          ],
        },
        {
          name: 'hasFollowUp',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            readOnly: true,
            description: 'Whether a follow-up has been added',
          },
        },
      ],
    },
    // Email Templates collection
    EmailTemplates,
  ],
  plugins: [
    cloudStorage({
      collections: {
        media: {
          adapter: adapter,
          prefix: 'bidmoto',
          disableLocalStorage: true,
          generateFileURL: ({ filename, prefix }) => {
            const bucket = process.env.S3_BUCKET || 'bidmo-media';
            const supabaseUrl = process.env.SUPABASE_URL || 'https://htcdkqplcmdbyjlvzono.supabase.co';
            return `${supabaseUrl}/storage/v1/object/public/${bucket}/${prefix}/${filename}`;
          },
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
