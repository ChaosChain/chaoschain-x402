# User Journey: W0G (Wrapped 0G) Payments

This document illustrates the complete user experience for making payments with W0G on the 0G Chain, including the one-time setup (wrapping + approval).

---

## 🎯 Journey Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  W0G PAYMENT USER JOURNEY                         │
└─────────────────────────────────────────────────────────────────┘

Phase 1: ONE-TIME SETUP (First Use Only)
├─ Step 1: Get Native 0G (from exchange/faucet)
├─ Step 2: Wrap 0G → W0G (one time or as needed)
└─ Step 3: Approve Facilitator (one time, infinite approval)

Phase 2: MAKING PAYMENTS (Every Time)
├─ Step 4: Browse merchant service
├─ Step 5: Get 402 Payment Required
├─ Step 6: SDK creates payment (automatic)
├─ Step 7: Merchant verifies with facilitator
├─ Step 8: Facilitator settles payment
└─ Step 9: User receives service

Phase 3: ONGOING (Optional)
└─ Step 10: Unwrap W0G → Native 0G (if needed)
```

---

## 📱 Detailed Step-by-Step Journey

### Phase 1: One-Time Setup (First Use Only)

#### **Step 1: Get Native 0G**

**User Action:**
- Purchase 0G from exchange (e.g., Binance, Gate.io)
- Or get from 0G faucet (testnet)
- Transfer to their 0G wallet

**User Needs:**
- 0G wallet (MetaMask with 0G network added)
- Some native 0G (e.g., 10 0G)

**Time:** 2-5 minutes (depends on exchange/faucet)

---

#### **Step 2: Wrap Native 0G → W0G**

**User Action:**
User visits wrapping interface and converts native 0G to W0G:

**Option A: Via 0G dApp (Recommended)**
```
1. Visit 0G wrapping dApp
2. Connect wallet (MetaMask)
3. Enter amount: "5 0G"
4. Click "Wrap"
5. Confirm transaction in wallet
6. Wait for confirmation (~10 seconds)
✅ Done! User now has 5 W0G
```

**Option B: Via SDK/Script**
```typescript
import { ethers } from 'ethers';

// Connect to 0G
const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai');
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// W0G contract
const w0g = new ethers.Contract(
  '0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c',
  ['function mint(address minter, uint256 amount)'],
  signer
);

// Wrap 5 0G → 5 W0G
const tx = await w0g.mint(
  signer.address,
  ethers.parseUnits('5', 18)
);
await tx.wait();

console.log('✅ Wrapped 5 0G → 5 W0G');
```

**Cost:**
- Gas: ~0.001 native 0G ($0.01 at $10/0G)

**User Experience:**
- 🟢 Simple: Single transaction
- 🟢 Fast: ~10 seconds
- 🟡 One-time (or as needed to top up)

**User Thinking:** 
> "Why do I need to wrap? Can't I just pay with native 0G?"

**Answer:** Native 0G is like cash in your pocket, but W0G is like a credit card. You need W0G to make digital payments because x402 requires ERC-20 tokens.

---

#### **Step 3: Approve Facilitator (One-Time)**

**User Action:**
User gives the facilitator permission to move W0G on their behalf:

```typescript
// Get facilitator address
const facilitatorAddress = '0x...' // From facilitator.chaoscha.in

// W0G contract
const w0g = new ethers.Contract(
  '0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c',
  ['function approve(address spender, uint256 amount)'],
  signer
);

// Approve facilitator for infinite W0G (one-time)
const tx = await w0g.approve(
  facilitatorAddress,
  ethers.MaxUint256  // Infinite approval
);
await tx.wait();

console.log('✅ Facilitator approved!');
```

**Cost:**
- Gas: ~0.001 native 0G ($0.01)

**User Experience:**
- 🟢 One-time only (never again)
- 🟢 Fast: ~10 seconds
- 🟡 Requires understanding of "approval"

**User Thinking:** 
> "Is it safe to approve infinite W0G? What if the facilitator steals my tokens?"

**Answer:** The facilitator can only move W0G when you create a valid payment signature. It's like giving your bank permission to process card payments - they can only charge when you authorize it.

**Security Note:**
- Users can revoke approval anytime: `approve(facilitatorAddress, 0)`
- Facilitator is non-custodial (never holds funds)
- All transactions are on-chain and auditable

---

### Phase 2: Making Payments (Every Time)

#### **Step 4: User Browses Merchant Service**

**User Action:**
```bash
# User visits merchant API
curl https://ai-merchant.com/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"data": "analyze this"}'
```

**Response:**
```json
HTTP 402 Payment Required
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "0g-mainnet",
    "asset": "0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c"
  }],
  "paymentRequirements": {
    "scheme": "exact",
    "network": "0g-mainnet",
    "maxAmountRequired": "100000000000000000", // 0.1 W0G
    "payTo": "0xMerchant...",
    "asset": "0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c",
    "resource": "/api/analyze",
    "description": "AI Analysis Service"
  }
}
```

**User Experience:**
- 🟢 Automatic (SDK handles this)
- 🟢 Transparent pricing (0.1 W0G shown)

---

#### **Step 5-6: SDK Creates Payment (Automatic)**

**Behind the Scenes:**
```typescript
// User's SDK automatically handles this
import { ChaosChainAgentSDK } from '@chaoschain/sdk';

const sdk = new ChaosChainAgentSDK({
  privateKey: USER_PRIVATE_KEY,
  network: '0g-mainnet',
});

// SDK creates payment header
const paymentHeader = await sdk.x402_payment_manager.create_payment({
  from: userAddress,
  to: merchantAddress,
  value: '100000000000000000', // 0.1 W0G
  nonce: generateNonce(),
  // No signature needed (relayer pattern)
});

// Make request with payment
const response = await fetch('https://ai-merchant.com/api/analyze', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-PAYMENT': Buffer.from(JSON.stringify(paymentHeader)).toString('base64'),
  },
  body: JSON.stringify({ data: 'analyze this' }),
});
```

**User Experience:**
- 🟢 Completely automatic
- 🟢 No wallet popup (already approved)
- 🟢 Instant (<1 second)

**User Thinking:** 
> "Wait, did I just pay? I didn't sign anything!"

**Answer:** You already approved the facilitator in Step 3, so payments happen automatically now (like a pre-authorized payment card).

---

#### **Step 7: Merchant Verifies with Facilitator**

**Merchant Backend:**
```typescript
// Merchant receives payment header
const paymentHeader = req.headers['x-payment'];

// Verify with facilitator
const verifyResponse = await fetch('https://facilitator.chaoscha.in/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    x402Version: 1,
    paymentHeader: paymentHeader,
    paymentRequirements: requirements,
  }),
});

const result = await verifyResponse.json();

if (!result.isValid) {
  return res.status(402).json({ error: result.invalidReason });
}

// ✅ Payment verified!
```

**Facilitator Checks:**
1. ✅ User has enough W0G balance
2. ✅ User has approved facilitator (allowance check)
3. ✅ Payment nonce is valid
4. ✅ Amount matches requirements

**User Experience:**
- 🟢 Automatic (happens in <1 second)
- 🟢 User doesn't see this

---

#### **Step 8: Facilitator Settles Payment**

**Merchant Backend:**
```typescript
// Settlement request
const settleResponse = await fetch('https://facilitator.chaoscha.in/settle', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    x402Version: 1,
    paymentHeader: paymentHeader,
    paymentRequirements: requirements,
  }),
});

const settlement = await settleResponse.json();

// ✅ Payment settled!
console.log('TX Hash:', settlement.txHash);
console.log('Fee TX Hash:', settlement.txHashFee);
```

**On-Chain Actions (Facilitator):**
```solidity
// 1. Transfer net amount to merchant (0.099 W0G)
W0G.transferFrom(userAddress, merchantAddress, 99000000000000000);

// 2. Transfer fee to treasury (0.001 W0G = 1%)
W0G.transferFrom(userAddress, treasuryAddress, 1000000000000000);
```

**User's Wallet Activity:**
```
- 0.099 W0G → Merchant (AI Service)
- 0.001 W0G → ChaosChain Treasury (1% fee)
────────────────────────────────────────
Total: -0.1 W0G
```

**User Experience:**
- 🟢 Atomic (both transfers succeed or both fail)
- 🟢 Transparent (can see on 0G Explorer)
- 🟢 Fast (~10 seconds for confirmation)

---

#### **Step 9: User Receives Service**

**Merchant Response:**
```json
HTTP 200 OK
{
  "result": "Analysis complete",
  "data": {
    "sentiment": "positive",
    "confidence": 0.95
  },
  "payment": {
    "amount": {
      "amount": { "human": "0.10", "base": "100000000000000000" },
      "fee": { "human": "0.001", "base": "1000000000000000" },
      "net": { "human": "0.099", "base": "99000000000000000" }
    },
    "txHash": "0x...",
    "status": "confirmed"
  }
}
```

**User Experience:**
- ✅ Service received instantly
- ✅ Payment transparent (can verify on explorer)
- ✅ Total flow: <15 seconds

---

### Phase 3: Ongoing (Optional)

#### **Step 10: Unwrap W0G → Native 0G**

If a user wants to convert W0G back to native 0G:

```typescript
// Unwrap W0G → native 0G
const w0g = new ethers.Contract(
  '0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c',
  ['function burn(address minter, uint256 amount)'],
  signer
);

const tx = await w0g.burn(
  signer.address,
  ethers.parseUnits('5', 18)  // Unwrap 5 W0G
);
await tx.wait();

console.log('✅ Unwrapped 5 W0G → 5 native 0G');
```

**Cost:** ~0.001 native 0G (gas)

---

## 📊 User Experience Comparison

### USDC (Base/Ethereum) - Gasless
```
Setup:    None required ✅
Payment:  Sign → Done (2 seconds) ✅
Gas Cost: $0.00 ✅✅✅
```

### W0G (0G Chain) - Approval-Based
```
Setup:    Wrap + Approve (~2 minutes, $0.02 in gas) 🟡
Payment:  Automatic (no signature needed) ✅
Gas Cost: $0.00 after approval ✅
```

---

## 🎨 Visual User Journey

```
┌──────────────────────────────────────────────────────────────────┐
│                      FIRST TIME USER (W0G)                         │
└──────────────────────────────────────────────────────────────────┘

1. Get Native 0G
   Exchange → Wallet
   ⏱️  5 min | 💰 $0.00

2. Wrap 0G → W0G
   Native 0G → W0G Contract → W0G Token
   ⏱️  10 sec | 💰 $0.01

3. Approve Facilitator
   User → Approve TX → Facilitator Authorized
   ⏱️  10 sec | 💰 $0.01

   ┌─────────────────────────────────────┐
   │   ✅ ONE-TIME SETUP COMPLETE!       │
   │   Total Time: ~6 minutes            │
   │   Total Cost: ~$0.02 in gas         │
   └─────────────────────────────────────┘

4. Browse Merchant
   User → Merchant API → 402 Response
   ⏱️  1 sec | 💰 $0.00

5. SDK Creates Payment
   Automatic (no user action)
   ⏱️  <1 sec | 💰 $0.00

6. Merchant Verifies
   Merchant → Facilitator /verify → ✅
   ⏱️  1 sec | 💰 $0.00

7. Facilitator Settles
   Facilitator → W0G transfers → ✅
   ⏱️  10 sec | 💰 $0.00 (for user)

8. User Receives Service
   Merchant → Service Response → User
   ⏱️  <1 sec | 💰 $0.00

   ┌─────────────────────────────────────┐
   │   ✅ PAYMENT COMPLETE!              │
   │   Total Time: ~15 seconds           │
   │   Total Cost: 0.1 W0G + $0.00 gas   │
   └─────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                      RETURNING USER (W0G)                          │
└──────────────────────────────────────────────────────────────────┘

Steps 1-3: ⏭️  SKIPPED (already done)

Steps 4-8: Same as above (~15 seconds)

   ┌─────────────────────────────────────┐
   │   ✅ SEAMLESS EXPERIENCE!           │
   │   No setup needed                   │
   │   Payments work like USDC           │
   └─────────────────────────────────────┘
```

---

## 🤔 User Mental Models

### First-Time User Questions

**Q: Why do I need to wrap my 0G?**
A: Think of it like cash vs. card. Native 0G is cash (good for gas), W0G is a card (good for payments). x402 only accepts cards.

**Q: Why do I need to approve the facilitator?**
A: It's like authorizing your bank to process card payments. You do it once, then all future payments work automatically.

**Q: Is it safe to approve infinite W0G?**
A: Yes! The facilitator can only move W0G when you create a valid payment request. It's non-custodial (never holds your funds).

**Q: Can I revoke the approval?**
A: Yes! Just call `approve(facilitatorAddress, 0)` anytime.

**Q: How much does setup cost?**
A: ~$0.02 in gas fees (one-time). After that, payments are free for you (facilitator pays gas).

---

### Returning User Experience

Once setup is complete, the experience is identical to USDC:

```typescript
// User code (same for USDC and W0G)
const response = await fetch(merchantUrl, {
  // Payment happens automatically
});

// ✅ Service received!
```

**User doesn't need to know or care:**
- Whether it's EIP-3009 or Relayer
- Which chain they're on
- How facilitator settles
- Transaction details (unless they want to verify)

**SDK abstracts everything!**

---

## 🎯 Optimization Opportunities

### For Better UX:

1. **Combined Setup Transaction**
   - Wrap + Approve in single TX (multicall)
   - Saves time and gas

2. **Pre-Wrapping Service**
   - Allow users to wrap at purchase time
   - Skip Step 2 for new users

3. **Default High Allowance**
   - SDK could suggest $100-$1000 equivalent
   - Balance security vs. convenience

4. **Approval Status Indicator**
   - Show "✅ Ready to pay" badge
   - Clear when re-approval needed

5. **Wrap-on-Demand**
   - If W0G balance low, prompt wrap
   - Seamless top-up flow

---

## 🚀 Production Readiness

### User-Facing Improvements:

✅ **Implemented:**
- Clear error messages
- Transparent fee disclosure
- On-chain verification
- SDK abstraction

🔄 **Future Enhancements:**
- Wrap + Approve in single TX
- Balance monitoring
- Auto-wrap suggestions
- Approval renewal notifications

---

## 📚 Resources for Users

**Getting Started:**
- [0G_WOG_GUIDE.md](./0G_WOG_GUIDE.md) - Complete setup guide
- [MERCHANT_GUIDE.md](./MERCHANT_GUIDE.md) - For service providers
- 0G Network Setup: https://docs.0g.ai

**Support:**
- Discord: https://discord.gg/chaoschain
- GitHub: https://github.com/ChaosChain/chaoschain-x402
- 0G Community: https://discord.gg/0glabs

---

## ✅ Summary

**First-Time User:**
- Setup: ~6 minutes, $0.02 in gas
- Payment: ~15 seconds, 0.1 W0G

**Returning User:**
- Setup: None ✅
- Payment: ~15 seconds, 0.1 W0G

**Experience:** After one-time setup, W0G payments are as seamless as USDC! 🎉

