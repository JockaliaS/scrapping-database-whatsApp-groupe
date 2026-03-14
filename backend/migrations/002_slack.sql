-- Migration 002: Slack integration (source + alerts)

-- Slack webhook URL on profiles (for sending opportunity alerts to Slack)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT;

-- Source column on groups to distinguish WhatsApp vs Slack channels
ALTER TABLE groups ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'whatsapp';

-- Slack connections (parallel to whatsapp_connections)
CREATE TABLE IF NOT EXISTS slack_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id VARCHAR(255),
  team_name VARCHAR(255),
  bot_token TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_connections_user_id ON slack_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_groups_source ON groups(source);
