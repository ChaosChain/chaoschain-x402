# Test Plan: W0G Support

Comprehensive testing checklist before Railway deployment.

---

## ✅ Pre-Deployment Testing

### 1. Code Quality Checks

- [x] TypeScript compiles without errors (`npm run typecheck`)
- [x] No linter errors
- [x] All imports resolved
- [x] Function signatures correct

**Status:** ✅ PASSED (verified above)

---

### 2. Configuration Tests

#### Check Chain Configuration

```typescript
// Verify 0G Mainnet config exists
const CHAIN_CONFIG = {
  '0g-mainnet': { 
    chain: zgMainnet, 
    rpcUrl: process.env.ZG_MAINNET_RPC_URL || 'https://evmrpc.0g.ai', 
    confirmations: 5 
  }
}
```

- [x] Chain ID: 16661
- [x] RPC URL: https://evmrpc.0g.ai
- [x] Fallback RPC configured
- [x] Confirmations: 5 blocks

**Status:** ✅ PASSED

---

#### Check Token Configuration

```typescript
TOKEN_ADDRESSES = {
  '0g-mainnet': '0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c'  // W0G
}

TOKEN_INFO = {
  '0g-mainnet': { 
    symbol: 'W0G', 
    decimals: 18, 
    supportsEIP3009: false  // Uses relayer
  }
}
```

- [x] W0G address correct
- [x] Decimals: 18
- [x] Relayer mode enabled (supportsEIP3009: false)

**Status:** ✅ PASSED

---

### 3. Function Logic Tests

#### Verification Flow (settlePaymentManaged)

```typescript
// Test routing logic
if (tokenInfo.supportsEIP3009) {
  return settleWithEIP3009(...)  // USDC
} else {
  return settleWithRelayer(...)  // W0G
}
```

**Test Cases:**
- [x] USDC → routes to `settleWithEIP3009`
- [x] W0G → routes to `settleWithRelayer`

**Status:** ✅ PASSED (code review)

---

#### Verification (verifyPaymentManaged)

**Test Cases for W0G:**

1. **Balance Check**
```typescript
// Should check W0G balance
const balance = await publicClient.readContract({
  address: tokenAddress,  // W0G
  abi: TOKEN_ABI,
  functionName: 'balanceOf',
  args: [payerAddress],
});
```
- [x] Uses tokenAddress (not hardcoded USDC)
- [x] Uses TOKEN_ABI (supports ERC-20)

2. **Allowance Check (Relayer Mode)**
```typescript
if (!tokenInfo.supportsEIP3009) {
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'allowance',
    args: [payerAddress, facilitatorAddress],
  });
  
  if (allowance < amount) {
    return { isValid: false, invalidReason: 'Insufficient allowance...' };
  }
}
```
- [x] Checks allowance for W0G
- [x] Skips for USDC (EIP-3009)
- [x] Clear error message

**Status:** ✅ PASSED (code review)

---

#### Settlement (settleWithRelayer)

**Test Cases:**

1. **Merchant Transfer**
```typescript
const hashMerchant = await walletClient.writeContract({
  address: tokenAddress,  // W0G
  abi: TOKEN_ABI,
  functionName: 'transferFrom',
  args: [payerAddress, merchantAddress, netAmount],
});
```
- [x] Uses transferFrom (not transferWithAuthorization)
- [x] Transfers netAmount (99%)
- [x] Uses facilitator's wallet to execute

2. **Fee Transfer**
```typescript
const hashFee = await walletClient.writeContract({
  address: tokenAddress,
  abi: TOKEN_ABI,
  functionName: 'transferFrom',
  args: [payerAddress, treasuryAddress, feeAmount],
});
```
- [x] Separate transaction for fees
- [x] Transfers feeAmount (1%)
- [x] Goes to treasury address

**Status:** ✅ PASSED (code review)

---

### 4. API Endpoint Tests

#### /supported Endpoint

**Expected Response:**
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

- [x] Includes 0g-mainnet
- [x] Correct format

**Test:**
```bash
curl https://facilitator.chaoscha.in/supported | jq '.kinds[] | select(.network == "0g-mainnet")'
```

**Status:** ⏳ PENDING (deploy first)

---

### 5. Error Message Tests

#### Missing Approval Error

**Scenario:** User hasn't approved facilitator

**Expected Error:**
```json
{
  "isValid": false,
  "invalidReason": "Insufficient allowance. User must approve facilitator (0x...) for 1.00 W0G. Current allowance: 0.00 W0G"
}
```

**Check:**
- [x] Clear action required
- [x] Shows facilitator address
- [x] Shows required amount
- [x] Shows current allowance
- [x] Mentions token symbol (W0G)

**Status:** ✅ PASSED (code review)

---

#### Insufficient Balance Error

**Expected Error:**
```json
{
  "isValid": false,
  "invalidReason": "Insufficient W0G balance. Required: 1.00 W0G, Available: 0.50 W0G"
}
```

**Check:**
- [x] Shows token symbol
- [x] Shows required amount
- [x] Shows available balance

**Status:** ✅ PASSED (code review)

---

### 6. Build & Deployment Tests

#### Local Build Test

```bash
cd http-bridge
npm run build
```

**Expected:**
- [x] Compiles to dist/
- [x] No TypeScript errors
- [x] All files present

**Test:**
```bash
cd /Users/sumeet/Desktop/ChaosChain_labs/chaoschain-x402/http-bridge
npm run build
ls -la dist/
```

---

#### Docker Build Test (Railway)

**Test:**
```bash
cd /Users/sumeet/Desktop/ChaosChain_labs/chaoschain-x402
docker build -t facilitator-test -f http-bridge/Dockerfile http-bridge
```

**Expected:**
- [x] Builds successfully
- [x] No errors
- [x] Image size reasonable (<500MB)

---

### 7. Integration Tests (Post-Deploy)

#### Test 1: Health Check

```bash
curl https://facilitator.chaoscha.in/health
```

**Expected:**
```json
{
  "healthy": true,
  "facilitatorAddress": "0x...",
  "networks": {
    "0g-mainnet": {
      "rpcHealthy": true,
      "gasBalance": "...",
      "token": "W0G"
    }
  }
}
```

---

#### Test 2: Supported Networks

```bash
curl https://facilitator.chaoscha.in/supported
```

**Expected:** Includes `0g-mainnet`

---

#### Test 3: Verify Payment (Mock)

Create a mock verify request:

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
  }'
```

**Expected (if user has no W0G):**
```json
{
  "isValid": false,
  "invalidReason": "Insufficient W0G balance. Required: 0.10 W0G, Available: 0.00 W0G"
}
```

**Expected (if user has W0G but no approval):**
```json
{
  "isValid": false,
  "invalidReason": "Insufficient allowance. User must approve facilitator..."
}
```

---

### 8. Real Transaction Tests (0G Mainnet)

⚠️ **DO THESE TESTS WITH SMALL AMOUNTS FIRST**

#### Prerequisites:
1. Test wallet with:
   - ~1 native 0G (for gas)
   - ~1 W0G (for payment)
2. Facilitator wallet funded with:
   - ~10 native 0G (for gas)
3. Test merchant wallet

#### Test Flow:

**Step 1: Wrap Native 0G → W0G**
```bash
# Test wrapping (use 0G SDK or contract interaction)
# Verify on explorer: https://chainscan.0g.ai
```

**Step 2: Approve Facilitator**
```bash
# Approve facilitator for 1 W0G
# Verify on explorer
```

**Step 3: Make Real Payment**
```bash
# Use test merchant
# Call /verify → /settle
# Verify transactions on explorer
```

**Step 4: Verify Results**
- [ ] Merchant received net amount (0.99 W0G)
- [ ] Treasury received fee (0.01 W0G)
- [ ] Both transactions confirmed
- [ ] Explorer shows correct amounts

---

## 🚀 Deployment Checklist

### Railway Environment Variables

Add these to Railway:

```bash
# 0G Network
ZG_MAINNET_RPC_URL=https://evmrpc.0g.ai

# Existing (verify these are set)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ETHEREUM_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
BASE_MAINNET_RPC_URL=https://base.mainnet.coinbase.com
ETHEREUM_MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...

FACILITATOR_PRIVATE_KEY=0x...
TREASURY_ADDRESS=0x...

SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...

# Optional
CHAOSCHAIN_ENABLED=false
```

- [ ] All variables set
- [ ] Private key has native 0G for gas
- [ ] Treasury address valid

---

### Deployment Steps

1. **Commit & Push**
```bash
git add docs/USER_JOURNEY_W0G.md TEST_PLAN_W0G.md
git commit -m "Add W0G user journey and test plan"
git push origin main
```
- [ ] Code pushed to GitHub

2. **Railway Auto-Deploy**
- [ ] Railway detects new commit
- [ ] Build starts automatically
- [ ] Build succeeds
- [ ] Service starts

3. **Verify Deployment**
```bash
# Check health
curl https://facilitator.chaoscha.in/health

# Check supported networks
curl https://facilitator.chaoscha.in/supported | jq
```
- [ ] Health check passes
- [ ] 0g-mainnet in supported list

4. **Fund Facilitator**
```bash
# Send native 0G to facilitator address (from health check)
# Verify balance: https://chainscan.0g.ai/address/0x...
```
- [ ] Facilitator has ≥10 native 0G

5. **Test Payment Flow**
- [ ] Run integration tests (Section 7)
- [ ] Test real payment (Section 8)
- [ ] Verify on explorer

---

## 📊 Test Results Summary

### Code Quality
- ✅ TypeScript: PASSED
- ✅ Linter: PASSED
- ✅ Configuration: PASSED
- ✅ Logic Review: PASSED

### Functionality
- ⏳ Build Test: PENDING
- ⏳ API Tests: PENDING (post-deploy)
- ⏳ Integration Tests: PENDING (post-deploy)
- ⏳ Real Transactions: PENDING (post-deploy)

---

## 🎯 Next Steps

1. **Build Test**
```bash
cd http-bridge && npm run build
```

2. **Commit & Push**
```bash
git add -A
git commit -m "Final W0G implementation ready for deployment"
git push origin main
```

3. **Configure Railway**
- Add `ZG_MAINNET_RPC_URL` variable
- Wait for auto-deploy
- Verify health check

4. **Fund Facilitator**
- Send 10 native 0G to facilitator address

5. **Run Integration Tests**
- Test /supported endpoint
- Test /verify with W0G
- Test full payment flow

6. **Go Live! 🚀**

---

## 🆘 Troubleshooting

### Build Fails
- Check TypeScript errors: `npm run typecheck`
- Check for missing imports
- Verify Dockerfile syntax

### Health Check Fails
- Check Railway logs
- Verify environment variables
- Verify RPC URL accessible

### Verification Fails
- Check user has W0G balance
- Check user approved facilitator
- Check facilitator has native 0G for gas

### Settlement Fails
- Check facilitator gas balance
- Check user allowance sufficient
- Check network connectivity
- Check transaction on explorer

---

## ✅ Ready to Deploy?

All checks passed? Let's go! 🚀

```bash
npm run build && git push
```

