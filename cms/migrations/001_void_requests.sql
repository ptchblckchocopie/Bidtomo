-- Migration: Add void_requests tables
-- This migration is idempotent and can be run multiple times safely
-- Note: Column names match PayloadCMS conventions (camelCase for select fields)

-- Create enums
DO $$ BEGIN
  CREATE TYPE enum_void_requests_initiator_role AS ENUM ('buyer', 'seller');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE enum_void_requests_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE enum_void_requests_seller_choice AS ENUM ('restart_bidding', 'offer_second_bidder');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "enum_void_requests_secondBidderOffer_offerStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add 'voided' to transactions status enum if not exists
DO $$ BEGIN
  ALTER TYPE enum_transactions_status ADD VALUE IF NOT EXISTS 'voided';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create void_requests table
CREATE TABLE IF NOT EXISTS void_requests (
  id SERIAL PRIMARY KEY,
  "initiatorRole" enum_void_requests_initiator_role NOT NULL,
  reason VARCHAR NOT NULL,
  status enum_void_requests_status NOT NULL DEFAULT 'pending',
  "rejectionReason" VARCHAR,
  approved_at TIMESTAMP(3) WITH TIME ZONE,
  "sellerChoice" enum_void_requests_seller_choice,
  "secondBidderOffer_offerAmount" NUMERIC,
  "secondBidderOffer_offerStatus" "enum_void_requests_secondBidderOffer_offerStatus",
  "secondBidderOffer_offeredAt" TIMESTAMP(3) WITH TIME ZONE,
  "secondBidderOffer_respondedAt" TIMESTAMP(3) WITH TIME ZONE,
  updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS void_requests_created_at_idx ON void_requests(created_at);

-- Create void_requests_rels table for relationships
CREATE TABLE IF NOT EXISTS void_requests_rels (
  id SERIAL PRIMARY KEY,
  "order" INTEGER,
  parent_id INTEGER NOT NULL REFERENCES void_requests(id) ON DELETE CASCADE,
  path VARCHAR NOT NULL,
  transactions_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
  products_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  users_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS void_requests_rels_order_idx ON void_requests_rels("order");
CREATE INDEX IF NOT EXISTS void_requests_rels_parent_idx ON void_requests_rels(parent_id);
CREATE INDEX IF NOT EXISTS void_requests_rels_path_idx ON void_requests_rels(path);

-- Add void_requests_id to transactions_rels
DO $$ BEGIN
  ALTER TABLE transactions_rels ADD COLUMN void_requests_id INTEGER REFERENCES void_requests(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN null;
END $$;

CREATE INDEX IF NOT EXISTS transactions_rels_void_requests_id_idx ON transactions_rels(void_requests_id);

-- Log completion
DO $$ BEGIN
  RAISE NOTICE 'Migration 001_void_requests completed successfully';
END $$;
