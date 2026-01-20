---
title: Get Asset Prices from Oracles
impact: HIGH
impactDescription: Essential for value calculations and risk assessment
tags: oracle, price, quote, query
---

## Get Asset Prices from Oracles

Querying prices is fundamental for calculating position values, health factors, and making trading decisions. Euler oracles use a quote-based interface that returns amounts rather than unit prices.

**Incorrect (assuming unit price response):**

```solidity
// Wrong: Oracles don't return "price per token"
uint256 price = oracle.getPrice(token);
uint256 value = tokenAmount * price;
// getPrice() doesn't exist in IPriceOracle!
```

**Correct (using getQuote for amount conversion):**

```solidity
import {IPriceOracle} from "euler-price-oracle/interfaces/IPriceOracle.sol";

// IPriceOracle.getQuote: "How much quote do I get for inAmount of base?"
// This is like asking "How much USD is 1 ETH worth?"

// Get value of 1 ETH in USD
uint256 ethInUsd = IPriceOracle(oracle).getQuote(
    1e18,      // inAmount: 1 ETH (18 decimals)
    weth,      // base: the token you have
    usd        // quote: the token you want value in
);
// Returns: 2000e18 (if ETH = $2000)

// Get value of 0.5 BTC in ETH
uint256 btcInEth = IPriceOracle(oracle).getQuote(
    0.5e8,     // inAmount: 0.5 BTC (8 decimals)  
    wbtc,      // base: BTC
    weth       // quote: ETH
);
// Returns: 15e18 (if 0.5 BTC = 15 ETH)
```

**Correct (using OracleLens for comprehensive data):**

```typescript
import { OracleLens } from '@eulerxyz/evk-periphery';

// OracleLens provides rich oracle information
const oracleInfo = await oracleLens.getOracleInfo(
  oracleAddress,
  [weth, wbtc, link],  // base tokens
  [usd, usd, usd]       // quote tokens
);

// Access individual prices
oracleInfo.prices.forEach((priceInfo, i) => {
  console.log(`${bases[i]}: ${priceInfo.quote} ${quotes[i]}`);
  console.log(`  Oracle: ${priceInfo.oracle}`);
  console.log(`  Success: ${priceInfo.success}`);
});
```

**Correct (bid/ask pricing for spreads):**

```solidity
// getQuotes returns both bid and ask prices
// Useful for more accurate risk calculations
(uint256 bidOut, uint256 askOut) = IPriceOracle(oracle).getQuotes(
    1e18,
    weth,
    usd
);

// bidOut: What you'd get if SELLING 1 ETH (lower)
// askOut: What you'd pay to BUY 1 ETH (higher)
// Spread = askOut - bidOut

// For lending, use bid (selling collateral)
// For borrowing, use ask (buying debt)
uint256 collateralValue = (collateralAmount * bidOut) / 1e18;
uint256 debtValue = (debtAmount * askOut) / 1e18;
```

**Correct (handling oracle failures):**

```typescript
async function safeGetQuote(
  oracle: Address,
  inAmount: bigint,
  base: Address,
  quote: Address
): Promise<{ success: boolean; value: bigint; error?: string }> {
  try {
    const value = await publicClient.readContract({
      address: oracle,
      abi: iPriceOracleABI,
      functionName: 'getQuote',
      args: [inAmount, base, quote],
    });
    
    return { success: true, value };
  } catch (error) {
    // Oracle might revert for various reasons:
    // - Stale price
    // - No liquidity (TWAP)
    // - Unsupported pair
    return { 
      success: false, 
      value: 0n,
      error: error.message 
    };
  }
}

// Usage with fallback
const result = await safeGetQuote(primaryOracle, amount, base, quote);
if (!result.success) {
  console.warn('Primary oracle failed, trying fallback');
  const fallback = await safeGetQuote(fallbackOracle, amount, base, quote);
  if (!fallback.success) {
    throw new Error('All oracles failed');
  }
  return fallback.value;
}
```

**Correct (calculating portfolio value):**

```solidity
function getPortfolioValue(
    address account,
    address oracle,
    address quoteAsset
) public view returns (uint256 totalValue) {
    address[] memory collaterals = IEVC(evc).getCollaterals(account);
    
    for (uint256 i = 0; i < collaterals.length; i++) {
        address vault = collaterals[i];
        
        // Get shares balance
        uint256 shares = IEVault(vault).balanceOf(account);
        if (shares == 0) continue;
        
        // Convert shares to underlying assets
        uint256 assets = IEVault(vault).convertToAssets(shares);
        
        // Get underlying asset
        address underlying = IEVault(vault).asset();
        
        // Get value in quote asset
        uint256 value = IPriceOracle(oracle).getQuote(
            assets,
            underlying,
            quoteAsset
        );
        
        totalValue += value;
    }
}
```

**Important: Pyth Oracle Price Updates**

If using Pyth oracles, prices must be updated before querying or the call will revert:

```typescript
// Pyth prices are pull-based - must update before use
const updateData = await fetch(
  `https://hermes.pyth.network/api/latest_vaas?ids[]=${feedId}`
).then(r => r.json());

const updateFee = await pythContract.read.getUpdateFee([updateData]);
await pythContract.write.updatePriceFeeds(updateData, { value: updateFee });

// Now price query will work
const price = await oracle.read.getQuote([amount, base, quote]);
```

Key points:
- `getQuote` converts amounts, not returns unit prices
- Always handle potential oracle reverts gracefully
- Consider bid/ask spreads for accurate risk assessment
- Decimals are handled internally by adapters
- Cross-pricing works automatically through EulerRouter
- **Pyth oracles require price updates before any operation that uses them**

Reference: [IPriceOracle Interface](https://github.com/euler-xyz/euler-price-oracle#iprice oracle)
