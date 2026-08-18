#!/usr/bin/env bash
# ============================================================================
# setup.sh — Self-Healing Scraper Setup
# ============================================================================
# This script prepares the environment for the self-healing scraper:
#   1. Checks for / installs the Bright Data CLI (@brightdata/cli)
#   2. Runs interactive login if not already authenticated
#   3. Installs npm dependencies
#   4. Creates the scraper via the CLI (writes collector_id to config.json)
#
# Required environment variables (see .env.example):
#   BRIGHTDATA_API_KEY  — your Bright Data API key
#
# Usage:
#   chmod +x setup.sh && ./setup.sh
# ============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Self-Healing Scraper — Setup           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo

# ---------- Step 1: Check for Bright Data CLI ----------
echo -e "${YELLOW}[1/4] Checking for Bright Data CLI (bdata)...${NC}"
if command -v bdata &> /dev/null; then
    BDATA_VERSION=$(bdata --version 2>/dev/null || echo "unknown")
    echo -e "  ✅ bdata found (version: ${BDATA_VERSION})"
else
    echo -e "  ⚠️  bdata not found. Installing @brightdata/cli globally..."
    npm install -g @brightdata/cli
    echo -e "  ✅ @brightdata/cli installed"
fi
echo

# ---------- Step 2: Authenticate ----------
echo -e "${YELLOW}[2/4] Checking Bright Data authentication...${NC}"
echo -e "  Running 'bdata login' — this will open your browser if needed."
echo -e "  If you're already logged in, this will confirm your session."
bdata login || {
    echo -e "${RED}  ❌ Login failed. Please run 'bdata login' manually and try again.${NC}"
    exit 1
}
echo -e "  ✅ Authenticated with Bright Data"
echo

# ---------- Step 3: Install npm dependencies ----------
echo -e "${YELLOW}[3/4] Installing npm dependencies...${NC}"
npm install
echo -e "  ✅ Dependencies installed"
echo

# ---------- Step 4: Create scraper ----------
echo -e "${YELLOW}[4/4] Creating scraper via Bright Data CLI...${NC}"
echo -e "  This uses AI to build a scraper for FreeJobAlert.com."
echo -e "  The resulting collector_id will be saved to config.json."
node src/create-scraper.js
echo

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ Setup complete!                     ║${NC}"
echo -e "${GREEN}║                                          ║${NC}"
echo -e "${GREEN}║   Next steps:                            ║${NC}"
echo -e "${GREEN}║   1. cp .env.example .env                ║${NC}"
echo -e "${GREEN}║   2. Edit .env with your collector_id    ║${NC}"
echo -e "${GREEN}║   3. npm start  (cron mode)              ║${NC}"
echo -e "${GREEN}║      npm run scrape  (one-shot)          ║${NC}"
echo -e "${GREEN}║      npm run dashboard  (web UI)         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
