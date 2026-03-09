CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT true,
  language VARCHAR(10) NOT NULL DEFAULT 'fr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_text TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  anti_keywords TEXT[] NOT NULL DEFAULT '{}',
  intentions TEXT[] NOT NULL DEFAULT '{}',
  sector VARCHAR(255),
  min_score INTEGER NOT NULL DEFAULT 60,
  alert_number VARCHAR(50),
  alert_template TEXT,
  sharing_enabled BOOLEAN NOT NULL DEFAULT false,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instance_name VARCHAR(255),
  connected_number VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'disconnected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  whatsapp_group_id VARCHAR(255) NOT NULL,
  name VARCHAR(500) NOT NULL,
  member_count INTEGER DEFAULT 0,
  last_activity TIMESTAMPTZ,
  is_monitored BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, whatsapp_group_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_name VARCHAR(255),
  sender_phone VARCHAR(50),
  content TEXT NOT NULL,
  whatsapp_timestamp TIMESTAMPTZ NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_announcements INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id),
  group_id UUID NOT NULL REFERENCES groups(id),
  contact_id UUID REFERENCES contacts(id),
  score INTEGER NOT NULL,
  matched_keywords TEXT[] NOT NULL DEFAULT '{}',
  context_analysis TEXT,
  suggested_reply TEXT,
  is_demand BOOLEAN DEFAULT false,
  is_offer BOOLEAN DEFAULT false,
  status VARCHAR(50) NOT NULL DEFAULT 'new',
  alert_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE alert_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE system_config (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hub_spoke_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_app VARCHAR(255) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used TIMESTAMPTZ
);

-- Add webhook_url to whatsapp_connections
ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS webhook_url VARCHAR(500);

-- Indexes
CREATE INDEX idx_messages_group_id ON messages(group_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_opportunities_user_id ON opportunities(user_id);
CREATE INDEX idx_opportunities_created_at ON opportunities(created_at DESC);
CREATE INDEX idx_opportunities_status ON opportunities(status);
CREATE INDEX idx_groups_user_id ON groups(user_id);
CREATE INDEX idx_contacts_phone ON contacts(phone);

-- Webhook events tracking
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'evolution',
  remote_jid VARCHAR(255),
  is_group BOOLEAN NOT NULL DEFAULT false,
  is_monitored_group BOOLEAN NOT NULL DEFAULT false,
  group_db_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at DESC);
CREATE INDEX idx_webhook_events_user_id ON webhook_events(user_id, created_at DESC);

-- Default system config
INSERT INTO system_config (key, value) VALUES
  ('default_alert_template', E'\U0001F3AF *RADAR - Nouvelle opportunit\u00e9*\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\U0001F4CA Score : *{{score}}%*\n\U0001F464 Contact : {{contact}} ({{phone}})\n\U0001F4AC Groupe : _{{group}}_\n\U0001F550 {{date}}\n\n\U0001F4DD *Message :*\n{{message}}\n\n\U0001F4A1 *Suggestion de r\u00e9ponse :*\n{{suggestion}}\n\n\U0001F517 Voir dans Radar : {{link}}\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501'),
  ('app_version', '1.0.0');
