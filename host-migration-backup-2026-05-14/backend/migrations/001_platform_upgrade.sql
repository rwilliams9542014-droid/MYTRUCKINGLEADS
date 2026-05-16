-- Platform upgrade for carrier profiles, subscriptions, caching, and CRM follow-up.
-- Safe to run more than once on PostgreSQL.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS billing_city TEXT,
  ADD COLUMN IF NOT EXISTS billing_state TEXT,
  ADD COLUMN IF NOT EXISTS billing_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS billing_country TEXT DEFAULT 'US';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
  ON users (lower(username))
  WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'basic',
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);

ALTER TABLE carriers
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS dba_name TEXT,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS out_of_service_date DATE,
  ADD COLUMN IF NOT EXISTS mcs150_date DATE,
  ADD COLUMN IF NOT EXISTS mcs150_mileage INTEGER,
  ADD COLUMN IF NOT EXISTS carrier_operation_type TEXT,
  ADD COLUMN IF NOT EXISTS authority_status TEXT,
  ADD COLUMN IF NOT EXISTS insurance_company TEXT,
  ADD COLUMN IF NOT EXISTS insurance_filing_status TEXT,
  ADD COLUMN IF NOT EXISTS cargo_insurance TEXT,
  ADD COLUMN IF NOT EXISTS safety_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_enrichment_data JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_carriers_authority_status ON carriers(authority_status);
CREATE INDEX IF NOT EXISTS idx_carriers_operating_status ON carriers(operating_status);
CREATE INDEX IF NOT EXISTS idx_carriers_safety_data ON carriers USING GIN (safety_data);
CREATE INDEX IF NOT EXISTS idx_carriers_contact_enrichment_data ON carriers USING GIN (contact_enrichment_data);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS follow_up_date DATE,
  ADD COLUMN IF NOT EXISTS saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_leads_follow_up_date ON leads(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_saved_at ON leads(saved_at);

CREATE TABLE IF NOT EXISTS fmcsa_cache (
  id SERIAL PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  dot_number TEXT,
  payload JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fmcsa_cache_key ON fmcsa_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_fmcsa_cache_dot ON fmcsa_cache(dot_number);
CREATE INDEX IF NOT EXISTS idx_fmcsa_cache_expires ON fmcsa_cache(expires_at);
