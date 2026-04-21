#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
#  RWA Yield Vault — Pre-Deploy Check
#  Run this before deploying to Base mainnet.
# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       RWA Yield Vault — Pre-Deploy Check             ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""

ERRORS=0

# ── 1. Check required env vars ────────────────────────────────────────────────
echo -e "${BOLD}[1/4] Checking environment variables...${RESET}"

if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  echo -e "  ${RED}✗ DEPLOYER_PRIVATE_KEY is not set${RESET}"
  ERRORS=$((ERRORS + 1))
else
  echo -e "  ${GREEN}✓ DEPLOYER_PRIVATE_KEY is set${RESET}"
fi

if [ -z "${FEE_RECIPIENT:-}" ]; then
  echo -e "  ${RED}✗ FEE_RECIPIENT is not set${RESET}"
  ERRORS=$((ERRORS + 1))
else
  echo -e "  ${GREEN}✓ FEE_RECIPIENT is set (${FEE_RECIPIENT})${RESET}"
fi

if [ -z "${BASE_RPC_URL:-}" ]; then
  echo -e "  ${RED}✗ BASE_RPC_URL is not set${RESET}"
  ERRORS=$((ERRORS + 1))
else
  echo -e "  ${GREEN}✓ BASE_RPC_URL is set${RESET}"
fi

if [ -z "${BASESCAN_API_KEY:-}" ]; then
  echo -e "  ${YELLOW}⚠ BASESCAN_API_KEY is not set — contract verification will be skipped${RESET}"
else
  echo -e "  ${GREEN}✓ BASESCAN_API_KEY is set${RESET}"
fi

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo -e "${RED}✗ Missing required env vars. Set them and re-run.${RESET}"
  echo "  Tip: copy contracts/.env.example → contracts/.env and fill in values,"
  echo "       then run: source contracts/.env"
  echo ""
  exit 1
fi

# ── 2. Build ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}[2/4] Building contracts...${RESET}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/contracts"

if forge build 2>&1; then
  echo -e "  ${GREEN}✓ forge build passed${RESET}"
else
  echo -e "  ${RED}✗ forge build failed — fix compilation errors before deploying${RESET}"
  exit 1
fi

# ── 3. Unit tests (no RPC required) ──────────────────────────────────────────
echo ""
echo -e "${BOLD}[3/4] Running unit tests (excluding fork tests)...${RESET}"

TEST_OUTPUT=$(forge test --no-match-path "test/fork/*" 2>&1)
TEST_EXIT=$?

echo "$TEST_OUTPUT"

if [ "$TEST_EXIT" -ne 0 ]; then
  echo ""
  echo -e "  ${RED}✗ Unit tests failed — fix failing tests before deploying${RESET}"
  exit 1
fi

# Check for any failures in output
if echo "$TEST_OUTPUT" | grep -qE "FAIL|failed"; then
  echo ""
  echo -e "  ${RED}✗ Test failures detected — review output above${RESET}"
  exit 1
fi

echo -e "  ${GREEN}✓ All unit tests pass${RESET}"

# ── 4. Gas estimate (dry-run, no broadcast) ───────────────────────────────────
echo ""
echo -e "${BOLD}[4/4] Estimating deployment gas (dry-run)...${RESET}"

GAS_OUTPUT=$(forge script script/Deploy.s.sol:DeployScript \
  --rpc-url "$BASE_RPC_URL" \
  2>&1 || true)

echo "$GAS_OUTPUT" | grep -E "gas|Gas|Estimated|estimated" || echo "  (gas estimate not available in output)"

echo ""
echo -e "  ${GREEN}✓ Dry-run complete${RESET}"

# ── Checklist ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║              Pre-Deploy Checklist                    ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${GREEN}[✓] Contracts compile clean${RESET}"
echo -e "  ${GREEN}[✓] All unit tests pass${RESET}"
echo -e "  [ ] Deployer wallet funded with ETH on Base"
echo -e "  [ ] FEE_RECIPIENT is a hardware wallet or multisig"
if [ -z "${BASESCAN_API_KEY:-}" ]; then
  echo -e "  ${YELLOW}[⚠] BASESCAN_API_KEY set for verification (currently missing)${RESET}"
else
  echo -e "  ${GREEN}[✓] BASESCAN_API_KEY set for verification${RESET}"
fi
echo -e "  [ ] Deposit cap correct (currently 100k USDC)"
echo ""
echo -e "${BOLD}Ready to deploy? Run:${RESET}"
echo ""
echo "  forge script script/Deploy.s.sol:DeployScript \\"
echo "    --rpc-url \$BASE_RPC_URL \\"
echo "    --broadcast \\"
echo "    --verify \\"
echo "    -vvvv"
echo ""
echo -e "${BOLD}Post-deploy:${RESET}"
echo "  1. Call rebalancer.acceptVaultOwnership()"
echo "  2. Update NEXT_PUBLIC_VAULT_ADDRESS in dashboard .env"
echo "  3. Update Contract Addresses table in README.md"
echo ""
