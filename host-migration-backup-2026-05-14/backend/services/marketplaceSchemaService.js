import { query } from "../config/db.js";

export async function ensureMarketplaceSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS quote_requests (
      id SERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      dot_number TEXT,
      mc_number TEXT,
      years_in_business INTEGER,
      power_units INTEGER NOT NULL DEFAULT 0,
      driver_count INTEGER NOT NULL DEFAULT 0,
      cargo_hauled TEXT,
      states_operated TEXT,
      primary_state TEXT,
      contact_name TEXT NOT NULL,
      contact_title TEXT,
      phone_number TEXT NOT NULL,
      email_address TEXT NOT NULL,
      current_insurance_company TEXT,
      current_premium NUMERIC(12, 2),
      renewal_date DATE,
      coverage_types_needed TEXT,
      actively_shopping BOOLEAN NOT NULL DEFAULT false,
      coverage_needed_within TEXT,
      additional_comments TEXT,
      lead_tier TEXT NOT NULL DEFAULT 'Bronze',
      lead_score INTEGER NOT NULL DEFAULT 0,
      lead_price NUMERIC(10, 2) NOT NULL DEFAULT 20,
      status TEXT NOT NULL DEFAULT 'Available',
      purchased_at TIMESTAMPTZ,
      purchased_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_exclusive BOOLEAN NOT NULL DEFAULT true,
      document_count INTEGER NOT NULL DEFAULT 0,
      document_completion_percent INTEGER NOT NULL DEFAULT 0,
      required_documents_submitted INTEGER NOT NULL DEFAULT 0,
      required_documents_total INTEGER NOT NULL DEFAULT 6,
      document_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
      contact_verified BOOLEAN NOT NULL DEFAULT false,
      data_completeness_score INTEGER NOT NULL DEFAULT 0,
      renewal_proximity_days INTEGER,
      standard_access_at TIMESTAMPTZ DEFAULT NOW(),
      submission_source TEXT DEFAULT 'public_quote_request',
      submission_ip TEXT,
      submission_user_agent TEXT,
      ai_extraction_status TEXT NOT NULL DEFAULT 'pending',
      extracted_current_carrier TEXT,
      extracted_current_premium NUMERIC(12, 2),
      extracted_coverage_limits TEXT,
      extracted_vin_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
      extracted_vehicle_count INTEGER,
      extracted_driver_names JSONB NOT NULL DEFAULT '[]'::jsonb,
      extracted_driver_license_states JSONB NOT NULL DEFAULT '[]'::jsonb,
      extracted_loss_history_summary TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    ALTER TABLE quote_requests
      ADD COLUMN IF NOT EXISTS primary_state TEXT,
      ADD COLUMN IF NOT EXISTS document_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS document_completion_percent INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS required_documents_submitted INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS required_documents_total INTEGER NOT NULL DEFAULT 6,
      ADD COLUMN IF NOT EXISTS document_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS contact_verified BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS data_completeness_score INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS renewal_proximity_days INTEGER,
      ADD COLUMN IF NOT EXISTS standard_access_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS submission_source TEXT DEFAULT 'public_quote_request',
      ADD COLUMN IF NOT EXISTS submission_ip TEXT,
      ADD COLUMN IF NOT EXISTS submission_user_agent TEXT,
      ADD COLUMN IF NOT EXISTS ai_extraction_status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS extracted_current_carrier TEXT,
      ADD COLUMN IF NOT EXISTS extracted_current_premium NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS extracted_coverage_limits TEXT,
      ADD COLUMN IF NOT EXISTS extracted_vin_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS extracted_vehicle_count INTEGER,
      ADD COLUMN IF NOT EXISTS extracted_driver_names JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS extracted_driver_license_states JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS extracted_loss_history_summary TEXT
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS lead_documents (
      id SERIAL PRIMARY KEY,
      quote_request_id INTEGER NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      file_size BIGINT NOT NULL,
      mime_type TEXT NOT NULL,
      storage_location TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT,
      ai_extraction_status TEXT NOT NULL DEFAULT 'pending',
      ai_extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  await query(`
    ALTER TABLE lead_documents
      ADD COLUMN IF NOT EXISTS stored_filename TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS review_notes TEXT,
      ADD COLUMN IF NOT EXISTS ai_extraction_status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS ai_extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb
  `);

  await query(`
    UPDATE lead_documents
    SET stored_filename = COALESCE(NULLIF(stored_filename, ''), original_filename)
    WHERE stored_filename IS NULL OR stored_filename = ''
  `);

  await query(`
    ALTER TABLE lead_documents
      ALTER COLUMN stored_filename SET NOT NULL
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS lead_purchases (
      id SERIAL PRIMARY KEY,
      quote_request_id INTEGER NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      list_price NUMERIC(10, 2) NOT NULL,
      purchase_amount NUMERIC(10, 2) NOT NULL,
      lead_tier TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'completed',
      stripe_payment_intent_id TEXT,
      used_credit BOOLEAN NOT NULL DEFAULT false,
      credit_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
      exclusive_access BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(quote_request_id, user_id)
    )
  `);

  await query(`
    ALTER TABLE lead_purchases
      ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
      ADD COLUMN IF NOT EXISTS used_credit BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS credit_value NUMERIC(10, 2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS exclusive_access BOOLEAN NOT NULL DEFAULT true
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS lead_credit_usage (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quote_request_id INTEGER NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
      purchase_id INTEGER REFERENCES lead_purchases(id) ON DELETE SET NULL,
      credits_used INTEGER NOT NULL DEFAULT 1,
      credit_type TEXT NOT NULL DEFAULT 'elite-monthly',
      credit_month TEXT NOT NULL,
      discount_applied NUMERIC(10, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, quote_request_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS marketplace_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quote_request_id INTEGER REFERENCES quote_requests(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'in_app',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      delivery_status TEXT NOT NULL DEFAULT 'queued',
      emailed_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    ALTER TABLE marketplace_notifications
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'queued',
      ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_quote_requests_status_created
      ON quote_requests (status, created_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_quote_requests_tier_created
      ON quote_requests (lead_tier, created_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_quote_requests_purchased_by
      ON quote_requests (purchased_by)
      WHERE purchased_by IS NOT NULL
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_quote_requests_standard_access
      ON quote_requests (standard_access_at)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_lead_documents_quote_request_id
      ON lead_documents (quote_request_id, uploaded_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_lead_documents_status
      ON lead_documents (status)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_lead_purchases_user_id
      ON lead_purchases (user_id, created_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_lead_purchases_quote_request_id
      ON lead_purchases (quote_request_id)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_lead_credit_usage_user_month
      ON lead_credit_usage (user_id, credit_month)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_marketplace_notifications_user
      ON marketplace_notifications (user_id, created_at DESC)
  `);
}
