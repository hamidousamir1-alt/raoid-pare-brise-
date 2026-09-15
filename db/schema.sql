-- Rapid Pare-Brise CRM — durable PostgreSQL schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sector text,
  zone text,
  address text,
  fleet text,
  phone text,
  status text NOT NULL DEFAULT 'Nouveau',
  score integer NOT NULL DEFAULT 50 CHECK (score BETWEEN 0 AND 100),
  notes text,
  next_action text,
  access text NOT NULL DEFAULT 'À vérifier',
  insurance text NOT NULL DEFAULT 'À vérifier',
  place_id text,
  latitude double precision,
  longitude double precision,
  signed_revenue numeric(12,2) NOT NULL DEFAULT 0,
  generated_revenue numeric(12,2) NOT NULL DEFAULT 0,
  potential_revenue numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS prospects_status_idx ON prospects(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS prospects_zone_idx ON prospects(zone) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS prospects_updated_idx ON prospects(updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS prospect_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prospect_events_prospect_idx ON prospect_events(prospect_id,created_at DESC);

-- Never physically delete commercial history from the application.
-- DELETE operations must set prospects.deleted_at and write a prospect_events record.
