---
title: Deploy EulerSwap Pool
impact: HIGH
impactDescription: Create liquidity pools backed by Euler lending
tags: swap, deploy, pool, factory, liquidity
---

## Deploy EulerSwap Pool

EulerSwap pools use Euler vaults for liquidity, allowing LPs to earn both trading fees and lending yields. Pools are deployed via `EulerSwapFactory.deployPool()`.

**Incorrect (using traditional AMM assumptions):**

```solidity
// WRONG: EulerSwap pools are NOT like Uniswap pools
// They use Euler vaults for liquidity, not raw token deposits
factory.createPair(tokenA, tokenB);  // Wrong interface!
```

**Correct (deploy EulerSwap pool via factory):**

```solidity
import {IEulerSwapFactory} from "euler-swap/interfaces/IEulerSwapFactory.sol";
import {IEulerSwap} from "euler-swap/interfaces/IEulerSwap.sol";

IEulerSwapFactory factory = IEulerSwapFactory(factoryAddress);

// StaticParams define the vault structure (immutable after deployment)
IEulerSwap.StaticParams memory sParams = IEulerSwap.StaticParams({
    supplyVault0: wethVault,    // Vault for supplying token0 (earns yield)
    supplyVault1: usdcVault,    // Vault for supplying token1 (earns yield)
    borrowVault0: wethVault,    // Vault for borrowing token0 (when selling token1)
    borrowVault1: usdcVault,    // Vault for borrowing token1 (when selling token0)
    eulerAccount: lpAccount,    // EVC sub-account that holds the position
    feeRecipient: treasury      // Address receiving trading fees
});

// DynamicParams define pool behavior (can be updated by LP)
// Based on real test patterns from euler-swap test suite
IEulerSwap.DynamicParams memory dParams = IEulerSwap.DynamicParams({
    equilibriumReserve0: 60e18,     // Target reserve of token0 (60 units)
    equilibriumReserve1: 60e18,     // Target reserve of token1 (60 units)
    minReserve0: 1e18,              // Minimum token0 reserve
    minReserve1: 1e18,              // Minimum token1 reserve
    priceX: 1e18,                   // Price numerator (1:1 ratio for same-value tokens)
    priceY: 1e18,                   // Price denominator
    concentrationX: 0.4e18,         // Liquidity concentration X (0 to <1e18, higher = more concentrated)
    concentrationY: 0.85e18,        // Liquidity concentration Y (asymmetric is common)
    fee0: 0.003e18,                 // Fee for selling token0 (0.3%)
    fee1: 0.003e18,                 // Fee for selling token1 (0.3%)
    expiration: 0,                  // 0 = no expiration
    swapHookedOperations: 0,        // Bitfield of hooked operations
    swapHook: address(0)            // Hook contract (0 = none)
});

// For WETH/USDC with different decimals (18 vs 6):
// equilibriumReserve0: 50e6   (50 USDC with 6 decimals)
// equilibriumReserve1: 60e18  (60 WETH with 18 decimals)
// priceX: 1e18                (price numerator)
// priceY: 1e6                 (matches USDC decimals for proper scaling)

// InitialState defines starting reserves (usually matches equilibrium or nearby)
IEulerSwap.InitialState memory initialState = IEulerSwap.InitialState({
    reserve0: 60e18,     // Starting token0 (matches equilibrium)
    reserve1: 60e18      // Starting token1 (matches equilibrium)
});

// Deploy the pool
bytes32 salt = bytes32(0);  // Or unique salt for deterministic address
address pool = factory.deployPool(sParams, dParams, initialState, salt);
```

**Correct (TypeScript pool deployment):**

```typescript
import { encodeFunctionData } from 'viem';

// Define static params
const staticParams = {
  supplyVault0: wethVaultAddress,
  supplyVault1: usdcVaultAddress,
  borrowVault0: wethVaultAddress,
  borrowVault1: usdcVaultAddress,
  eulerAccount: lpSubAccount,
  feeRecipient: treasuryAddress,
};

// Define dynamic params (matching test patterns)
const dynamicParams = {
  equilibriumReserve0: 60n * 10n ** 18n,      // 60 units token0
  equilibriumReserve1: 60n * 10n ** 18n,      // 60 units token1
  minReserve0: 1n * 10n ** 18n,
  minReserve1: 1n * 10n ** 18n,
  priceX: 1n * 10n ** 18n,                    // 1:1 price ratio
  priceY: 1n * 10n ** 18n,
  concentrationX: 4n * 10n ** 17n,            // 0.4e18 - common test value
  concentrationY: 85n * 10n ** 16n,           // 0.85e18 - common test value
  fee0: 3n * 10n ** 15n,                      // 0.3%
  fee1: 3n * 10n ** 15n,
  expiration: 0n,
  swapHookedOperations: 0,
  swapHook: zeroAddress,
};

// Define initial state (matches equilibrium)
const initialState = {
  reserve0: 60n * 10n ** 18n,
  reserve1: 60n * 10n ** 18n,
};

// Deploy pool
const poolAddress = await factory.write.deployPool([
  staticParams,
  dynamicParams,
  initialState,
  '0x0000000000000000000000000000000000000000000000000000000000000000',
]);
```

**Correct (computing pool address before deployment):**

```solidity
// Compute deterministic pool address before deployment
address predictedPool = factory.computePoolAddress(sParams, salt);

// Verify pool was deployed by factory
bool isValid = factory.deployedPools(poolAddress);
```

**Correct (setting up LP position):**

```solidity
// Before deployment, LP needs to:
// 1. Set up EVC sub-account for the pool
// 2. Enable collaterals and controllers
// 3. Deposit initial liquidity into vaults

// The eulerAccount in StaticParams should be an EVC sub-account
address lpSubAccount = getSubAccount(lpAddress, 1);  // Sub-account index 1

// Enable vaults as collateral for the LP account
evc.enableCollateral(lpSubAccount, supplyVault0);
evc.enableCollateral(lpSubAccount, supplyVault1);

// Enable borrow vaults as controllers
evc.enableController(lpSubAccount, borrowVault0);
evc.enableController(lpSubAccount, borrowVault1);

// Deposit initial liquidity
IERC20(weth).approve(supplyVault0, initialWeth);
IEVault(supplyVault0).deposit(initialWeth, lpSubAccount);

IERC20(usdc).approve(supplyVault1, initialUsdc);
IEVault(supplyVault1).deposit(initialUsdc, lpSubAccount);

// Now deploy the pool with this account
```

**Pool Architecture:**

| Component | Purpose |
|-----------|---------|
| supplyVault0/1 | LP deposits here, earns lending yield |
| borrowVault0/1 | Pool borrows from here when providing output tokens |
| eulerAccount | EVC sub-account holding the LP position |
| feeRecipient | Receives trading fees |
| equilibriumReserve | Target reserve amounts for balanced state |
| minReserve | Minimum reserves to maintain liquidity |
| priceX/priceY | Price ratio (adjust for different token decimals) |
| concentrationX/Y | Curve shape (0 to <1e18, higher = more concentrated liquidity) |
| fee0/1 | Trading fee for each direction (e.g., 0.003e18 = 0.3%) |

**Important Considerations:**

```solidity
// 1. eulerAccount must have proper vault permissions before pool deployment
// 2. LP is responsible for managing health of the position
// 3. Pool can be decommissioned by LP when reserves reach minReserves
// 4. Hooks can add custom logic (access control, MEV protection, etc.)

// Query pool configuration
IEulerSwap.StaticParams memory staticParams = pool.getStaticParams();
IEulerSwap.DynamicParams memory dynamicParams = pool.getDynamicParams();

// Check if pool is still active
bool isActive = dynamicParams.expiration == 0 || block.timestamp < dynamicParams.expiration;

// Pool creator can reconfigure dynamic params
pool.reconfigure(newDynamicParams, newInitialState);  // Only eulerAccount owner can call
```

Reference: [EulerSwap README](https://github.com/euler-xyz/euler-swap), [EulerSwapFactory.sol](https://github.com/euler-xyz/euler-swap/blob/master/src/EulerSwapFactory.sol)
