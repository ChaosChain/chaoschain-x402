# How the Facilitator Routes Settlement Methods

## 🎯 Simple Answer

**The facilitator knows which method to use based on the `network` in the payment request.**

Each network has a configuration that tells the facilitator:
- What token is used
- Whether that token supports EIP-3009
- If EIP-3009 is supported → use `transferWithAuthorization` (gasless)
- If not → use `transferFrom` (relayer pattern)

---

## 🔍 How It Works (Step by Step)

### Step 1: Payment Request Comes In

```json
{
  "paymentRequirements": {
    "network": "0g-mainnet",  // ← This is the key!
    "asset": "0x1Cd0690fF9a693f5EF2dD976660a8dAFc81A109c",
    "maxAmountRequired": "100000000000000000"
  }
}
```

### Step 2: Facilitator Looks Up Network Configuration

```typescript
// settlement.ts lines 143-149
const TOKEN_INFO = {
  'base-sepolia': { 
    symbol: 'USDC', 
    decimals: 6, 
    supportsEIP3009: true   // ← Uses EIP-3009
  },
  'ethereum-sepolia': { 
    symbol: 'USDC', 
    decimals: 6, 
    supportsEIP3009: true   // ← Uses EIP-3009
  },
  'base-mainnet': { 
    symbol: 'USDC', 
    decimals: 6, 
    supportsEIP3009: true   // ← Uses EIP-3009
  },
  'ethereum-mainnet': { 
    symbol: 'USDC', 
    decimals: 6, 
    supportsEIP3009: true   // ← Uses EIP-3009
  },
  '0g-mainnet': { 
    symbol: 'W0G', 
    decimals: 18, 
    supportsEIP3009: false  // ← Uses Relayer!
  }
};
```

### Step 3: Router Decides Which Function to Call

```typescript
// settlement.ts lines 393-411
export async function settlePaymentManaged(request, feeAmount, netAmount) {
  const { network } = request.paymentRequirements;
  const tokenInfo = TOKEN_INFO[network];
  
  // 🎯 THE ROUTING LOGIC:
  if (tokenInfo.supportsEIP3009) {
    // USDC on Base/Ethereum
    return settleWithEIP3009(request, feeAmount, netAmount, chainConfig);
  } else {
    // W0G on 0G Chain
    return settleWithRelayer(request, feeAmount, netAmount, chainConfig);
  }
}
```

### Step 4: Appropriate Settlement Method Executes

**Option A: EIP-3009 (USDC)**
```typescript
async function settleWithEIP3009(...) {
  // Use transferWithAuthorization
  await walletClient.writeContract({
    address: tokenAddress,
    functionName: 'transferWithAuthorization',
    args: [from, to, value, validAfter, validBefore, nonce, v, r, s]
  });
}
```

**Option B: Relayer (W0G)**
```typescript
async function settleWithRelayer(...) {
  // Use transferFrom (requires prior approval)
  await walletClient.writeContract({
    address: tokenAddress,
    functionName: 'transferFrom',
    args: [from, to, amount]
  });
}
```

---

## 📊 Visual Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│             PAYMENT REQUEST ARRIVES                          │
└──────────────────────────────────────────────────────────────┘
                         │
                         │ Extract network
                         ▼
          ┌──────────────────────────┐
          │   Look up TOKEN_INFO     │
          │   by network name        │
          └──────────────────────────┘
                         │
                         ▼
          ┌──────────────────────────┐
          │ Check: supportsEIP3009?  │
          └──────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
        true  ▼                     ▼  false
     ┌─────────────────┐   ┌──────────────────┐
     │   EIP-3009      │   │    Relayer       │
     │   (USDC)        │   │    (W0G)         │
     └─────────────────┘   └──────────────────┘
              │                     │
              ▼                     ▼
     ┌─────────────────┐   ┌──────────────────┐
     │transferWith     │   │  transferFrom    │
     │Authorization    │   │  (2 transfers)   │
     └─────────────────┘   └──────────────────┘
              │                     │
              └──────────┬──────────┘
                         │
                         ▼
              ┌────────────────────┐
              │   Settlement       │
              │   Complete ✅      │
              └────────────────────┘
```

---

## 🎯 Network → Method Mapping

| Network | Token | `supportsEIP3009` | Method Used | User Experience |
|---------|-------|-------------------|-------------|-----------------|
| `base-sepolia` | USDC | ✅ `true` | `transferWithAuthorization` | Gasless, no approval |
| `ethereum-sepolia` | USDC | ✅ `true` | `transferWithAuthorization` | Gasless, no approval |
| `base-mainnet` | USDC | ✅ `true` | `transferWithAuthorization` | Gasless, no approval |
| `ethereum-mainnet` | USDC | ✅ `true` | `transferWithAuthorization` | Gasless, no approval |
| `0g-mainnet` | W0G | ❌ `false` | `transferFrom` | Requires approval |

---

## 🔧 How to Add New Tokens

Want to add a new token? Just update the configuration:

### Example: Adding USDT on Polygon

```typescript
// 1. Add chain config
const CHAIN_CONFIG = {
  // ... existing chains
  'polygon-mainnet': { 
    chain: polygon, 
    rpcUrl: 'https://polygon-rpc.com', 
    confirmations: 20 
  }
};

// 2. Add token address
const TOKEN_ADDRESSES = {
  // ... existing tokens
  'polygon-mainnet': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'  // USDT
};

// 3. Add token info (USDT does NOT support EIP-3009)
const TOKEN_INFO = {
  // ... existing tokens
  'polygon-mainnet': { 
    symbol: 'USDT', 
    decimals: 6, 
    supportsEIP3009: false  // ← Will use relayer!
  }
};

// 4. Update /supported endpoint in server.ts
// Done! 🎉
```

**The routing logic automatically handles it!**

---

## 🧪 Verification Logic Works the Same Way

The verification function also uses this configuration:

```typescript
// In verifyPaymentManaged()
const tokenInfo = TOKEN_INFO[network];

if (tokenInfo.supportsEIP3009) {
  // Check nonce usage (EIP-3009)
  const authUsed = await publicClient.readContract({
    functionName: 'authorizationState',
    args: [payerAddress, nonce]
  });
} else {
  // Check allowance (Relayer)
  const allowance = await publicClient.readContract({
    functionName: 'allowance',
    args: [payerAddress, facilitatorAddress]
  });
}
```

---

## 🎓 Why This Design?

### Benefits:

1. **Single Source of Truth**
   - Network configuration in one place
   - Easy to maintain
   - No hardcoded logic scattered around

2. **Easy to Extend**
   - Add new tokens by updating config
   - No code changes needed for new chains

3. **Type-Safe**
   - TypeScript ensures network names match
   - Compile-time checks prevent errors

4. **Automatic Routing**
   - Developers don't need to think about it
   - Right method chosen automatically

---

## 🔍 How to Debug

If you're wondering which method a network uses:

```bash
# Check the compiled code
cd http-bridge
grep -A3 "'0g-mainnet'" dist/managed/settlement.js

# Should show:
# '0g-mainnet': { 
#   symbol: 'W0G', 
#   decimals: 18, 
#   supportsEIP3009: false 
# }
```

Or check the source:
```typescript
// http-bridge/src/managed/settlement.ts
// Lines 143-149
```

---

## ✅ Summary

**Q: How does the facilitator know which method to use?**

**A:** By checking `TOKEN_INFO[network].supportsEIP3009`:
- `true` → EIP-3009 (`transferWithAuthorization`)
- `false` → Relayer (`transferFrom`)

**Q: What determines this flag?**

**A:** The token contract's capabilities:
- USDC contracts have `transferWithAuthorization()` → EIP-3009 ✅
- W0G contract does NOT → Relayer ❌

**Q: Can this change?**

**A:** Yes! If 0G updates W0G to support EIP-3009, just change:
```typescript
'0g-mainnet': { symbol: 'W0G', decimals: 18, supportsEIP3009: true }
```
And it will automatically use the gasless method! 🎉

---

## 📚 Related Code

- **Configuration:** `http-bridge/src/managed/settlement.ts` (lines 143-149)
- **Routing Logic:** `http-bridge/src/managed/settlement.ts` (lines 405-410)
- **EIP-3009 Implementation:** `http-bridge/src/managed/settlement.ts` (lines 419-510)
- **Relayer Implementation:** `http-bridge/src/managed/settlement.ts` (lines 518-585)

