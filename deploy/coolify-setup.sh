#!/bin/bash
# ============================================================
# Radar — Coolify Deployment Script
# ============================================================
# Usage:
#   COOLIFY_TOKEN=your_token COOLIFY_URL=https://coolify.jockaliaservices.fr ./deploy/coolify-setup.sh
#
# Prerequisites:
#   - Coolify instance running
#   - API token from Coolify Settings > API > Tokens
#   - jq installed (brew install jq)
# ============================================================

set -euo pipefail

COOLIFY_URL="${COOLIFY_URL:-https://coolify.jockaliaservices.fr}"
COOLIFY_TOKEN="${COOLIFY_TOKEN:?Set COOLIFY_TOKEN environment variable}"
API="${COOLIFY_URL}/api/v1"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

call_api() {
  local method=$1 endpoint=$2
  shift 2
  curl -s -X "$method" "${API}${endpoint}" \
    -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    -H "Content-Type: application/json" \
    "$@"
}

# ============================================================
# Step 1: Verify Coolify connection
# ============================================================
echo ""
echo "=============================="
echo "  Radar — Coolify Deployment"
echo "=============================="
echo ""

log "Testing Coolify API connection..."
HEALTH=$(curl -s --connect-timeout 5 "${API}/health" 2>/dev/null || echo "FAIL")
if [ "$HEALTH" != "OK" ]; then
  err "Cannot reach Coolify API at ${COOLIFY_URL}"
fi
log "Coolify API is reachable"

# Verify token
TEAMS=$(call_api GET /teams 2>/dev/null)
if echo "$TEAMS" | grep -q "Unauthenticated"; then
  err "Invalid Coolify API token"
fi
log "API token validated"

# ============================================================
# Step 2: Get available servers
# ============================================================
log "Fetching servers..."
SERVERS=$(call_api GET /servers)
SERVER_UUID=$(echo "$SERVERS" | jq -r '.[0].uuid // empty')

if [ -z "$SERVER_UUID" ]; then
  err "No servers found in Coolify"
fi
SERVER_NAME=$(echo "$SERVERS" | jq -r '.[0].name')
log "Using server: ${SERVER_NAME} (${SERVER_UUID})"

# ============================================================
# Step 3: Create project
# ============================================================
log "Creating project 'Radar'..."
PROJECT=$(call_api POST /projects -d '{"name":"Radar","description":"WhatsApp Community Intelligence SaaS"}')
PROJECT_UUID=$(echo "$PROJECT" | jq -r '.uuid // empty')

if [ -z "$PROJECT_UUID" ]; then
  warn "Project may already exist, trying to find it..."
  PROJECTS=$(call_api GET /projects)
  PROJECT_UUID=$(echo "$PROJECTS" | jq -r '.[] | select(.name=="Radar") | .uuid' | head -1)
  if [ -z "$PROJECT_UUID" ]; then
    err "Cannot create or find project"
  fi
fi
log "Project UUID: ${PROJECT_UUID}"

# Get default environment
ENVS=$(call_api GET "/projects/${PROJECT_UUID}/environments")
ENV_NAME=$(echo "$ENVS" | jq -r '.[0].name // "production"')
log "Environment: ${ENV_NAME}"

# ============================================================
# Step 4: Create PostgreSQL database
# ============================================================
log "Creating PostgreSQL 15 database..."
PG_PASSWORD=$(openssl rand -hex 16)

PG_RESULT=$(call_api POST /databases -d "{
  \"server_uuid\": \"${SERVER_UUID}\",
  \"project_uuid\": \"${PROJECT_UUID}\",
  \"environment_name\": \"${ENV_NAME}\",
  \"type\": \"postgresql\",
  \"name\": \"radar-postgres\",
  \"image\": \"postgres:15-alpine\",
  \"postgres_user\": \"radar\",
  \"postgres_password\": \"${PG_PASSWORD}\",
  \"postgres_db\": \"radar\",
  \"is_public\": false
}")

PG_UUID=$(echo "$PG_RESULT" | jq -r '.uuid // empty')
if [ -z "$PG_UUID" ]; then
  warn "PostgreSQL may already exist"
  warn "Response: $(echo "$PG_RESULT" | head -c 200)"
else
  log "PostgreSQL created: ${PG_UUID}"
fi

# ============================================================
# Step 5: Create Redis
# ============================================================
log "Creating Redis..."
REDIS_RESULT=$(call_api POST /databases -d "{
  \"server_uuid\": \"${SERVER_UUID}\",
  \"project_uuid\": \"${PROJECT_UUID}\",
  \"environment_name\": \"${ENV_NAME}\",
  \"type\": \"redis\",
  \"name\": \"radar-redis\",
  \"image\": \"redis:7-alpine\",
  \"is_public\": false
}")

REDIS_UUID=$(echo "$REDIS_RESULT" | jq -r '.uuid // empty')
if [ -z "$REDIS_UUID" ]; then
  warn "Redis may already exist"
  warn "Response: $(echo "$REDIS_RESULT" | head -c 200)"
else
  log "Redis created: ${REDIS_UUID}"
fi

# ============================================================
# Step 6: Deploy application from docker-compose
# ============================================================
log "Creating application from GitHub repository..."

# Source environment variables
source "$(dirname "$0")/../.env.production"

APP_RESULT=$(call_api POST /applications -d "{
  \"server_uuid\": \"${SERVER_UUID}\",
  \"project_uuid\": \"${PROJECT_UUID}\",
  \"environment_name\": \"${ENV_NAME}\",
  \"type\": \"docker-compose\",
  \"name\": \"radar-app\",
  \"git_repository\": \"JockaliaS/scrapping-database-whatsApp-groupe\",
  \"git_branch\": \"main\",
  \"docker_compose_location\": \"/docker-compose.yml\",
  \"instant_deploy\": false
}")

APP_UUID=$(echo "$APP_RESULT" | jq -r '.uuid // empty')
if [ -z "$APP_UUID" ]; then
  warn "Application may already exist"
  warn "Response: $(echo "$APP_RESULT" | head -c 200)"
else
  log "Application created: ${APP_UUID}"
fi

# ============================================================
# Summary
# ============================================================
echo ""
echo "=============================="
echo "  Deployment Summary"
echo "=============================="
echo ""
log "Project: Radar (${PROJECT_UUID})"
echo "  PostgreSQL: ${PG_UUID:-existing}"
echo "  Redis: ${REDIS_UUID:-existing}"
echo "  Application: ${APP_UUID:-existing}"
echo ""
warn "NEXT STEPS (in Coolify UI):"
echo ""
echo "  1. Go to the Radar project in Coolify"
echo ""
echo "  2. Configure PostgreSQL:"
echo "     - Start the database"
echo "     - Note the internal connection URL"
echo ""
echo "  3. Configure Redis:"
echo "     - Start the database"
echo "     - Note the internal connection URL"
echo ""
echo "  4. Configure the Application environment variables:"
echo "     DATABASE_URL=<postgres_internal_url>"
echo "     REDIS_URL=<redis_internal_url>"
echo "     JWT_SECRET=${JWT_SECRET}"
echo "     RADAR_WEBHOOK_SECRET=${RADAR_WEBHOOK_SECRET}"
echo "     EVOLUTION_API_URL=${EVOLUTION_API_URL}"
echo "     APP_ENV=production"
echo "     RUST_LOG=info"
echo "     FRONTEND_URL=https://radar.jockaliaservices.fr"
echo "     BACKEND_URL=https://api.radar.jockaliaservices.fr"
echo ""
echo "  5. Configure domains in Coolify:"
echo "     radar-backend  → api.radar.jockaliaservices.fr"
echo "     radar-frontend → radar.jockaliaservices.fr"
echo ""
echo "  6. Deploy the application"
echo ""
echo "  7. After deployment, configure in Radar Admin UI:"
echo "     - Gemini API key"
echo "     - Evolution API key"
echo ""
echo "  8. Add RADAR_WEBHOOK_SECRET to your existing Node.js app:"
echo "     RADAR_WEBHOOK_SECRET=${RADAR_WEBHOOK_SECRET}"
echo "     RADAR_WEBHOOK_URL=https://api.radar.jockaliaservices.fr/webhook/hub-spoke"
echo ""
log "Done! Check Coolify UI for the next steps."
