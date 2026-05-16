-- ============================================
-- USERS TABLE - User accounts and subscriptions
-- ============================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  username TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  business_name TEXT,
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_postal_code TEXT,
  billing_country TEXT DEFAULT 'US',
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'basic',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT DEFAULT NULL,
  subscription_expires_at TIMESTAMP WITH TIME ZONE,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  daily_profile_views INTEGER NOT NULL DEFAULT 0,
  daily_contact_views INTEGER NOT NULL DEFAULT 0,
  daily_saved_prospects INTEGER NOT NULL DEFAULT 0,
  last_usage_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SUBSCRIPTIONS TABLE - Stripe subscription records
-- ============================================
CREATE TABLE subscriptions (
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

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);

-- ============================================
-- CARRIERS TABLE - DOT/MC carrier data from FMCSA
-- ============================================
CREATE TABLE carriers (
  id SERIAL PRIMARY KEY,
  dot_number TEXT UNIQUE,
  mc_number TEXT UNIQUE,
  carrier_name TEXT NOT NULL,
  business_type TEXT,
  legal_name TEXT,
  dba_name TEXT,
  entity_type TEXT,
  safety_rating TEXT,
  safety_rating_date DATE,
  insurance_expiration DATE,
  insurance_company TEXT,
  insurance_filing_status TEXT,
  insurance_policy_number TEXT,
  cargo_insurance TEXT,
  vehicle_count INTEGER,
  driver_count INTEGER,
  mcs150_date DATE,
  mcs150_mileage INTEGER,
  carrier_operation_type TEXT,
  hq_address TEXT,
  hq_city TEXT,
  hq_state TEXT,
  hq_zip TEXT,
  mailing_address TEXT,
  mailing_city TEXT,
  mailing_state TEXT,
  mailing_zip TEXT,
  phone TEXT,
  fax TEXT,
  email TEXT,
  website TEXT,
  cargo_types TEXT[],
  operating_status TEXT,
  authority_status TEXT,
  out_of_service_date DATE,
  hazmat_endorsement BOOLEAN,
  passenger_endorsement BOOLEAN,
  safety_data JSONB DEFAULT '{}'::jsonb,
  contact_enrichment_data JSONB DEFAULT '{}'::jsonb,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_carriers_dot ON carriers(dot_number);
CREATE INDEX idx_carriers_mc ON carriers(mc_number);
CREATE INDEX idx_carriers_insurance_exp ON carriers(insurance_expiration);
CREATE INDEX idx_carriers_safety_rating ON carriers(safety_rating);
CREATE INDEX idx_carriers_name ON carriers(carrier_name);
CREATE INDEX idx_carriers_authority_status ON carriers(authority_status);
CREATE INDEX idx_carriers_operating_status ON carriers(operating_status);
CREATE INDEX idx_carriers_safety_data ON carriers USING GIN (safety_data);
CREATE INDEX idx_carriers_contact_enrichment_data ON carriers USING GIN (contact_enrichment_data);

-- ============================================
-- ENRICHED_CARRIER_DATA TABLE - Contact info from multiple sources
-- ============================================
CREATE TABLE enriched_carrier_data (
  id SERIAL PRIMARY KEY,
  carrier_id INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  email TEXT,
  email_source TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  phone TEXT,
  phone_source TEXT,
  phone_verified BOOLEAN DEFAULT FALSE,
  address TEXT,
  address_source TEXT,
  address_verified BOOLEAN DEFAULT FALSE,
  website TEXT,
  website_source TEXT,
  additional_emails TEXT[],
  additional_phones TEXT[],
  data_sources TEXT[],
  free_sources_used TEXT[],
  premium_sources_used TEXT[],
  data_completeness_percent INTEGER,
  enrichment_timestamp TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_enriched_carrier_id ON enriched_carrier_data(carrier_id);
CREATE INDEX idx_enriched_email_verified ON enriched_carrier_data(email_verified);

-- ============================================
-- LEADS TABLE - Carriers saved by users
-- ============================================
CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  carrier_id INTEGER REFERENCES carriers(id) ON DELETE SET NULL,
  carrier_name TEXT NOT NULL,
  dot_number TEXT,
  mc_number TEXT,
  status TEXT NOT NULL DEFAULT 'New Lead',
  priority TEXT DEFAULT 'Medium',
  last_contact DATE,
  follow_up_date DATE,
  insurance_expiration DATE,
  notes TEXT,
  is_new_entrant BOOLEAN DEFAULT FALSE,
  is_insurance_expiring BOOLEAN DEFAULT FALSE,
  saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_leads_user_id ON leads(user_id);
CREATE INDEX idx_leads_carrier_id ON leads(carrier_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_insurance_expiration ON leads(insurance_expiration) WHERE insurance_expiration IS NOT NULL;
CREATE INDEX idx_leads_new_entrant ON leads(is_new_entrant) WHERE is_new_entrant = TRUE;
CREATE INDEX idx_leads_follow_up_date ON leads(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX idx_leads_saved_at ON leads(saved_at);

-- ============================================
-- FMCSA_CACHE TABLE - Cache public FMCSA responses by DOT/source
-- ============================================
CREATE TABLE fmcsa_cache (
  id SERIAL PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  dot_number TEXT,
  payload JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_fmcsa_cache_key ON fmcsa_cache(cache_key);
CREATE INDEX idx_fmcsa_cache_dot ON fmcsa_cache(dot_number);
CREATE INDEX idx_fmcsa_cache_expires ON fmcsa_cache(expires_at);

-- ============================================
-- TEAM_MEMBERS TABLE - Additional logins under a subscription owner
-- ============================================
CREATE TABLE team_members (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'invited',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(owner_user_id, email)
);

CREATE INDEX idx_team_members_owner ON team_members(owner_user_id);
CREATE INDEX idx_team_members_status ON team_members(status);

-- ============================================
-- NEW_ENTRANT_ALERTS TABLE - Track newly approved carriers
-- ============================================
CREATE TABLE new_entrant_alerts (
  id SERIAL PRIMARY KEY,
  carrier_id INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  carrier_name TEXT NOT NULL,
  dot_number TEXT NOT NULL,
  approval_date DATE,
  state TEXT,
  alerted_to_users TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_new_entrant_carrier_id ON new_entrant_alerts(carrier_id);
CREATE INDEX idx_new_entrant_approval_date ON new_entrant_alerts(approval_date);

-- ============================================
-- INSURANCE_EXPIRATION_ALERTS TABLE - Track expiring insurance
-- ============================================
CREATE TABLE insurance_expiration_alerts (
  id SERIAL PRIMARY KEY,
  carrier_id INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  carrier_name TEXT NOT NULL,
  dot_number TEXT NOT NULL,
  insurance_expiration DATE NOT NULL,
  expiration_month INTEGER,
  expiration_year INTEGER,
  days_until_expiration INTEGER,
  alerted_to_users TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_insurance_carrier_id ON insurance_expiration_alerts(carrier_id);
CREATE INDEX idx_insurance_expiration_date ON insurance_expiration_alerts(insurance_expiration);
CREATE INDEX idx_insurance_month_year ON insurance_expiration_alerts(expiration_year, expiration_month);

-- ============================================
-- SEARCH_HISTORY TABLE - Track user searches for analytics
-- ============================================
CREATE TABLE search_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  search_type TEXT,
  search_term TEXT,
  result_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_search_history_user_id ON search_history(user_id);
CREATE INDEX idx_search_history_created_at ON search_history(created_at);

-- ============================================
-- API_USAGE_LOG TABLE - Track API requests for rate limiting and analytics
-- ============================================
CREATE TABLE api_usage_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_api_usage_user_id ON api_usage_log(user_id);
CREATE INDEX idx_api_usage_created_at ON api_usage_log(created_at);
CREATE INDEX idx_api_usage_endpoint ON api_usage_log(endpoint);

-- ============================================
-- STRIPE_EVENTS TABLE - Log webhook events
-- ============================================
CREATE TABLE stripe_events (
  id SERIAL PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_id TEXT,
  subscription_id TEXT,
  amount_cents INTEGER,
  currency TEXT,
  status TEXT,
  raw_data JSONB,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_stripe_events_event_id ON stripe_events(event_id);
CREATE INDEX idx_stripe_events_user_id ON stripe_events(user_id);
CREATE INDEX idx_stripe_events_event_type ON stripe_events(event_type);
CREATE INDEX idx_stripe_events_created_at ON stripe_events(created_at);
