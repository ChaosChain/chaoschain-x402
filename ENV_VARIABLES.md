# Environment Variables - Production Setup

## 🚨 CRITICAL: Going Live on Mainnet

You're deploying to:
- ✅ Base Mainnet
- ✅ Ethereum Mainnet  
- ✅ 0G Mainnet

**Facilitator Address:** `0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD`

---

## 📋 Complete Environment Variables for Railway

### Step 1: Go to Railway
```
Railway → Your Service → Variables
```

### Step 2: Add ALL These Variables

Copy and paste these one by one:

---

### 🔐 FACILITATOR CONFIGURATION (Required)

#### FACILITATOR_PRIVATE_KEY
```
Your facilitator's private key (the one for 0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD)
```
**⚠️ CRITICAL:** Keep this secret! Never share or commit to GitHub.

#### TREASURY_ADDRESS
```
0xYourTreasuryAddress
```
**Purpose:** Receives 1% fees from all payments

---

### 🌐 RPC ENDPOINTS - TESTNET (Keep These)

#### BASE_SEPOLIA_RPC_URL
```
https://sepolia.base.org
```

#### ETHEREUM_SEPOLIA_RPC_URL
```
https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
```
**Alternative (no API key needed):**
```
https://rpc.sepolia.org
```

---

### 🌐 RPC ENDPOINTS - MAINNET (Add These!)

#### BASE_MAINNET_RPC_URL
```
https://mainnet.base.org
```
**Alternative (more reliable):**
```
https://base.llamarpc.com
```

#### ETHEREUM_MAINNET_RPC_URL
```
https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
```
**Alternative (no API key needed):**
```
https://eth.llamarpc.com
```
**Alternative 2:**
```
https://rpc.ankr.com/eth
```

#### ZG_MAINNET_RPC_URL
```
https://evmrpc.0g.ai
```

---

### 🗄️ DATABASE (Required)

#### SUPABASE_URL
```
https://your-project.supabase.co
```

#### SUPABASE_ANON_KEY
```
your-anon-key-here
```

---

### 🔗 CHAOSCHAIN INTEGRATION (Optional)

#### CHAOSCHAIN_ENABLED
```
false
```
**Set to `true` if you want ERC-8004 integration**

#### VALIDATION_REGISTRY_ADDRESS
```
0x...
```
**Only needed if CHAOSCHAIN_ENABLED=true**

#### EVIDENCE_REGISTRY_ADDRESS
```
0x...
```
**Only needed if CHAOSCHAIN_ENABLED=true**

---

### ⚙️ SERVER CONFIGURATION (Optional)

#### LOG_LEVEL
```
info
```
**Options:** `debug`, `info`, `warn`, `error`

#### NODE_ENV
```
production
```

---

## 💰 Funding Requirements

**⚠️ BEFORE GOING LIVE**, fund your facilitator address with gas on ALL networks:

### Your Facilitator: `0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD`

| Network | Gas Token | Minimum Amount | Recommended | Why |
|---------|-----------|----------------|-------------|-----|
| **Base Mainnet** | ETH | 0.05 ETH | 0.1 ETH | Each settlement costs ~0.001 ETH |
| **Ethereum Mainnet** | ETH | 0.2 ETH | 0.5 ETH | Gas more expensive (~0.01 ETH/tx) |
| **0G Mainnet** | Native 0G | 5 0G | 10 0G | Each settlement costs ~0.002 0G |
| Base Sepolia | ETH | Free from faucet | 0.1 ETH | Testing |
| Ethereum Sepolia | ETH | Free from faucet | 0.1 ETH | Testing |

**Total Cost to Start:**
- **~$150-200** (at current ETH prices)
- Covers ~500-1000 transactions
- Monitor daily and refill when low

### How to Fund

**Base Mainnet:**
1. Send ETH on Base L2 to `0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD`
2. Use [Base Bridge](https://bridge.base.org) if coming from Ethereum
3. Verify on [BaseScan](https://basescan.org/address/0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD)

**Ethereum Mainnet:**
1. Send ETH to `0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD`
2. Verify on [Etherscan](https://etherscan.io/address/0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD)

**0G Mainnet:**
1. Get native 0G from exchange
2. Send to `0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD`
3. Verify on [0G Explorer](https://chainscan.0g.ai/address/0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD)

---

## ✅ Pre-Production Testing Checklist

### Local Testing (Do This First!)

1. **Create `.env` file locally**
   ```bash
   cd /Users/sumeet/Desktop/ChaosChain_labs/chaoschain-x402/http-bridge
   cp ../ENV_VARIABLES.md .env
   # Edit .env with your values
   ```

2. **Test with Sepolia first**
   ```bash
   npm run build
   npm start
   ```

3. **Verify endpoints**
   ```bash
   # Health check
   curl http://localhost:8080/health | jq
   
   # Supported networks
   curl http://localhost:8080/supported | jq
   ```

4. **Test a real payment on Base Sepolia**
   - Make sure this works before going to mainnet!

---

### Code Quality Verification

Run these commands:

```bash
cd /Users/sumeet/Desktop/ChaosChain_labs/chaoschain-x402/http-bridge

# TypeScript check
npm run typecheck
# Expected: No errors

# Build
npm run build
# Expected: dist/ folder created

# Check for 0G logic
grep -r "0g-mainnet" dist/
# Expected: Should find references

# Check for mainnet logic
grep -r "base-mainnet\|ethereum-mainnet" dist/
# Expected: Should find references
```

**Results:**
- [x] TypeScript: ✅ PASSED
- [x] Build: ✅ PASSED
- [x] 0G logic: ✅ VERIFIED
- [ ] Local testing: PENDING
- [ ] Sepolia payment test: PENDING

---

## 🚀 Railway Deployment Steps

### 1. Add All Environment Variables to Railway

Go through each variable above and add it to Railway → Variables.

**Critical Variables (Must Have):**
- [ ] `FACILITATOR_PRIVATE_KEY`
- [ ] `TREASURY_ADDRESS`
- [ ] `BASE_MAINNET_RPC_URL`
- [ ] `ETHEREUM_MAINNET_RPC_URL`
- [ ] `ZG_MAINNET_RPC_URL`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`

### 2. Push to GitHub (Already Done!)

Railway auto-deploys when you push to main ✅

### 3. Watch Deployment Logs

```
Railway → Your Service → Deployments → Latest
```

**Look for:**
- ✅ Build successful
- ✅ Server listening on :8080
- ✅ All networks in /supported
- ❌ NO errors about missing env vars

### 4. Verify Production Deployment

```bash
# Health check
curl https://facilitator.chaoscha.in/health | jq

# Check for mainnet support
curl https://facilitator.chaoscha.in/supported | jq | grep mainnet
```

**Expected in /supported:**
```json
{
  "kinds": [
    { "x402Version": 1, "scheme": "exact", "network": "base-sepolia" },
    { "x402Version": 1, "scheme": "exact", "network": "ethereum-sepolia" },
    { "x402Version": 1, "scheme": "exact", "network": "base-mainnet" },
    { "x402Version": 1, "scheme": "exact", "network": "ethereum-mainnet" },
    { "x402Version": 1, "scheme": "exact", "network": "0g-mainnet" }
  ]
}
```

### 5. Fund Facilitator on ALL Mainnet Networks

Send gas tokens to: `0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD`

- [ ] 0.1 ETH on Base Mainnet
- [ ] 0.5 ETH on Ethereum Mainnet
- [ ] 10 native 0G on 0G Mainnet

**Verify balances:**
```bash
curl https://facilitator.chaoscha.in/health | jq '.networks'
```

All networks should show `gasBalance > "0"`

---

## 🧪 Production Testing (After Deployment)

### Test 1: Verify All Networks Healthy

```bash
curl https://facilitator.chaoscha.in/health | jq
```

**Check:**
- [ ] `healthy: true`
- [ ] `base-mainnet` shows `rpcHealthy: true` and `gasBalance > "0"`
- [ ] `ethereum-mainnet` shows `rpcHealthy: true` and `gasBalance > "0"`
- [ ] `0g-mainnet` shows `rpcHealthy: true` and `gasBalance > "0"`

### Test 2: Make Small Test Payments

**On Base Mainnet (USDC):**
- Test with $0.10 USDC first
- Verify settlement on BaseScan
- Check fee went to treasury

**On 0G Mainnet (W0G):**
- Test with 0.01 W0G first
- Verify user approved facilitator
- Verify settlement on 0G Explorer

**⚠️ Start Small!** Don't process large amounts until you've verified everything works.

---

## 📊 Monitoring After Launch

### Daily Checks

**1. Gas Balances (Daily)**
```bash
curl https://facilitator.chaoscha.in/health | jq '.networks'
```

**Alert if:**
- Base Mainnet < 0.05 ETH
- Ethereum Mainnet < 0.2 ETH
- 0G Mainnet < 5 0G

**2. Transaction Success Rate (Daily)**

Check Supabase `transactions` table:
```sql
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
FROM transactions
WHERE created_at > NOW() - INTERVAL '24 hours';
```

**3. Fee Collection (Daily)**

Check treasury balance on:
- [BaseScan](https://basescan.org/address/YOUR_TREASURY)
- [Etherscan](https://etherscan.io/address/YOUR_TREASURY)
- [0G Explorer](https://chainscan.0g.ai/address/YOUR_TREASURY)

### Weekly Checks

**1. Review Failed Transactions**
```sql
SELECT * FROM transactions 
WHERE status = 'failed' 
AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

**2. Top-Up Gas if Needed**

**3. Review Error Logs**
```
Railway → Logs → Filter by "error"
```

---

## 🆘 Emergency Procedures

### If Facilitator Runs Out of Gas

**Symptoms:**
- Settlements fail with "insufficient funds"
- `/health` shows low `gasBalance`

**Fix:**
1. Immediately send gas to `0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD`
2. Monitor `/health` until balance updates
3. Retry failed transactions from Supabase

### If Private Key Compromised

**Symptoms:**
- Unauthorized transactions from facilitator address
- Balance draining unexpectedly

**Emergency Steps:**
1. **Immediately** remove `FACILITATOR_PRIVATE_KEY` from Railway
2. Service will stop (better than losing funds)
3. Generate new wallet
4. Update Railway with new key
5. Fund new wallet
6. Redeploy

### If RPC Endpoint Down

**Symptoms:**
- `/health` shows `rpcHealthy: false`
- Verifications fail for specific network

**Fix:**
1. Update Railway variable with alternative RPC:
   - Base: `https://base.llamarpc.com`
   - Ethereum: `https://eth.llamarpc.com`
   - 0G: Contact 0G team for backup RPC
2. Railway auto-redeploys
3. Verify health check

---

## 🎯 Quick Reference: Copy-Paste for Railway

```bash
# === REQUIRED ===
FACILITATOR_PRIVATE_KEY=0x...
TREASURY_ADDRESS=0x...

# === TESTNETS (keep existing) ===
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ETHEREUM_SEPOLIA_RPC_URL=https://rpc.sepolia.org

# === MAINNETS (add these) ===
BASE_MAINNET_RPC_URL=https://mainnet.base.org
ETHEREUM_MAINNET_RPC_URL=https://eth.llamarpc.com
ZG_MAINNET_RPC_URL=https://evmrpc.0g.ai

# === DATABASE ===
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-key

# === OPTIONAL ===
CHAOSCHAIN_ENABLED=false
LOG_LEVEL=info
NODE_ENV=production
```

---

## ✅ Final Go-Live Checklist

### Pre-Launch (Do ALL of these!)
- [ ] All env variables added to Railway
- [ ] Code pushed to GitHub
- [ ] Railway deployment successful
- [ ] `/health` endpoint returns healthy
- [ ] `/supported` includes all 5 networks
- [ ] Facilitator funded on Base Mainnet (≥0.1 ETH)
- [ ] Facilitator funded on Ethereum Mainnet (≥0.5 ETH)
- [ ] Facilitator funded on 0G Mainnet (≥10 0G)
- [ ] Treasury address set and secure
- [ ] Tested small payment on Base Sepolia
- [ ] Backup of facilitator private key secured

### Post-Launch (Monitor!)
- [ ] First Base Mainnet payment successful
- [ ] First Ethereum Mainnet payment successful
- [ ] First 0G Mainnet payment successful
- [ ] Gas balances monitored daily
- [ ] Treasury receiving fees
- [ ] Error rate < 1%
- [ ] Set up gas balance alerts

---

## 🎉 Ready to Launch?

Once you've:
1. ✅ Added all env variables to Railway
2. ✅ Funded facilitator on all mainnets
3. ✅ Verified health check shows all networks healthy
4. ✅ Tested on Sepolia first

**You're READY TO GO LIVE! 🚀**

Questions? Check troubleshooting sections above or ask me!

