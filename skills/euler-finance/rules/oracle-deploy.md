---
title: Deploy an Oracle Adapter
impact: HIGH
impactDescription: Required for vault pricing and risk management
tags: oracle, deploy, chainlink, pyth, chronicle, redstone, uniswap, adapter
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

**Correct (deploy ChronicleOracle adapter):**

```solidity
import {ChronicleOracle} from "euler-price-oracle/adapter/chronicle/ChronicleOracle.sol";

// Chronicle is MakerDAO's oracle system
ChronicleOracle oracle = new ChronicleOracle(
    base,           // Base token address
    quote,          // Quote token address
    feed,           // Chronicle feed address (IChronicle)
    maxStaleness    // Max age in seconds
);

// Note: Chronicle feeds require whitelisting (kiss)
// The adapter address must be whitelisted on the Chronicle feed
// Contact Chronicle team for production whitelisting
```

**Correct (deploy RedStoneOracle adapter):**

```solidity
import {RedstoneCoreOracle} from "euler-price-oracle/adapter/redstone/RedstoneCoreOracle.sol";

// RedStone provides modular, gas-optimized oracle feeds
RedstoneCoreOracle oracle = new RedstoneCoreOracle(
    base,                    // Base token address
    quote,                   // Quote token address
    feedId,                  // RedStone feed ID (bytes32)
    feedDecimals,            // Feed decimal precision
    maxStaleness             // Max age in seconds
);

// RedStone requires signed price payloads in calldata
// Use RedStone SDK to wrap transactions with price data
```

**Correct (deploy FixedRateOracle for stablecoins):**

```solidity
import {FixedRateOracle} from "euler-price-oracle/adapter/fixed/FixedRateOracle.sol";

// For stablecoins pegged 1:1 (e.g., USDC/USD, DAI/USD)
FixedRateOracle oracle = new FixedRateOracle(
    base,       // Base token (e.g., USDC)
    quote,      // Quote token (e.g., USD reference)
    rate        // Fixed rate in 18 decimals (1e18 for 1:1)
);

// Use for:
// - Stablecoin pairs (USDC/USDT at 1:1)
// - Wrapped tokens (WETH/ETH at 1:1)
// - Testing and development
```

**Correct (deploy CrossAdapter for chained pricing):**

```solidity
import {CrossAdapter} from "euler-price-oracle/adapter/CrossAdapter.sol";

// CrossAdapter chains two oracles through an intermediate asset
// Example: TOKEN -> ETH -> USD (requires TOKEN/ETH and ETH/USD oracles)

CrossAdapter oracle = new CrossAdapter(
    oracleBaseCross,    // First oracle: TOKEN/ETH
    oracleCrossQuote,   // Second oracle: ETH/USD
    crossAsset          // Intermediate asset: ETH (WETH address)
);

// Price flow: TOKEN -> ETH (via oracleBaseCross) -> USD (via oracleCrossQuote)
// Useful for tokens that only have ETH pairs but vault needs USD pricing

// Example: Deploy cross adapter for LINK/USD via LINK/ETH and ETH/USD
CrossAdapter linkUsdOracle = new CrossAdapter(
    linkEthChainlinkOracle,   // LINK/ETH feed
    ethUsdChainlinkOracle,    // ETH/USD feed  
    weth                       // Cross through WETH
);
```

**Correct (deploy PendleOracle for yield-bearing tokens):**

```solidity
import {PendleOracle} from "euler-price-oracle/adapter/pendle/PendleOracle.sol";

// For Pendle PT (principal tokens) as collateral
PendleOracle oracle = new PendleOracle(
    pendleMarket,      // Pendle market address
    twapWindow,        // TWAP window: 900-1800 seconds recommended
    ptToken,           // PT token address (base)
    underlyingToken    // Underlying asset (quote)
);

// Uses PendlePYOracleLib for TWAP pricing
// Audited by Electisec (September 2024)
```

**IMPORTANT: Pendle Market Initialization Required**

Pendle markets must be initialized before the oracle can return prices:

```solidity
import {IPendleMarket} from "pendle/interfaces/IPendleMarket.sol";

// Step 1: Initialize market TWAP observations
// This must be done ONCE before using the oracle
IPendleMarket(pendleMarket).increaseObservationsCardinalityNext(
    cardinalityNext  // Minimum cardinality for TWAP (e.g., 144 for 30-min TWAP)
);

// Step 2: Wait for TWAP window duration to pass
// Oracle will revert until sufficient observations are collected

// Step 3: Verify oracle is ready
(bool increaseCardinalityRequired, , bool oldestObservationSatisfied) = 
    IPendleMarketV3(pendleMarket).getOracleState(pendleMarket, twapWindow);

require(!increaseCardinalityRequired && oldestObservationSatisfied, "Market not ready");

// Now oracle queries will work
uint256 ptPriceInUnderlying = oracle.getQuote(1e18, ptToken, underlyingToken);
```

```typescript
// TypeScript: Check if Pendle market is ready for oracle
async function isPendleMarketReady(
  market: Address,
  twapWindow: number
): Promise<boolean> {
  const [increaseCardinalityRequired, , oldestObservationSatisfied] = 
    await publicClient.readContract({
      address: market,
      abi: pendleMarketABI,
      functionName: 'getOracleState',
      args: [market, twapWindow]
    });
  
  return !increaseCardinalityRequired && oldestObservationSatisfied;
}

// Initialize market if needed
async function initializePendleMarket(market: Address, cardinality: number) {
  await walletClient.writeContract({
    address: market,
    abi: pendleMarketABI,
    functionName: 'increaseObservationsCardinalityNext',
    args: [cardinality]
  });
  
  console.log(`Market initialized. Wait ${twapWindow} seconds before using oracle.`);
}
```

**Oracle Adapter Selection Guide:**

| Use Case | Recommended Adapter | Configuration |
|----------|-------------------|---------------|
| Major pairs (ETH/USD, BTC/USD) | ChainlinkOracle | 1-4 hour staleness |
| DeFi tokens with liquidity | UniswapV3Oracle | 15-30 min TWAP |
| LSTs (wstETH, rETH, cbETH) | LidoOracle / RateProviderOracle | Exchange rate based |
| New/exotic tokens | PythOracle | Pull-based, requires updates |
| MakerDAO ecosystem | ChronicleOracle | Requires whitelisting |
| Gas-optimized feeds | RedStoneOracle | Calldata-based pricing |
| Stablecoins (USDC, USDT) | FixedRateOracle | 1:1 rate |
| Cross-currency pricing | CrossAdapter | Chain through intermediate |
| Pendle PT/LP tokens | PendleOracle | Market TWAP |
| Wrapped tokens (WETH/ETH) | FixedRateOracle | 1:1 rate |

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
