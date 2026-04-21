# RWA Yield Vault

**Base Network** · **Solidity 0.8.24** · **Next.js 14**

---

## What It Is

Institutional-grade ERC-4626 yield optimizer on Base, allocating USDC across Aave V3, Compound V3, MetaMorpho, and Ondo Finance with automated rebalancing and performance fees.

Depositors receive vault shares (ERC-4626) backed by diversified on-chain yield. An automated keeper triggers rebalancing when APY differentials exceed a configurable threshold. A performance fee is charged on yield above high-water mark, paid to a configurable fee recipient.

---

## Site
<img width="1424" height="794" alt="Screenshot 2026-04-20 at 10 39 42 PM" src="https://github.com/user-attachments/assets/4b3f97c9-af9e-46a5-b2bb-3238f1443fbc" />

<img width="1410" height="773" alt="Screenshot 2026-04-20 at 10 39 57 PM" src="https://github.com/user-attachments/assets/385d6c2a-47f8-4ee3-9486-446296c399b7" />



## Architecture

```
User USDC → RWAVault (ERC-4626)
                 ├── AaveV3Strategy      35%
                 ├── CompoundV3Strategy  35%
                 ├── MorphoStrategy      20%
                 └── OndoStrategy        10% (stub)

Rebalancer ──── owns vault, called by keeper
Keeper bots ─── rebalance.ts / harvest.ts via PM2
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity 0.8.24, Foundry, OpenZeppelin |
| Yield protocols | Aave V3, Compound V3, MetaMorpho, Ondo Finance |
| Dashboard | Next.js 14, viem, RainbowKit, Recharts |
| Keeper bots | TypeScript, PM2 |
| RPC / indexing | Alchemy |
| Deployment | Base mainnet |

---

## Run Locally

```bash
git clone <repo-url>
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Frontend env vars** (create `.env.local`):

```
NEXT_PUBLIC_VAULT_ADDRESS=<deployed vault address>
NEXT_PUBLIC_ALCHEMY_ID=<your alchemy api key>
```

---

## Run Tests

**Unit tests** (no RPC required):
```bash
cd contracts && forge test --no-match-path "test/fork/*"
```

**Fork tests** (requires Base RPC):
```bash
cd contracts && forge test --match-path "test/fork/*" --fork-url $BASE_RPC_URL
```

**All tests:**
```bash
cd contracts && forge test
```

---

## Deploy Contracts

**1. Pre-flight check:**
```bash
# Set env vars first
export DEPLOYER_PRIVATE_KEY=<your key>
export FEE_RECIPIENT=<fee recipient address>
export BASE_RPC_URL=<base mainnet rpc url>
export BASESCAN_API_KEY=<basescan api key>

bash scripts/pre-deploy-check.sh
```

**2. Deploy:**
```bash
cd contracts
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify \
  -vvvv
```

**3. Post-deploy:**
```bash
# Accept vault ownership (separate tx)
cast send <REBALANCER_ADDRESS> "acceptVaultOwnership()" \
  --rpc-url $BASE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Update dashboard
# Set NEXT_PUBLIC_VAULT_ADDRESS=<vault address> in .env.local
```

---

## Run Keeper Bot

```bash
cd keeper
cp .env.example .env
# Fill in: VAULT_ADDRESS, REBALANCER_ADDRESS, PRIVATE_KEY, RPC_URL

pm2 start pm2.config.js
pm2 logs
```

The keeper runs two processes:
- **rebalance** — calls `rebalancer.rebalance()` when `shouldRebalance()` returns true
- **harvest** — calls `vault.harvest()` to collect and compound yield

---

## Contract Addresses

| Contract | Base Mainnet |
|---|---|
| RWAVault | TBD |
| Rebalancer | TBD |
| AaveV3Strategy | TBD |
| CompoundV3Strategy | TBD |
| MorphoStrategy | TBD |
| OndoStrategy | TBD |

---

## Security

- **ERC-4626 inflation attack protection** — virtual shares with decimals offset = 3
- **High-water mark fee protection** — performance fees only charged on new yield
- **Reentrancy guard** — on all deposit/withdraw paths
- **Asset sweep protection** — BaseStrategy blocks sweeping the vault asset
- **Deposit cap** — hard limit of 100k USDC during initial deployment

> **Not audited. Use at your own risk.** This code has not undergone a formal security audit. Do not deposit funds you cannot afford to lose.
# rwa-dashboard
