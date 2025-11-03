# 🚀 Deploy W0G Support to Railway

## ✅ Pre-Flight Checklist

All tests passed:
- ✅ TypeScript compilation: PASSED
- ✅ Linter checks: PASSED
- ✅ Build output: PASSED (dist/ generated successfully)
- ✅ W0G logic compiled: VERIFIED
- ✅ Documentation complete: PASSED

**You are READY TO DEPLOY!**

---

## 🎯 Deployment Steps

### Step 1: Configure Railway Environment

Railway → Your Service → Variables → Add:

```bash
ZG_MAINNET_RPC_URL=https://evmrpc.0g.ai
```

**Why:** Facilitator needs to connect to 0G Chain to:
- Check W0G balances
- Check allowances
- Execute transfers

**Verify existing variables:**
- `FACILITATOR_PRIVATE_KEY` ✅ (already set)
- `TREASURY_ADDRESS` ✅ (already set)
- `BASE_SEPOLIA_RPC_URL` ✅ (already set)
- `SUPABASE_URL` ✅ (already set)
- `SUPABASE_ANON_KEY` ✅ (already set)

---

### Step 2: Railway Auto-Deploy

Railway will automatically detect the new GitHub commit and:

1. **Build** (using Dockerfile)
   ```
   → Building with Dockerfile
   → RUN npm install
   → RUN npm run build
   → TypeScript → JavaScript (dist/)
   ```

2. **Deploy** (start server)
   ```
   → CMD node dist/server.js
   → Server listening on :8080
   → Health check: /health
   ```

**Expected Logs:**
```
╔═══════════════════════════════════════════════════════════╗
║ ChaosChain x402 Payment Facilitator ║
╚═══════════════════════════════════════════════════════════╝
🚀 Server listening on http://localhost:8080
📋 Mode: MANAGED
⛓️ Default Chain: base-sepolia
🔐 ChaosChain Integration: DISABLED

Endpoints:
POST http://localhost:8080/verify
POST http://localhost:8080/settle
GET http://localhost:8080/health
GET http://localhost:8080/supported
```

**Watch for:**
- No compilation errors ✅
- Server starts successfully ✅
- All endpoints registered ✅

**ETA:** 2-3 minutes

---

### Step 3: Verify Deployment

#### 3.1 Check Health

```bash
curl https://facilitator.chaoscha.in/health | jq
```

**Expected Response:**
```json
{
  "healthy": true,
  "facilitatorAddress": "0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD",
  "facilitatorMode": "managed",
  "networks": {
    "base-sepolia": {
      "rpcHealthy": true,
      "gasBalance": "...",
      "token": "USDC"
    },
    "ethereum-sepolia": { ... },
    "base-mainnet": { ... },
    "ethereum-mainnet": { ... },
    "0g-mainnet": {
      "rpcHealthy": true,
      "gasBalance": "0",  // ⚠️ Need to fund!
      "token": "W0G"
    }
  }
}
```

**Check:**
- [ ] `0g-mainnet` network appears
- [ ] `rpcHealthy: true`
- [ ] Token shows as "W0G"

#### 3.2 Check Supported Networks

```bash
curl https://facilitator.chaoscha.in/supported | jq
```

**Expected Response:**
```json
{
  "kinds": [
    { "x402Version": 1, "scheme": "exact", "network": "base-sepolia" },
    { "x402Version": 1, "scheme": "exact", "network": "ethereum-sepolia" },
    { "x402Version": 1, "scheme": "exact", "network": "base-mainnet" },
    { "x402Version": 1, "scheme": "exact", "network": "ethereum-mainnet" },
    { "x402Version": 1, "scheme": "exact", "network": "0g-mainnet" }  // ✅ NEW!
  ]
}
```

**Check:**
- [ ] `0g-mainnet` present in list

---

### Step 4: Fund Facilitator with Native 0G

**Get Facilitator Address:**
```bash
curl https://facilitator.chaoscha.in/health | jq -r '.facilitatorAddress'
```

Output: `0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD` (your address)

**Send Native 0G:**
1. Go to your 0G wallet (MetaMask on 0G network)
2. Send **10 native 0G** to facilitator address
3. Verify on [0G Explorer](https://chainscan.0g.ai/address/0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD)

**Why 10 0G?**
- Each W0G transfer costs ~0.001-0.002 native 0G in gas
- 10 0G = ~5,000 transactions
- Should last several days/weeks

**Verify Funding:**
```bash
# Wait 30 seconds, then check again
curl https://facilitator.chaoscha.in/health | jq '.networks."0g-mainnet".gasBalance'
```

**Expected:** `"10000000000000000000"` (10.0 0G in base units)

**Status:**
- [ ] Facilitator funded with ≥10 native 0G

---

### Step 5: Test W0G Verification (Dry Run)

Let's test the verification logic without settling:

```bash
curl -X POST https://facilitator.chaoscha.in/verify \
  -H 'Content-Type: application/json' \
  -d '{
    "x402Version": 1,
    "paymentHeader": {
      "from": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "nonce": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "validAfter": "'$(date +%s)'",
      "validBefore": "'$(($(date +%s) + 3600))'",
      "value": "100000000000000000"
    },
    "paymentRequirements": {
      "scheme": "exact",
      "network": "0g-mainnet",
      "maxAmountRequired": "100000000000000000",
      "payTo": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      "asset": "0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c",
      "resource": "/test"
    }
  }' | jq
```

**Expected Response (User has no W0G):**
```json
{
  "isValid": false,
  "invalidReason": "Insufficient W0G balance. Required: 0.10 W0G, Available: 0.00 W0G"
}
```

**Expected Response (User has W0G but no approval):**
```json
{
  "isValid": false,
  "invalidReason": "Insufficient allowance. User must approve facilitator (0x62Bb4CbD...) for 0.10 W0G. Current allowance: 0.00 W0G"
}
```

**Check:**
- [ ] Error message is clear and actionable
- [ ] Shows token symbol (W0G)
- [ ] Shows facilitator address for approval
- [ ] Shows required amount

---

## 🧪 Real Payment Test (Optional but Recommended)

### Prerequisites

You'll need a test wallet with:
1. **Native 0G** (~1 0G) for gas
2. **W0G tokens** (~1 W0G) for payment

### Test Flow

#### Step 1: Wrap Native 0G → W0G

```javascript
// Using ethers.js
const w0g = new ethers.Contract(
  '0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c',
  ['function mint(address minter, uint256 amount)'],
  signer  // Your test wallet signer on 0G chain
);

// Wrap 1 0G → 1 W0G
const tx = await w0g.mint(
  signer.address,
  ethers.parseUnits('1', 18)
);
await tx.wait();

console.log('✅ Wrapped 1 0G → 1 W0G');
console.log('TX:', tx.hash);
```

**Verify on Explorer:**
```
https://chainscan.0g.ai/tx/[YOUR_TX_HASH]
```

#### Step 2: Approve Facilitator

```javascript
// W0G contract
const w0g = new ethers.Contract(
  '0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c',
  ['function approve(address spender, uint256 amount)'],
  signer
);

// Approve facilitator for 1 W0G
const facilitatorAddress = '0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD';
const tx = await w0g.approve(
  facilitatorAddress,
  ethers.parseUnits('1', 18)
);
await tx.wait();

console.log('✅ Approved facilitator for 1 W0G');
console.log('TX:', tx.hash);
```

#### Step 3: Test Payment with Real Merchant

```bash
# Use a test merchant or your own merchant server
# This will call /verify and /settle
```

**Expected:**
- Merchant receives 0.099 W0G (99%)
- Treasury receives 0.001 W0G (1% fee)
- Both transactions confirmed on-chain

**Verify on Explorer:**
```
https://chainscan.0g.ai/address/[MERCHANT_ADDRESS]
https://chainscan.0g.ai/address/[TREASURY_ADDRESS]
```

---

## ✅ Deployment Verification Checklist

### Pre-Deployment
- [x] Code compiled successfully
- [x] Tests passed
- [x] Documentation complete
- [x] Code pushed to GitHub

### Railway Configuration
- [ ] `ZG_MAINNET_RPC_URL` added to Railway variables
- [ ] Auto-deploy triggered
- [ ] Build succeeded
- [ ] Server started

### Health Checks
- [ ] `/health` shows `0g-mainnet` network
- [ ] `/health` shows `rpcHealthy: true` for 0G
- [ ] `/supported` includes `0g-mainnet`
- [ ] Facilitator funded with ≥10 native 0G

### Functionality Tests
- [ ] Verification returns clear error messages
- [ ] Error shows "W0G" token symbol
- [ ] Error includes facilitator address
- [ ] (Optional) Real payment test completed

---

## 🎉 Success Criteria

Your W0G support is LIVE when:

✅ `/supported` includes `0g-mainnet`
✅ `/health` shows 0G network healthy with gas balance
✅ Verification errors mention "W0G" and "allowance"
✅ Facilitator has native 0G for gas
✅ (Optional) Real payment settles successfully

---

## 📊 Monitoring

After deployment, monitor:

### Railway Logs
```
Railway → Your Service → Deployments → View Logs
```

**Watch for:**
- W0G payment attempts
- Settlement transactions
- Error messages
- Gas balance warnings

### 0G Explorer
```
https://chainscan.0g.ai/address/0x62Bb4CbD53c7c2373F11E23A4F21B88b1c7485BD
```

**Monitor:**
- Transaction count
- Gas balance (should stay >5 0G)
- Failed transactions (investigate if any)

### Health Checks
```bash
# Every hour
curl https://facilitator.chaoscha.in/health | jq '.networks."0g-mainnet"'
```

---

## 🆘 Troubleshooting

### "0g-mainnet not in /supported"
**Cause:** Server.ts not updated or build failed

**Fix:**
1. Check Railway logs for errors
2. Verify code pushed to GitHub
3. Redeploy manually if needed

### "rpcHealthy: false" for 0G
**Cause:** RPC URL unreachable or invalid

**Fix:**
1. Test RPC manually: `curl https://evmrpc.0g.ai`
2. Check Railway variable: `ZG_MAINNET_RPC_URL`
3. Try alternate RPC if needed

### "gasBalance: 0" for 0G
**Cause:** Facilitator not funded

**Fix:**
1. Send 10 native 0G to facilitator address
2. Wait 30 seconds for confirmation
3. Refresh health check

### Verification fails with "Insufficient allowance"
**Cause:** User hasn't approved facilitator

**Expected!** This is correct behavior. User needs to:
```javascript
await w0g.approve(facilitatorAddress, amount);
```

### Settlement fails
**Cause:** Multiple possibilities

**Debug:**
1. Check facilitator gas balance (needs native 0G)
2. Check user's W0G balance
3. Check user's approval amount
4. Check Railway logs for specific error
5. Check transaction on 0G explorer

---

## 🚀 Post-Deployment

### Update Documentation
- [ ] Add W0G to main README
- [ ] Update merchant guides
- [ ] Update SDK examples
- [ ] Announce on Discord/Twitter

### Monitor & Optimize
- [ ] Track first W0G payment
- [ ] Monitor gas usage patterns
- [ ] Optimize confirmation times
- [ ] Gather user feedback

---

## 📚 Resources

- **User Journey:** [USER_JOURNEY_W0G.md](./docs/USER_JOURNEY_W0G.md)
- **W0G Guide:** [0G_WOG_GUIDE.md](./docs/0G_WOG_GUIDE.md)
- **Test Plan:** [TEST_PLAN_W0G.md](./TEST_PLAN_W0G.md)
- **0G Explorer:** https://chainscan.0g.ai
- **0G Docs:** https://docs.0g.ai

---

## ✅ Ready? Let's Deploy!

1. **Add Railway Variable**
   - Go to Railway → Variables
   - Add: `ZG_MAINNET_RPC_URL=https://evmrpc.0g.ai`
   - Save

2. **Railway Auto-Deploys**
   - Wait 2-3 minutes
   - Check logs for success

3. **Fund Facilitator**
   - Send 10 native 0G
   - Verify on explorer

4. **Test & Celebrate! 🎉**
   - Run verification test
   - Monitor first payment
   - Announce to users

**You got this! 🚀**

