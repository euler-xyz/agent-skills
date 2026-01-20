# Euler IRM & Oracles Agent Skill

**Version 1.0.0**  
Euler Labs  
January 2026

> **Note:**  
> This document is for agents and LLMs to follow when working with  
> Euler Finance price oracles and Interest Rate Models. It covers deploying  
> adapters, configuring EulerRouter, querying prices, and understanding IRM types.

---

## Abstract

Oracle and Interest Rate Model guide for Euler Finance V2 protocol. Covers deploying oracle adapters (Chainlink, Pyth, Uniswap TWAP, Chronicle, RedStone), configuring EulerRouter for price resolution, querying asset prices, and understanding IRM types (Linear Kink, Adaptive Curve, Fixed Cyclical Binary, Base Premium).

---

## Table of Contents

1. [Oracle Integration](#1-oracle-integration) — **HIGH**
   - 1.1 [Configure EulerRouter for Price Resolution](#11-configure-eulerrouter-for-price-resolution)
   - 1.2 [Deploy an Oracle Adapter](#12-deploy-an-oracle-adapter)
   - 1.3 [Get Asset Prices from Oracles](#13-get-asset-prices-from-oracles)
2. [Interest Rate Models](#2-interest-rate-models) — **HIGH**
   - 2.1 [Interest Rate Model Types and Configuration](#21-interest-rate-model-types-and-configuration)

---

## 1. Oracle Integration

**Impact: HIGH**

Oracle integration guide for Euler Finance V2 protocol. Covers deploying oracle adapters (Chainlink, Pyth, Uniswap TWAP, Chronicle, RedStone, Cross, Fixed Rate), configuring EulerRouter for price resolution, and querying asset prices. Essential for vault creation and price feed management.

### 1.1 Configure EulerRouter for Price Resolution

**Impact: HIGH (Central oracle routing for vault pricing)**

EulerRouter is the central price resolution contract that routes price queries to appropriate oracle adapters. It supports direct pricing and ERC-4626 vault share pricing via `convertToAssets`.

**Incorrect: hardcoding oracle in vault**

```solidity
// Don't hardcode individual oracles in vaults
// This makes upgrades and fixes impossible
IEVault(vault).setOracle(specificOracleAdapter);
// If oracle has issues, vault is stuck
```

**Correct: deploy and configure EulerRouter**

```solidity
import {EulerRouter} from "euler-price-oracle/EulerRouter.sol";
import {EulerRouterFactory} from "evk-periphery/EulerRouterFactory/EulerRouterFactory.sol";

// Deploy router via factory
// Note: Factory was initialized with EVC address in its constructor
address router = EulerRouterFactory(factory).deploy(governor);

// Configure pricing for asset pairs
EulerRouter eulerRouter = EulerRouter(router);

// Set direct oracle for ETH/USD
// Note: Assets are lexicographically sorted internally
eulerRouter.govSetConfig(
    weth,                    // Base asset
    usd,                     // Quote asset  
    chainlinkEthUsdOracle    // Oracle adapter address
);

// Set direct oracle for BTC/USD
eulerRouter.govSetConfig(
    wbtc,
    usd,
    chainlinkBtcUsdOracle
);
```

**Correct: understanding resolution - NO automatic cross-pricing**

```solidity
// IMPORTANT: EulerRouter does NOT automatically chain oracles!
// For TOKEN/USD pricing, you must EITHER:
// 1. Configure a direct TOKEN/USD oracle, OR
// 2. Use a CrossAdapter that handles the cross-pricing internally

// Resolution order in resolveOracle():
// 1. base == quote? Return inAmount (same asset)
// 2. Direct oracle configured for base/quote? Use it
// 3. Base is a resolved ERC4626 vault? Convert via convertToAssets, recurse
// 4. Fallback oracle set? Use it
// 5. Revert with PriceOracle_NotSupported

// Example: If you need TOKEN/USD via TOKEN/ETH and ETH/USD,
// use a CrossAdapter, not multiple govSetConfig calls
import {CrossAdapter} from "euler-price-oracle/adapter/CrossAdapter.sol";

// Deploy cross adapter that chains TOKEN/ETH -> ETH/USD
address crossAdapter = new CrossAdapter(
    tokenEthOracle,   // First oracle: TOKEN/ETH
    ethUsdOracle,     // Second oracle: ETH/USD
    weth              // Cross asset (intermediate)
);

// Configure router with the cross adapter
eulerRouter.govSetConfig(tokenAddress, usd, crossAdapter);
```

**Correct: ERC-4626 vault share pricing**

```solidity
// For pricing vault shares in terms of underlying
// Router uses convertToAssets() for automatic share->asset conversion

// Configure underlying asset pricing first
eulerRouter.govSetConfig(
    underlyingAsset,
    usd,
    underlyingOracle
);

// Enable vault share resolution
// Router will call vault.convertToAssets() and recurse
eulerRouter.govSetResolvedVault(
    vaultAddress,
    true  // Enable automatic share->asset conversion
);

// To disable later:
eulerRouter.govSetResolvedVault(vaultAddress, false);

// Now queries for vault shares work:
// vaultShares -> convertToAssets -> underlying -> USD
uint256 shareValueUsd = eulerRouter.getQuote(1e18, vaultAddress, usd);

// IMPORTANT: Verify vault's convertToAssets is secure before configuring!
// Per ERC4626 spec, convert* ignores liquidity, fees, slippage
// The reported price may not be realizable through redeem/withdraw
```

**Correct: TypeScript router configuration**

```typescript
import { encodeFunctionData, getContract } from 'viem';

const eulerRouter = getContract({
  address: routerAddress,
  abi: eulerRouterABI,
  client: walletClient
});

// Configure oracle for asset pair
// Note: gov functions require being called by governor via EVC context
await eulerRouter.write.govSetConfig([
  wethAddress,        // base
  usdAddress,         // quote  
  chainlinkOracle     // oracle adapter
]);

// Configure resolved vault for share pricing
await eulerRouter.write.govSetResolvedVault([
  vaultAddress,
  true  // set = true to enable, false to disable
]);

// Query prices
const quote = await eulerRouter.read.getQuote([
  parseEther('1'),    // inAmount
  wethAddress,        // base
  usdAddress          // quote
]);

// Get bid/ask quotes
const [bid, ask] = await eulerRouter.read.getQuotes([
  parseEther('1'),
  wethAddress,
  usdAddress
]);

// Check configured oracle for a pair
const oracle = await eulerRouter.read.getConfiguredOracle([
  wethAddress,
  usdAddress
]);
```

**Correct: fallback configuration**

```solidity
// Set fallback oracle for pairs without direct config
// Called when no direct oracle AND base is not a resolved vault
eulerRouter.govSetFallbackOracle(fallbackOracleAddress);

// To remove fallback:
eulerRouter.govSetFallbackOracle(address(0));

// Resolution order:
// 1. base == quote → return inAmount
// 2. Direct config for base/quote → use configured oracle
// 3. Base is resolved vault → convertToAssets, recurse with asset
// 4. Fallback oracle exists → use fallback
// 5. No fallback → revert PriceOracle_NotSupported(base, quote)
```

**Correct: querying existing configuration**

```solidity
// Get configured oracle for a pair
// Returns address(0) if not configured
address oracle = eulerRouter.getConfiguredOracle(base, quote);

// Check if vault is configured for resolved pricing
address asset = eulerRouter.resolvedVaults(vaultAddress);
bool isResolved = asset != address(0);

// Get current fallback oracle
address fallback = eulerRouter.fallbackOracle();

// Simulate full resolution path
(uint256 resolvedAmount, address resolvedBase, address resolvedQuote, address resolvedOracle) = 
    eulerRouter.resolveOracle(inAmount, base, quote);
```

**Important considerations:**

```solidity
// Gov functions have onlyEVCAccountOwner and onlyGovernor modifiers
// Must be called by governor, typically via EVC context

// Finalize router to make immutable (optional)
eulerRouter.transferGovernance(address(0));
// WARNING: No more configuration changes possible after this!

// For upgradeable setups, use a timelock or multisig as governor
// This allows fixing oracle issues without vault redeployment

// Assets are lexicographically sorted internally in the mapping
// govSetConfig(A, B, oracle) and govSetConfig(B, A, oracle) 
// configure the same pair - order doesn't matter for callers
```

Reference: [https://github.com/euler-xyz/euler-price-oracle/blob/master/src/EulerRouter.sol](https://github.com/euler-xyz/euler-price-oracle/blob/master/src/EulerRouter.sol)

### 1.2 Deploy an Oracle Adapter

**Impact: HIGH (Required for vault pricing and risk management)**

Oracle adapters translate external price feeds into Euler's `IPriceOracle` interface. Each adapter is immutable and connects to a single price source.

**Incorrect: using Chainlink directly without adapter**

```solidity
// Chainlink returns (roundId, answer, startedAt, updatedAt, answeredInRound)
// This raw interface is incompatible with Euler's IPriceOracle
(, int256 answer,,,) = AggregatorV3Interface(feed).latestRoundData();
// Also missing staleness checks, decimal handling, etc.
```

**Correct: deploy ChainlinkOracle adapter**

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

**Correct: deploy PythOracle adapter**

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

**CRITICAL: Pyth Price Updates Required**

Pyth oracles are pull-based and **will revert if prices are stale**. You must update prices before any Euler operation that uses the oracle (deposits, borrows, liquidations, etc.):

For production, consider using MEV protection services that bundle price updates automatically.

**Correct: deploy UniswapV3 TWAP oracle**

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

**Correct: deploy rate provider oracle for LSTs**

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

**Correct: deploy ChronicleOracle adapter**

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

**Correct: deploy RedStoneOracle adapter**

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

**Correct: deploy FixedRateOracle for stablecoins**

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

**Correct: deploy CrossAdapter for chained pricing**

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

**Correct: deploy PendleOracle for yield-bearing tokens**

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

**IMPORTANT: Pendle Market Initialization Required**

Pendle markets must be initialized before the oracle can return prices:

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

Reference: [https://github.com/euler-xyz/euler-price-oracle#oracle-adapters](https://github.com/euler-xyz/euler-price-oracle#oracle-adapters)

### 1.3 Get Asset Prices from Oracles

**Impact: HIGH (Essential for value calculations and risk assessment)**

Querying prices is fundamental for calculating position values, health factors, and making trading decisions. Euler oracles use a quote-based interface that returns amounts rather than unit prices.

**Incorrect: assuming unit price response**

```solidity
// Wrong: Oracles don't return "price per token"
uint256 price = oracle.getPrice(token);
uint256 value = tokenAmount * price;
// getPrice() doesn't exist in IPriceOracle!
```

**Correct: using getQuote for amount conversion**

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

**Correct: using OracleLens for comprehensive data**

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

**Correct: bid/ask pricing for spreads**

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

**Correct: handling oracle failures**

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

**Correct: calculating portfolio value**

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

**Important: Pyth Oracle Price Updates**

If using Pyth oracles, prices must be updated before querying or the call will revert:

Key points:

- `getQuote` converts amounts, not returns unit prices

- Always handle potential oracle reverts gracefully

- Consider bid/ask spreads for accurate risk assessment

- Decimals are handled internally by adapters

- Cross-pricing works automatically through EulerRouter

- **Pyth oracles require price updates before any operation that uses them**

See also: [Lens Contracts](tools-lens) - OracleLens for oracle validation and checking stale pull oracles.

Reference: [https://github.com/euler-xyz/euler-price-oracle#iprice oracle](https://github.com/euler-xyz/euler-price-oracle#iprice oracle)

---

## 2. Interest Rate Models

**Impact: HIGH**

Available Interest Rate Models and their configuration. Euler supports multiple IRM types (Linear Kink, Adaptive Curve, Fixed Cyclical Binary, Base Premium) each suited for different use cases and risk profiles.

### 2.1 Interest Rate Model Types and Configuration

**Impact: HIGH (Critical for selecting and configuring appropriate interest rates)**

Euler V2 supports multiple Interest Rate Model (IRM) types, each suited for different market dynamics and risk profiles.

**Incorrect: using wrong IRM for use case**

```solidity
// WRONG: Using linear kink for a volatile asset that needs adaptive rates
// This can lead to under/over-utilization and poor capital efficiency
address irm = kinkIRMFactory.deploy(
    0,           // baseRate
    4e27,        // slope1 (too high!)
    300e27,      // slope2 (too high!)
    3865470566   // kink: 90% (type(uint32).max * 9 / 10)
);
// Static rates don't adapt to market conditions!
```

**Correct: choosing appropriate IRM type**

```solidity
import {IRMBasePremium} from "evk-periphery/IRM/IRMBasePremium.sol";

// Admin can adjust rates without redeploying
IRMBasePremium irm = new IRMBasePremium(
    evc,
    admin,
    1e26,         // baseRate: 1% base
    5e26          // premiumRate: 5% premium (total 6%)
);

// Override premium for specific vaults
irm.setRateOverride(specialVault, true, 2e26); // 3% total for this vault
```

Traditional two-slope model. Rate increases linearly up to kink, then accelerates.

Self-adjusting model that targets specific utilization. Rate at target adjusts based on time spent above/below target.

Similar to kink IRM but with non-linear acceleration after kink using shape parameter.

Alternates between two fixed rates on a schedule. Useful for special mechanisms.

Admin-controlled fixed rate with per-vault overrides. Good for curated markets.

**Selecting the Right IRM:**

| Use Case | Recommended IRM | Reason |

|----------|-----------------|--------|

| Stable coins (USDC, DAI) | Linear Kink | Predictable behavior |

| Volatile assets (ETH, BTC) | Adaptive Curve | Self-adjusts to demand |

| New markets | Adaptive Curve | Finds optimal rate |

| Curated/governed | Base Premium | Direct control |

| Synthetic assets | Fixed Cyclical | Special mechanics |

Reference: [https://github.com/euler-xyz/evk-periphery/tree/master/src/IRM](https://github.com/euler-xyz/evk-periphery/tree/master/src/IRM)

---

## References

1. [https://docs.euler.finance](https://docs.euler.finance)
2. [https://github.com/euler-xyz/euler-price-oracle](https://github.com/euler-xyz/euler-price-oracle)
3. [https://github.com/euler-xyz/evk-periphery](https://github.com/euler-xyz/evk-periphery)
