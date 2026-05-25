/*
  # Create quote_requests table

  1. New Tables
    - `quote_requests`
      - `id` (uuid, primary key) - Unique identifier for each quote request
      - `company_name` (text, required) - Trucking company name
      - `dot_number` (text, optional) - DOT number if available
      - `contact_name` (text, required) - Contact person's name
      - `email` (text, required) - Contact email
      - `phone` (text, optional) - Contact phone number
      - `state` (text, required) - State of operation
      - `fleet_size` (integer, optional) - Number of trucks
      - `coverage_type` (text, default 'auto_liability') - Type of coverage needed
      - `message` (text, optional) - Additional details
      - `status` (text, default 'new') - Processing status (new, assigned, contacted, closed)
      - `assigned_agent_id` (uuid, optional) - Agent this lead was assigned to
      - `created_at` (timestamptz) - When the request was submitted

  2. Security
    - Enable RLS on `quote_requests` table
    - Add policy for anonymous inserts (truckers filling out the form)
    - Add policy for authenticated agents to read assigned leads
*/

CREATE TABLE IF NOT EXISTS quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  dot_number text,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text,
  state text NOT NULL,
  fleet_size integer,
  coverage_type text NOT NULL DEFAULT 'auto_liability',
  message text,
  status text NOT NULL DEFAULT 'new',
  assigned_agent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;

-- Allow anyone to submit a quote request (public form for truckers)
CREATE POLICY "Anyone can submit a quote request"
  ON quote_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'new'
    AND assigned_agent_id IS NULL
  );

-- Authenticated agents can view quote requests assigned to them
CREATE POLICY "Agents can view their assigned quote requests"
  ON quote_requests
  FOR SELECT
  TO authenticated
  USING (assigned_agent_id = auth.uid());

-- Create index for efficient filtering by status and assignment
CREATE INDEX IF NOT EXISTS idx_quote_requests_status ON quote_requests (status);
CREATE INDEX IF NOT EXISTS idx_quote_requests_agent ON quote_requests (assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quote_requests_created ON quote_requests (created_at DESC);
