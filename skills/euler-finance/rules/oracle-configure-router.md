---
title: Configure EulerRouter for Price Resolution
impact: HIGH
impactDescription: Central oracle routing for vault pricing
tags: oracle, router, configuration, governance
---

## Configure EulerRouter for Price Resolution

EulerRouter is the central price resolution contract that routes price queries to appropriate oracle adapters. It supports direct pricing, cross-pricing through intermediaries, and ERC-4626 vault share pricing.

**Incorrect (hardcoding oracle in vault):**

```solidity
// Don't hardcode individual oracles in vaults
// This makes upgrades and fixes impossible
IEVault(vault).setOracle(specificOracleAdapter);
// If oracle has issues, vault is stuck
```

**Correct (deploy and configure EulerRouter):**

```solidity
import {EulerRouter} from "euler-price-oracle/EulerRouter.sol";
import {EulerRouterFactory} from "evk-periphery/EulerRouterFactory/EulerRouterFactory.sol";

// Deploy router via factory (for verification by perspectives)
address router = EulerRouterFactory(factory).deploy(governor);

// Configure pricing for asset pairs
EulerRouter eulerRouter = EulerRouter(router);

// Set direct oracle for ETH/USD
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

**Correct (cross-pricing through intermediary):**

```solidity
// For TOKEN/USD when only TOKEN/ETH and ETH/USD exist
// Router automatically chains: TOKEN -> ETH -> USD

// Step 1: Configure TOKEN/ETH oracle
eulerRouter.govSetConfig(
    tokenAddress,
    weth,
    tokenEthOracle  // e.g., Uniswap V3 TWAP
);

// Step 2: Configure ETH/USD oracle (if not already set)
eulerRouter.govSetConfig(
    weth,
    usd,
    chainlinkEthUsdOracle
);

// Now TOKEN/USD queries work automatically via cross-pricing
// Router will query TOKEN/ETH, then ETH/USD, and multiply
uint256 tokenUsdPrice = eulerRouter.getQuote(1e18, tokenAddress, usd);
```

**Correct (ERC-4626 vault share pricing):**

```solidity
// For pricing vault shares in terms of underlying
// Router uses convertToAssets() for accurate share valuation

// Configure underlying asset pricing
eulerRouter.govSetConfig(
    underlyingAsset,
    usd,
    underlyingOracle
);

// Enable vault share resolution (special handling)
eulerRouter.govSetResolvedVault(
    vaultAddress,
    true  // Enable automatic share->asset conversion
);

// Now queries for vault shares work:
// vaultShares -> underlying -> USD
uint256 shareValueUsd = eulerRouter.getQuote(1e18, vaultAddress, usd);
```

**Correct (TypeScript router configuration):**

```typescript
import { encodeFunctionData } from 'viem';

// Batch configure multiple oracle routes
const configItems = [
  { base: WETH, quote: USD, oracle: chainlinkEthUsd },
  { base: WBTC, quote: USD, oracle: chainlinkBtcUsd },
  { base: LINK, quote: ETH, oracle: uniswapLinkEth },
  { base: UNI, quote: ETH, oracle: uniswapUniEth },
];

const batchCalls = configItems.map(({ base, quote, oracle }) =>
  encodeFunctionData({
    abi: eulerRouterABI,
    functionName: 'govSetConfig',
    args: [base, quote, oracle],
  })
);

// Execute via governor or multisig
await governor.executeBatch(router, batchCalls);
```

**Correct (fallback configuration):**

```solidity
// Set fallback oracle for unregistered pairs
// Useful for broad coverage with specific overrides
eulerRouter.govSetFallbackOracle(fallbackOracleAddress);

// Query resolution order:
// 1. Direct config for base/quote pair
// 2. Cross-pricing via configured intermediaries
// 3. Fallback oracle (if set)
```

**Important considerations:**

```solidity
// Finalize router to make immutable (optional)
eulerRouter.transferGovernance(address(0));
// WARNING: No more configuration changes possible after this!

// For upgradeable setups, use a timelock or multisig as governor
// This allows fixing oracle issues without vault redeployment
```

Reference: [Euler Price Oracle - EulerRouter](https://github.com/euler-xyz/euler-price-oracle#eulerrouter)
