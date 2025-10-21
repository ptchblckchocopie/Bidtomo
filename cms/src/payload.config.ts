import { buildConfig } from 'payload/config';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { webpackBundler } from '@payloadcms/bundler-webpack';
import path from 'path';

export default buildConfig({
  serverURL: process.env.SERVER_URL || 'http://localhost:3001',
  cors: ['http://localhost:5173', 'http://localhost:3001'],
  csrf: ['http://localhost:5173', 'http://localhost:3001'],
  admin: {
    user: 'users',
    bundler: webpackBundler(),
  },
  editor: lexicalEditor({}),
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/marketplace',
    },
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
        update: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'seller',
        delete: ({ req }) => req.user?.role === 'admin',
      },
      hooks: {
        beforeChange: [
          ({ req, data }) => {
            // Automatically set seller to the logged-in user if not provided
            if (req.user && !data.seller) {
              data.seller = req.user.id;
            }
            return data;
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
          name: 'images',
          type: 'array',
          fields: [
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
            },
          ],
        },
        {
          name: 'startingPrice',
          type: 'number',
          required: true,
          min: 0,
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
            const auctionEnd = new Date(value);
            const now = new Date();

            if (auctionEnd <= now) {
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
          name: 'status',
          type: 'select',
          options: [
            { label: 'Active', value: 'active' },
            { label: 'Ended', value: 'ended' },
            { label: 'Sold', value: 'sold' },
            { label: 'Cancelled', value: 'cancelled' },
          ],
          defaultValue: 'active',
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
        create: ({ req }) => {
          console.log('Bid create access check - req.user:', req.user?.id, req.user?.email);
          const hasAccess = !!req.user;
          console.log('Bid create access result:', hasAccess);
          return hasAccess;
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
      ],
    },
    {
      slug: 'media',
      upload: {
        staticURL: '/media',
        staticDir: 'media',
        mimeTypes: ['image/*'],
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
  typescript: {
    outputFile: path.resolve(__dirname, 'payload-types.ts'),
  },
  graphQL: {
    schemaOutputFile: path.resolve(__dirname, 'generated-schema.graphql'),
  },
});
