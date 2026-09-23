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

**Correct (reading an amount quote in TypeScript):**

```typescript
import { parseAbi } from 'viem';

const quoteAmount = await publicClient.readContract({
  address: oracleAddress,
  abi: parseAbi(['function getQuote(uint256 inAmount, address base, address quote) view returns (uint256 outAmount)']),
  functionName: 'getQuote',
  args: [baseAmount, baseAddress, quoteAddress],
});
```

OracleLens `getOracleInfo(oracle, bases, quotes)` returns adapter metadata and resolution information, not a `prices` array. Use `getQuote`/`getQuotes` for amounts and handle stale or unavailable feed errors explicitly. Pull-based feeds need updates before the quote can succeed.

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

Key points:
- `getQuote` converts amounts, not returns unit prices
- Decimals are handled internally by adapters
- **Pyth oracles require price updates before any operation that uses them**

Reference: [IPriceOracle Interface](https://github.com/euler-xyz/euler-price-oracle#ipriceoracle)
