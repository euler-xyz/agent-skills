---
title: Deploy an Oracle Adapter
impact: HIGH
impactDescription: Required for vault pricing and risk management
tags: oracle, deploy, chainlink, pyth, adapter
---

## Deploy an Oracle Adapter

Oracle adapters translate external price feeds into Euler's `IPriceOracle` interface. Each adapter is immutable and connects to a single price source.

**Incorrect (using Chainlink directly without adapter):**

```solidity
// Chainlink returns (roundId, answer, startedAt, updatedAt, answeredInRound)
// This raw interface is incompatible with Euler's IPriceOracle
(, int256 answer,,,) = AggregatorV3Interface(feed).latestRoundData();
// Also missing staleness checks, decimal handling, etc.
```

**Correct (deploy ChainlinkOracle adapter):**

```solidity
import {ChainlinkOracle} from "euler-price-oracle/adapter/chainlink/ChainlinkOracle.sol";

// Deploy adapter with configuration
ChainlinkOracle oracle = new ChainlinkOracle(
    base,           // Base token address (e.g., WETH)
    quote,          // Quote token address (e.g., USD reference)
    feed,           // Chainlink feed address
    maxStaleness    // Max age in seconds (e.g., 3600 for 1 hour)
);

// Adapter now implements IPriceOracle
// getQuote(inAmount, base, quote) returns outAmount
uint256 ethValueInUsd = oracle.getQuote(1e18, weth, usd);
```

**Correct (deploy PythOracle adapter):**

```solidity
import {PythOracle} from "euler-price-oracle/adapter/pyth/PythOracle.sol";

// Pyth is a pull-based oracle - requires price updates
PythOracle oracle = new PythOracle(
    pythContract,         // Pyth contract address
    base,                 // Base token
    quote,                // Quote token
    feedId,               // Pyth price feed ID (bytes32)
    maxStaleness,         // Max staleness in seconds
    maxConfidenceInterval // Max confidence width (e.g., 0.01e18 for 1%)
);
```

**CRITICAL: Pyth Price Updates Required**

Pyth oracles are pull-based and **will revert if prices are stale**. You must update prices before any Euler operation that uses the oracle (deposits, borrows, liquidations, etc.):

```solidity
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

// Step 1: Get update data off-chain (from Pyth Hermes API)
// https://hermes.pyth.network/docs/

// Step 2: Update price on-chain before your operation
bytes[] memory updateData = getUpdateDataFromHermes(feedId);
uint256 updateFee = pyth.getUpdateFee(updateData);
pyth.updatePriceFeeds{value: updateFee}(updateData);

// Step 3: Now Euler operations will work
vault.deposit(amount, receiver); // Oracle query succeeds
```

```typescript
// TypeScript: Fetching Pyth price updates
async function getPythUpdateData(feedIds: string[]): Promise<string[]> {
  const response = await fetch(
    `https://hermes.pyth.network/api/latest_vaas?ids[]=${feedIds.join('&ids[]=')}`
  );
  const data = await response.json();
  return data.map((vaa: string) => `0x${vaa}`);
}

// Include price update in your transaction
const updateData = await getPythUpdateData([priceFeedId]);
const updateFee = await pythContract.read.getUpdateFee([updateData]);

// Option 1: Separate transaction
await pythContract.write.updatePriceFeeds(updateData, { value: updateFee });
await vault.write.deposit([amount, receiver]);

// Option 2: Batch via EVC (recommended)
const batchItems = [
  {
    targetContract: pythAddress,
    onBehalfOfAccount: zeroAddress,
    value: updateFee,
    data: encodeFunctionData({
      abi: pythABI,
      functionName: 'updatePriceFeeds',
      args: [updateData]
    })
  },
  {
    targetContract: vaultAddress,
    onBehalfOfAccount: account,
    value: 0n,
    data: encodeFunctionData({
      abi: evaultABI,
      functionName: 'deposit',
      args: [amount, receiver]
    })
  }
];
await evc.write.batch(batchItems, { value: updateFee });
```

For production, consider using MEV protection services that bundle price updates automatically.

**Correct (deploy UniswapV3 TWAP oracle):**

```solidity
import {UniswapV3Oracle} from "euler-price-oracle/adapter/uniswap/UniswapV3Oracle.sol";

// TWAP oracle for manipulation resistance
UniswapV3Oracle oracle = new UniswapV3Oracle(
    tokenA,        // First token in pair
    tokenB,        // Second token in pair
    fee,           // Pool fee tier (500, 3000, or 10000)
    twapWindow,    // TWAP window in seconds (e.g., 1800 for 30 min)
    uniswapFactory // Uniswap V3 factory address
);

// TWAP provides manipulation-resistant pricing
// Longer window = more resistant but slower to update
```

**Correct (deploy rate provider oracle for LSTs):**

```solidity
import {LidoOracle} from "euler-price-oracle/adapter/lido/LidoOracle.sol";
import {RateProviderOracle} from "euler-price-oracle/adapter/rate/RateProviderOracle.sol";

// For wstETH/stETH (built-in Lido support)
LidoOracle wstethOracle = new LidoOracle(wsteth, steth);

// For other rate providers (e.g., Balancer)
RateProviderOracle rateOracle = new RateProviderOracle(
    baseToken,         // e.g., rETH
    quoteToken,        // e.g., ETH
    rateProvider       // Balancer rate provider address
);
```

**Oracle Adapter Selection Guide:**

| Use Case | Recommended Adapter | Configuration |
|----------|-------------------|---------------|
| Major pairs (ETH/USD) | ChainlinkOracle | 1-4 hour staleness |
| DeFi tokens | UniswapV3Oracle | 15-30 min TWAP |
| LSTs (stETH, rETH) | LidoOracle / RateProviderOracle | N/A |
| New/exotic pairs | PythOracle | With confidence checks |
| Stablecoins | FixedRateOracle | 1:1 rate |

**Verification after deployment:**

```solidity
// Verify adapter works correctly
uint256 quoteAmount = oracle.getQuote(1e18, base, quote);
console.log("1 base =", quoteAmount, "quote");

// Check both directions work
uint256 reverseQuote = oracle.getQuote(quoteAmount, quote, base);
// Should be approximately 1e18 (within precision)

// For bid/ask oracles
(uint256 bidOut, uint256 askOut) = oracle.getQuotes(1e18, base, quote);
console.log("Bid:", bidOut, "Ask:", askOut);
```

Reference: [Euler Price Oracle Adapters](https://github.com/euler-xyz/euler-price-oracle#oracle-adapters)
