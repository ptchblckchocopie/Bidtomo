# Marketplace Platform

A full-stack auction marketplace where users can create accounts, post products, and bid on items.

## Project Structure

```
marketplace-platform/
├── cms/              # PayloadCMS backend (API & database)
│   ├── src/
│   │   ├── server.ts           # Express server
│   │   └── payload.config.ts   # PayloadCMS configuration
│   ├── package.json
│   └── .env.example
│
├── frontend/         # SvelteKit frontend
│   ├── src/
│   │   ├── routes/             # SvelteKit routes
│   │   ├── app.html           # HTML template
│   │   └── app.css            # Global styles
│   ├── package.json
│   └── svelte.config.js
│
├── PLANNING.md       # Comprehensive planning document
└── README.md         # This file
```

## Tech Stack

### Backend
- **PayloadCMS**: Headless CMS and API backend
- **PostgreSQL**: Database
- **Express**: Node.js web framework
- **TypeScript**: Type-safe development

### Frontend
- **SvelteKit**: Full-stack web framework
- **TypeScript**: Type-safe development
- **Vite**: Build tool and dev server

## Getting Started

**🐳 Docker Setup (Recommended):** See [DOCKER.md](./DOCKER.md) - No PostgreSQL or Node.js installation needed!
**🚀 Local Setup:** See [QUICKSTART.md](./QUICKSTART.md) for local development setup
**📖 Detailed Setup:** See [SETUP.md](./SETUP.md) for comprehensive setup instructions

### Docker Setup (Easiest)

Only Docker required - everything else runs in containers!

```bash
# Install Docker, then run:
./start-docker.sh
```

That's it! Access http://localhost:3001/admin to create your first user.

### Local Setup

Prerequisites:
- Node.js 18+
- PostgreSQL 14+ (local installation or cloud service like Supabase, Railway, etc.)
- npm or yarn

### Quick Setup

The environment files are already configured with working defaults for local development. Just follow these steps:

1. **Install PostgreSQL** (if not already installed)
   ```bash
   # Ubuntu/Debian
   sudo apt install postgresql

   # macOS
   brew install postgresql
   ```

2. **Create the database:**
   ```bash
   ./setup-db.sh
   ```
   This script will automatically create the `marketplace` database.

3. **Run the start script:**
   ```bash
   ./start.sh
   ```

4. **Access the admin panel** at http://localhost:3001/admin and create your first user

For detailed setup instructions, see [SETUP.md](./SETUP.md).

### Manual Setup

### 1. Set Up Backend (PayloadCMS)

```bash
cd cms

# Install dependencies
npm install

# Create .env file from example
cp .env.example .env

# Edit .env and configure:
# - DATABASE_URL (your PostgreSQL connection string)
# - PAYLOAD_SECRET (generate a secure random string)
# - PORT (default: 3001)

# Start development server
npm run dev
```

The PayloadCMS admin panel will be available at `http://localhost:3001/admin`

### 2. Set Up Frontend (SvelteKit)

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Key Features

- **User Management**: Registration, authentication, roles (admin/seller/buyer)
- **Product Listings**: Create, edit, and manage product auctions
- **Bidding System**: Real-time bidding on products
- **Browse & Search**: Public access to browse products
- **Admin Panel**: Manage users, products, and bids via PayloadCMS

## Data Models

### Users
- Email/password authentication
- Roles: admin, seller, buyer
- Profile information

### Products
- Title, description, images
- Starting price and current bid
- Auction end date
- Status tracking (active, ended, sold, cancelled)
- Seller relationship

### Bids
- Bid amount and timestamp
- Bidder and product relationships
- Bid history tracking

### Media
- Image uploads for products
- Alt text for accessibility

## Development Workflow

1. Start PostgreSQL (if running locally)
2. Create database: `createdb marketplace` (or use your PostgreSQL client)
3. Start backend: `cd cms && npm run dev`
4. Start frontend: `cd frontend && npm run dev`
5. Access admin panel at `http://localhost:3001/admin`
6. Access frontend at `http://localhost:5173`

**Quick Start**: Use the provided shell script to run all projects:
```bash
chmod +x start.sh
./start.sh
```

## Next Steps

1. Review `PLANNING.md` for comprehensive planning and considerations
2. Install dependencies in both projects
3. Configure environment variables
4. Set up PostgreSQL database
5. Create your first admin user via PayloadCMS
6. Start building your MVP features

## API Endpoints

The PayloadCMS backend automatically generates REST API endpoints:

- `POST /api/users/login` - User authentication
- `POST /api/users/logout` - User logout
- `GET /api/products` - List products
- `POST /api/products` - Create product (authenticated)
- `GET /api/products/:id` - Get product details
- `PATCH /api/products/:id` - Update product
- `POST /api/bids` - Place bid
- `GET /api/bids` - List bids

Full API documentation available at `http://localhost:3001/api-docs` (after setup)

## Resources

- [PayloadCMS Documentation](https://payloadcms.com/docs)
- [PayloadCMS PostgreSQL Adapter](https://payloadcms.com/docs/database/postgres)
- [SvelteKit Documentation](https://kit.svelte.dev/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## License

MIT
