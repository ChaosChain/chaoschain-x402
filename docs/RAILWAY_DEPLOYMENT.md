# Railway Deployment Guide

Deploy the ChaosChain x402 Facilitator to Railway with custom domain `facilitator.chaoscha.in`.

## Prerequisites

- [ ] Railway account (https://railway.app)
- [ ] GitHub repository pushed to GitHub
- [ ] Domain `chaoscha.in` DNS access
- [ ] Base Sepolia/Mainnet RPC URL (Alchemy, Infura, or QuickNode)
- [ ] Facilitator wallet with ETH for gas
- [ ] Supabase project (optional, for production idempotency/analytics)

---

## Step 1: Prepare Your Repository

### 1.1 Create Railway Configuration

Create `railway.toml` in the **root** of your repo:

```toml
[build]
builder = "NIXPACKS"
buildCommand = "cd http-bridge && npm install && npm run build"

[deploy]
startCommand = "cd http-bridge && npm start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

### 1.2 Add Health Check Endpoint

Railway will use `/health` to check if the service is running. This is already implemented in `http-bridge/src/server.ts`.

### 1.3 Commit and Push

```bash
git add railway.toml
git commit -m "Add Railway deployment config"
git push origin main
```

---

## Step 2: Deploy to Railway

### 2.1 Create New Project

1. Go to https://railway.app/dashboard
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub
5. Select `chaoschain-x402` repository

### 2.2 Configure Service Root Directory

⚠️ **IMPORTANT:** The server code is in `http-bridge/` subdirectory, not the repo root.

1. Click on the deployed service
2. Go to **"Settings"** tab
3. Scroll to **"Build & Deploy"** section
4. Set **"Root Directory"** to: `http-bridge`
5. Click **"Update"**
6. Railway will redeploy automatically

This tells Railway to treat `http-bridge/` as the project root, so it can properly detect `package.json` and Node.js configuration.

**Why this matters:**

```
❌ Without Root Directory setting:
chaoschain-x402/              ← Railway looks here
├── railway.toml              ← Finds this
├── README.md
├── http-bridge/
│   ├── package.json          ← Doesn't find this (Node.js not detected!)
│   └── src/

✅ With Root Directory = "http-bridge":
chaoschain-x402/
├── railway.toml
├── http-bridge/              ← Railway looks here instead
│   ├── package.json          ← Finds this (Node.js detected!)
│   ├── src/
│   └── ...
```

---

## Step 3: Configure Environment Variables

Go to **"Variables"** tab and add the following:

### Required Variables

```bash
# Server Configuration
PORT=8402
NODE_ENV=production
LOG_LEVEL=info

# Facilitator Mode
FACILITATOR_MODE=managed
DEFAULT_CHAIN=base-sepolia

# Facilitator Wallet (CRITICAL - Keep Secret!)
FACILITATOR_PRIVATE_KEY=0x...your_private_key_here

# Treasury Address (Where fees go)
TREASURY_ADDRESS=0x...your_treasury_address

# RPC Endpoints
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY
ETHEREUM_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# Optional: Mainnet (for production)
# BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
# ETHEREUM_MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Fee Configuration
FEE_BPS_DEFAULT=100  # 1% fee (100 basis points)

# Health Check
MIN_GAS_BALANCE_ETH=0.05  # Minimum ETH balance for health checks

# Optional: Supabase (for production-grade idempotency)
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_KEY=your_service_key_here

# Optional: ChaosChain ERC-8004 Integration
# CHAOSCHAIN_ENABLED=true
# VALIDATION_REGISTRY_ADDRESS=0x...
```

### Security Best Practices

⚠️ **NEVER commit private keys to GitHub!** Use Railway's environment variables.

---

## Step 4: Configure Custom Domain

### 4.1 Add Domain in Railway

1. Go to your service in Railway
2. Click **"Settings"** tab
3. Scroll to **"Domains"** section
4. Click **"Custom Domain"**
5. Enter: `facilitator.chaoscha.in`
6. Railway will provide DNS records (CNAME or A record)

### 4.2 Configure DNS

Go to your DNS provider (Cloudflare, Namecheap, etc.) and add the record:

**Option A: CNAME (Recommended)**
```
Type: CNAME
Name: facilitator
Value: <your-railway-app>.railway.app
TTL: Auto or 300
```

**Option B: A Record**
```
Type: A
Name: facilitator
Value: <IP provided by Railway>
TTL: Auto or 300
```

### 4.3 Wait for DNS Propagation

- DNS propagation can take 5-60 minutes
- Check status: `dig facilitator.chaoscha.in`
- Railway will automatically provision SSL certificate (Let's Encrypt)

---

## Step 5: Verify Deployment

### 5.1 Test Health Endpoint

```bash
curl https://facilitator.chaoscha.in/health
```

**Expected Response:**
```json
{
  "healthy": true,
  "checks": {
    "supabase": true,
    "rpcBaseSepolia": true,
    "gasBalance": "0.15",
    "gasBalanceHealthy": true,
    "usdcBalance": "0.00",
    "rpcLatencyMs": 123,
    "blockLag": 2,
    "timestamp": "2025-11-02T..."
  }
}
```

### 5.2 Test Root Endpoint

```bash
curl https://facilitator.chaoscha.in/
```

**Expected Response:**
```json
{
  "service": "ChaosChain x402 Facilitator",
  "version": "0.1.0",
  "mode": "managed",
  "settlement": "Production-ready on-chain settlement",
  "network": "base-sepolia",
  "endpoints": {
    "verify": "POST /verify",
    "settle": "POST /settle",
    "supported": "GET /supported",
    "health": "GET /health"
  },
  "docs": "https://github.com/ChaosChain/chaoschain-x402"
}
```

### 5.3 Test Supported Networks

```bash
curl https://facilitator.chaoscha.in/supported
```

**Expected Response:**
```json
{
  "kinds": [
    { "x402Version": 1, "scheme": "exact", "network": "base-sepolia" },
    { "x402Version": 1, "scheme": "exact", "network": "ethereum-sepolia" },
    { "x402Version": 1, "scheme": "exact", "network": "base-mainnet" },
    { "x402Version": 1, "scheme": "exact", "network": "ethereum-mainnet" }
  ]
}
```

---

## Step 6: Fund Your Facilitator Wallet

Your facilitator needs ETH to pay gas fees for settlements.

### 6.1 Get Your Facilitator Address

Check Railway logs or run locally:
```typescript
import { privateKeyToAccount } from 'viem/accounts';
const account = privateKeyToAccount(process.env.FACILITATOR_PRIVATE_KEY);
console.log('Facilitator address:', account.address);
```

### 6.2 Fund with Gas Token

**For Base Sepolia:**
- Faucet: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
- Bridge Sepolia ETH: https://bridge.base.org/

**For Base Mainnet (Production):**
- Send ETH to facilitator address
- Recommended: 0.5 ETH for ~1000 transactions

### 6.3 Verify Balance

```bash
curl https://facilitator.chaoscha.in/health | jq '.checks.gasBalance'
```

Should return > 0.05 ETH for healthy status.

---

## Step 7: Production Checklist

Before going live on mainnet:

### Security
- [ ] Private keys stored only in Railway environment variables
- [ ] Treasury address is a secure multisig wallet
- [ ] Railway service has 2FA enabled
- [ ] GitHub repository branch protection enabled

### Monitoring
- [ ] Railway logs are being captured
- [ ] Health check endpoint is responding
- [ ] Set up uptime monitoring (e.g., UptimeRobot, BetterStack)
- [ ] Set up alerts for low gas balance

### Configuration
- [ ] `DEFAULT_CHAIN` set to production network (base-mainnet)
- [ ] RPC URLs are production-grade (Alchemy/Infura with high rate limits)
- [ ] Supabase configured for idempotency (recommended for production)
- [ ] `MIN_GAS_BALANCE_ETH` set appropriately

### Testing
- [ ] Test full payment flow on testnet
- [ ] Verify idempotency (repeat same payment)
- [ ] Test error handling (insufficient balance, invalid signature)
- [ ] Load test with multiple concurrent requests

### Documentation
- [ ] Update SDK examples to use `facilitator.chaoscha.in`
- [ ] Update README.md with production URL
- [ ] Publish Terms of Service
- [ ] Set up status page (optional)

---

## Step 8: Monitoring & Maintenance

### View Logs

In Railway dashboard:
1. Click on your service
2. Go to **"Deployments"** tab
3. Click on latest deployment
4. View real-time logs

### Key Metrics to Monitor

```bash
# Health status
curl https://facilitator.chaoscha.in/health

# Monitor logs for:
# - [VERIFY] Processing verification request
# - [SETTLE] Processing settlement request
# - [Settlement] success: true
# - [ChaosChain] Agent linked to tx
```

### Set Up Alerts

Use Railway's integrations or external services:
- **Uptime monitoring**: UptimeRobot (free, checks every 5 minutes)
- **Log aggregation**: Datadog, Sentry
- **Gas balance alerts**: Custom script checking `/health` endpoint

### Scaling

Railway auto-scales, but you can configure:
1. Go to **"Settings"** → **"Resources"**
2. Adjust:
   - **Memory**: 512MB - 8GB
   - **CPU**: 1-8 vCPUs
   - **Replicas**: 1-10 instances

For high traffic, consider:
- Multiple Railway services with load balancer
- Redis for distributed idempotency cache
- Read replicas for RPC endpoints

---

## Step 9: Switching to Mainnet

When ready for production:

### 9.1 Update Environment Variables

```bash
DEFAULT_CHAIN=base-mainnet
BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ETHEREUM_MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

### 9.2 Fund Mainnet Wallet

Send real ETH to your facilitator address:
- Base Mainnet: 0.5+ ETH recommended
- Ethereum Mainnet: 1+ ETH recommended

### 9.3 Redeploy

Railway will automatically redeploy when you change environment variables.

### 9.4 Test on Mainnet

⚠️ **Use small amounts first!** Test with 0.01 USDC transactions before going live.

```bash
# Test with real USDC on Base Mainnet
# Use the genesis_studio.py example with mainnet config
```

---

## Troubleshooting

### "Service won't start" or "Cannot find module"

**Check Railway logs:**
```
error: Cannot find module './cjs/index.cjs'
Bun v1.2.21 (Linux x64 baseline)
```

**Problem:** Railway detected Bun instead of Node.js.

**Solution:** Make sure these files exist in `http-bridge/`:
- `.node-version` (contains `20.11.0`)
- `nixpacks.toml` (forces Node.js)
- `package.json` with `"engines": { "node": ">=20.0.0" }`

Then redeploy.

---

**Check Railway logs:**
```
[ERROR] Failed to connect to RPC
```

**Solution:** Verify RPC URLs are correct and have available credits.

### "Health check failing"

**Check gas balance:**
```bash
curl https://facilitator.chaoscha.in/health | jq '.checks'
```

**Solution:** Fund facilitator wallet with ETH.

### "Domain not resolving"

**Check DNS propagation:**
```bash
dig facilitator.chaoscha.in
nslookup facilitator.chaoscha.in
```

**Solution:** Wait for DNS propagation (5-60 minutes). Verify CNAME record is correct.

### "SSL certificate error"

**Railway auto-provisions SSL, but if it fails:**
1. Remove domain from Railway
2. Wait 5 minutes
3. Re-add domain
4. Verify DNS is correct

### "High latency / timeouts"

**Possible causes:**
- RPC provider rate limiting
- Low Railway resources
- Network congestion

**Solutions:**
1. Upgrade RPC provider plan
2. Increase Railway resources (Settings → Resources)
3. Add retry logic with exponential backoff
4. Use multiple RPC endpoints with fallback

---

## Cost Estimates

### Railway
- **Hobby Plan**: $5/month (1GB RAM, 1 vCPU) - Good for testnet
- **Pro Plan**: $20/month (8GB RAM, 8 vCPU) - Recommended for production

### RPC Providers
- **Alchemy Free**: 300M compute units/month (good for testing)
- **Alchemy Growth**: $49/month for higher limits
- **QuickNode**: Starting at $9/month

### Gas Costs
- **Base Sepolia**: Free (testnet)
- **Base Mainnet**: ~$0.001 per settlement (~$1 for 1000 transactions)

### Total Monthly Cost (Production)
- Railway: $20
- Alchemy: $49
- Gas: ~$50 (for 50k transactions)
- **Total**: ~$120/month

**Revenue**: 1% fee on all transactions (e.g., $100k volume = $1k revenue)

---

## Next Steps

1. **Deploy to Railway** following steps above
2. **Test on Base Sepolia** with `genesis_studio.py`
3. **Monitor for 24-48 hours** to ensure stability
4. **Switch to Base Mainnet** when ready
5. **Announce to the community** 🚀

---

## Support

Need help with deployment?
- **Railway Discord**: https://discord.gg/railway
- **ChaosChain Issues**: https://github.com/ChaosChain/chaoschain-x402/issues
- **Email**: sumeet.chougule@nethermind.io

---

**Your facilitator will be live at `https://facilitator.chaoscha.in` 🎉**

