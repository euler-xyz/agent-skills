# EulerSwap Agent Skill

**Version 1.0.0**  
Euler Labs  
January 2026

> **Note:**  
> This document is for agents and LLMs to follow when interacting with  
> EulerSwap AMM. It covers pool deployment, quotes, liquidity limits, and swap execution.

---

## Abstract

EulerSwap AMM integration guide for Euler Finance. Covers deploying swap pools backed by Euler lending vaults, getting quotes, checking liquidity limits, and executing swaps. Enables up to 40x deeper liquidity than traditional AMMs.

---

## Table of Contents

1. [EulerSwap AMM](#1-eulerswap-amm) — **MEDIUM**
   - 1.1 [Check EulerSwap Liquidity Limits](#11-check-eulerswap-liquidity-limits)
   - 1.2 [Deploy EulerSwap Pool](#12-deploy-eulerswap-pool)
   - 1.3 [Execute Swaps on EulerSwap](#13-execute-swaps-on-eulerswap)
   - 1.4 [Get Swap Quotes from EulerSwap](#14-get-swap-quotes-from-eulerswap)

---

## 1. EulerSwap AMM

**Impact: MEDIUM**

EulerSwap is Euler's native AMM optimized for vault assets. Covers pool deployment using EulerSwapFactory, getting quotes with tick-based pricing and fee tiers, managing liquidity limits, and executing swaps (direct or via aggregators). Essential for on-chain liquidity provision.

### 1.1 Check EulerSwap Liquidity Limits

**Impact: MEDIUM (Understand available swap capacity)**

EulerSwap pools have directional liquidity limits based on the underlying Euler vault positions. Understanding these limits is crucial for executing large swaps successfully.

**Incorrect: assuming unlimited liquidity**

```solidity
// EulerSwap pools have finite, directional limits
// Unlike AMMs, liquidity comes from lending positions
pool.swap(1_000_000e18, 0, recipient, "");
// May fail if exceeds pool's borrowing capacity
```

**Correct: check limits before swapping**

```solidity
import {IEulerSwap} from "euler-swap/interfaces/IEulerSwap.sol";

// getLimits(tokenIn, tokenOut) returns two values:
// - inLimit: max tokenIn that can be sold
// - outLimit: max tokenOut that can be bought
(uint256 inLimit, uint256 outLimit) = IEulerSwap(pool).getLimits(tokenIn, tokenOut);

// Check if your swap is within limits
require(amountIn <= inLimit, "Exceeds input limit");
// Output will be checked by computeQuote

// For the reverse direction, call with swapped tokens:
(uint256 reverseInLimit, uint256 reverseOutLimit) = IEulerSwap(pool).getLimits(tokenOut, tokenIn);
```

**Correct: understanding limit factors**

```typescript
interface PoolLiquidity {
  pool: Address;
  tokenIn: Address;
  tokenOut: Address;
  limits: {
    inLimit: bigint;   // max tokenIn that can be sold
    outLimit: bigint;  // max tokenOut that can be bought
  };
  factors: {
    vaultCash: bigint;
    borrowCap: bigint;
    supplyCap: bigint;
    utilization: number;
  };
}

async function analyzeLiquidity(pool: Address, tokenIn: Address, tokenOut: Address): Promise<PoolLiquidity> {
  // getLimits takes tokenIn and tokenOut addresses
  const [inLimit, outLimit] = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getLimits',
    args: [tokenIn, tokenOut],
  });
  
  // Limits depend on:
  // 1. Available cash in lending vaults (for output)
  // 2. Remaining borrow capacity (for borrowing output)
  // 3. Supply caps (for depositing input as collateral)
  // 4. Current utilization of vaults
  
  const vault0 = await pool.vault0();
  const vault1 = await pool.vault1();
  
  // Get static params for vault info
  const staticParams = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getStaticParams',
  });
  
  const vault0Info = await vaultLens.getVaultInfoDynamic(staticParams.supplyVault0);
  
  return {
    pool,
    tokenIn,
    tokenOut,
    limits: {
      inLimit,   // max tokenIn that can be sold
      outLimit,  // max tokenOut that can be bought
    },
    factors: {
      vaultCash: vault0Info.totalCash,
      borrowCap: vault0Info.borrowCap,
      supplyCap: vault0Info.supplyCap,
      utilization: vault0Info.totalBorrowed / vault0Info.totalAssets,
    },
  };
}
```

**Correct: splitting large swaps**

```solidity
// If swap exceeds limits, split into multiple smaller swaps
function splitSwap(
    address pool,
    uint256 totalAmountIn,
    address tokenIn,
    address tokenOut,
    uint256 minTotalOut
) external returns (uint256 totalOut) {
    (address asset0,) = IEulerSwap(pool).getAssets();
    bool sellingToken0 = tokenIn == asset0;
    
    uint256 remaining = totalAmountIn;
    
    while (remaining > 0) {
        // Check current limits - getLimits(tokenIn, tokenOut)
        (uint256 inLimit,) = IEulerSwap(pool).getLimits(tokenIn, tokenOut);
        
        if (inLimit == 0) {
            // Pool at capacity - wait or use different pool
            break;
        }
        
        uint256 swapAmount = remaining > inLimit ? inLimit : remaining;
        
        // Get quote and execute swap
        uint256 out = IEulerSwap(pool).computeQuote(tokenIn, tokenOut, swapAmount, true);
        IERC20(tokenIn).transfer(pool, swapAmount);
        IEulerSwap(pool).swap(
            sellingToken0 ? 0 : out,
            sellingToken0 ? out : 0,
            address(this),
            ""
        );
        
        totalOut += out;
        remaining -= swapAmount;
        
        // Note: In practice, limits may not refresh within same tx
        // This pattern works better across blocks
    }
    
    require(totalOut >= minTotalOut, "Insufficient output");
}
```

**Correct: monitoring pool health**

```typescript
async function isPoolHealthy(
  pool: Address,
  token0: Address,
  token1: Address
): Promise<boolean> {
  // Check if pool can fulfill swaps in both directions
  // getLimits(tokenIn, tokenOut) returns (inLimit, outLimit)
  const [limit0To1In, limit0To1Out] = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getLimits',
    args: [token0, token1],
  });
  
  const [limit1To0In, limit1To0Out] = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getLimits',
    args: [token1, token0],
  });
  
  // Pool should have meaningful limits in both directions
  const MIN_MEANINGFUL_LIMIT = 1000n * 10n ** 18n; // $1000 worth
  
  const hasForwardLiquidity = limit0To1In > MIN_MEANINGFUL_LIMIT;
  const hasReverseLiquidity = limit1To0In > MIN_MEANINGFUL_LIMIT;
  
  // Check pool is registered and not abandoned
  const isRegistered = await registry.isRegistered(pool);
  
  return hasForwardLiquidity && hasReverseLiquidity && isRegistered;
}

// Find pools with best liquidity for your swap size
async function findLiquidPools(
  tokenIn: Address,
  tokenOut: Address,
  requiredAmount: bigint
): Promise<Address[]> {
  const allPools = await registry.getPools(tokenIn, tokenOut);
  
  const liquidPools = await Promise.all(
    allPools.map(async (pool) => {
      const [inLimit,] = await publicClient.readContract({
        address: pool,
        abi: eulerSwapABI,
        functionName: 'getLimits',
        args: [tokenIn, tokenOut],
      });
      return inLimit >= requiredAmount ? pool : null;
    })
  );
  
  return liquidPools.filter((p): p is Address => p !== null);
}
```

Key concepts:

- getLimits(tokenIn, tokenOut) returns (inLimit, outLimit) for that specific direction

- Call getLimits twice with swapped arguments to check both directions

- Large swaps may need splitting across pools or time

- Pool registry tracks active, maintained pools

- Abandoned pools may have zero limits despite appearing active

Reference: [https://github.com/euler-xyz/euler-swap#liquidity](https://github.com/euler-xyz/euler-swap#liquidity)

### 1.2 Deploy EulerSwap Pool

**Impact: HIGH (Create liquidity pools backed by Euler lending)**

EulerSwap pools use Euler vaults for liquidity, allowing LPs to earn both trading fees and lending yields. Pools are deployed via `EulerSwapFactory.deployPool()`.

**Incorrect: using traditional AMM assumptions**

```solidity
// WRONG: EulerSwap pools are NOT like Uniswap pools
// They use Euler vaults for liquidity, not raw token deposits
factory.createPair(tokenA, tokenB);  // Wrong interface!
```

**Correct: deploy EulerSwap pool via factory**

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

**Correct: TypeScript pool deployment**

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

**Correct: computing pool address before deployment**

```solidity
// Compute deterministic pool address before deployment
address predictedPool = factory.computePoolAddress(sParams, salt);

// Verify pool was deployed by factory
bool isValid = factory.deployedPools(poolAddress);
```

**Correct: setting up LP position**

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

Reference: [https://github.com/euler-xyz/euler-swap](https://github.com/euler-xyz/euler-swap), [https://github.com/euler-xyz/euler-swap/blob/master/src/EulerSwapFactory.sol](https://github.com/euler-xyz/euler-swap/blob/master/src/EulerSwapFactory.sol)

### 1.3 Execute Swaps on EulerSwap

**Impact: MEDIUM (Token swaps via Euler liquidity)**

EulerSwap pools provide a Uniswap V2-compatible interface for executing swaps. Liquidity comes from Euler lending vaults, enabling deeper markets than traditional AMMs.

**Incorrect: swap without checking limits**

```solidity
// Large swaps may exceed pool liquidity limits
pool.swap(hugeAmount, 0, recipient, "");
// Reverts if amount exceeds getLimits()
```

**Correct: basic swap execution**

```solidity
import {IEulerSwap} from "euler-swap/interfaces/IEulerSwap.sol";

// Step 1: Get quote and check limits
// computeQuote(tokenIn, tokenOut, amount, exactIn)
uint256 amountOut = IEulerSwap(pool).computeQuote(tokenIn, tokenOut, amountIn, true);
uint256 minOut = amountOut * 995 / 1000; // 0.5% slippage

// Step 2: Transfer input tokens to pool
IERC20(tokenIn).transfer(pool, amountIn);

// Step 3: Execute swap (Uniswap V2 style)
// amount0Out and amount1Out - one is your output, other is 0
(address asset0,) = IEulerSwap(pool).getAssets();
bool tokenInIsToken0 = tokenIn == asset0;

IEulerSwap(pool).swap(
    tokenInIsToken0 ? 0 : minOut,       // amount0Out
    tokenInIsToken0 ? minOut : 0,        // amount1Out
    recipient,                            // to
    ""                                    // data (empty for simple swap)
);
```

**Correct: using EulerSwapPeriphery for safety**

```solidity
import {IEulerSwapPeriphery} from "euler-swap/interfaces/IEulerSwapPeriphery.sol";

// Periphery handles token transfers and slippage checks

// Exact input swap
IERC20(tokenIn).approve(periphery, amountIn);

uint256 amountOut = IEulerSwapPeriphery(periphery).swapExactIn(
    pool,
    amountIn,
    minAmountOut,     // Slippage protection
    tokenIn,
    recipient,
    deadline          // Transaction deadline
);

// Exact output swap
IERC20(tokenIn).approve(periphery, maxAmountIn);

uint256 amountIn = IEulerSwapPeriphery(periphery).swapExactOut(
    pool,
    amountOut,        // Exact amount to receive
    maxAmountIn,      // Max willing to pay
    tokenIn,
    recipient,
    deadline
);
```

**Correct: TypeScript swap execution**

```typescript
import { encodeFunctionData } from 'viem';

async function executeSwap(
  pool: Address,
  tokenIn: Address,
  amountIn: bigint,
  minAmountOut: bigint,
  recipient: Address
) {
  // Use getAssets() to get token addresses
  const [asset0, asset1] = await publicClient.readContract({
    address: pool,
    abi: eulerSwapABI,
    functionName: 'getAssets',
  });
  
  const tokenInIsToken0 = tokenIn.toLowerCase() === asset0.toLowerCase();
  
  // Approve and transfer in one tx via EVC batch
  const batchItems = [
    // Transfer tokens to pool
    {
      onBehalfOfAccount: sender,
      targetContract: tokenIn,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20ABI,
        functionName: 'transfer',
        args: [pool, amountIn],
      }),
    },
    // Execute swap
    {
      onBehalfOfAccount: sender,
      targetContract: pool,
      value: 0n,
      data: encodeFunctionData({
        abi: eulerSwapABI,
        functionName: 'swap',
        args: [
          tokenInIsToken0 ? 0n : minAmountOut,
          tokenInIsToken0 ? minAmountOut : 0n,
          recipient,
          '0x',
        ],
      }),
    },
  ];
  
  return await evc.write.batch([batchItems]);
}
```

**Correct: flash swap with callback**

```solidity
// Flash swaps: receive tokens first, pay in callback
contract FlashSwapper {
    function executeFlashSwap(
        address pool,
        uint256 amount0Out,
        uint256 amount1Out,
        bytes calldata data
    ) external {
        // Request tokens without paying upfront
        IEulerSwap(pool).swap(amount0Out, amount1Out, address(this), data);
    }
    
    // Callback from pool
    function eulerSwapCall(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external {
        // We've received the output tokens
        // Now we must pay the input tokens
        
        address pool = msg.sender;
        (address token0, address token1) = IEulerSwap(pool).getAssets();
        
        // Calculate required input (with fee)
        // computeQuote(tokenIn, tokenOut, amount, exactIn)
        address tokenIn = amount0 > 0 ? token1 : token0;
        address tokenOut = amount0 > 0 ? token0 : token1;
        uint256 amountIn = IEulerSwap(pool).computeQuote(
            tokenIn,
            tokenOut,
            amount0 > 0 ? amount0 : amount1,
            false // exact output
        );
        
        // Do something with received tokens (arbitrage, etc.)
        // ...
        
        // Pay back input tokens
        IERC20(tokenIn).transfer(pool, amountIn);
    }
}
```

**Correct: multi-hop swap via aggregator**

```typescript
// For routes through multiple pools
async function multiHopSwap(
  route: Address[], // [tokenA, pool1, tokenB, pool2, tokenC]
  amountIn: bigint,
  minFinalOut: bigint
) {
  let currentAmount = amountIn;
  
  for (let i = 0; i < route.length - 1; i += 2) {
    const tokenIn = route[i];
    const pool = route[i + 1];
    const tokenOut = route[i + 2];
    
    // Quote this hop
    const [hopOut] = await IEulerSwap(pool).computeQuote(currentAmount, true);
    
    // Execute hop
    await executeSwap(pool, tokenIn, currentAmount, hopOut * 99n / 100n, sender);
    
    currentAmount = hopOut;
  }
  
  require(currentAmount >= minFinalOut, 'Insufficient output');
}
```

Key points:

- Transfer input tokens to pool before calling swap

- Use periphery for simpler interface with built-in safety

- Flash swaps available via callback mechanism

- Check limits with `getLimits()` for large swaps

- Always use slippage protection and deadlines

Reference: [https://github.com/euler-xyz/euler-swap#for-solvers](https://github.com/euler-xyz/euler-swap#for-solvers)

### 1.4 Get Swap Quotes from EulerSwap

**Impact: MEDIUM (Price discovery for swap execution)**

EulerSwap provides deep liquidity by borrowing output tokens against input tokens via Euler credit vaults. Use `computeQuote` to get exact prices before executing swaps.

**Incorrect: using old quote for execution**

```solidity
// Quotes can change between blocks!
uint256 quote = pool.computeQuote(amountIn, true);
// ... time passes, other transactions happen ...
pool.swap(amountIn, quote, recipient, "");
// May revert if price moved - quote is stale
```

**Correct: query and execute atomically**

```solidity
import {IEulerSwap} from "euler-swap/interfaces/IEulerSwap.sol";

// Get quote for exact input swap
// computeQuote(tokenIn, tokenOut, amount, exactIn) returns amountOut
uint256 amountOut = IEulerSwap(pool).computeQuote(
    tokenIn,           // Input token address
    tokenOut,          // Output token address
    amountIn,          // Amount of input token
    true               // Exact input (vs exact output)
);

// Apply slippage tolerance
uint256 minAmountOut = amountOut * 995 / 1000; // 0.5% slippage

// Transfer tokens to pool first (Uniswap V2 style)
IERC20(tokenIn).transfer(pool, amountIn);

// Execute swap - specify amounts OUT (Uniswap V2 interface)
// swap(amount0Out, amount1Out, to, data)
bool tokenOutIsToken0 = tokenOut == IEulerSwap(pool).token0();
IEulerSwap(pool).swap(
    tokenOutIsToken0 ? minAmountOut : 0,
    tokenOutIsToken0 ? 0 : minAmountOut,
    recipient,
    ""
);
```

**Correct: exact output quote**

```solidity
// For exact output: "I want exactly X tokens out"

// Get quote: how much input needed for desired output?
// computeQuote(tokenIn, tokenOut, amount, exactIn)
uint256 amountIn = IEulerSwap(pool).computeQuote(
    tokenIn,            // Input token address
    tokenOut,           // Output token address
    desiredAmountOut,   // Exact amount you want to receive
    false               // Exact output mode (false = exact output)
);

// Apply slippage tolerance (allow paying slightly more)
uint256 maxAmountIn = amountIn * 1005 / 1000; // 0.5% slippage

// Transfer input tokens first
IERC20(tokenIn).transfer(pool, maxAmountIn);

// Execute swap (Uniswap V2 style interface)
pool.swap(
    tokenOutIsToken0 ? desiredAmountOut : 0,
    tokenOutIsToken0 ? 0 : desiredAmountOut,
    recipient,
    ""
);
```

**Correct: using EulerSwapPeriphery**

```typescript
import { EulerSwapPeriphery } from '@eulerxyz/euler-swap';

// Periphery provides simpler interface with built-in protections

// Quote exact input
const quoteExactIn = await periphery.quoteExactInput(
  pool,
  amountIn,
  tokenIn === token0
);

console.log(`${amountIn} tokenIn -> ${quoteExactIn} tokenOut`);

// Quote exact output  
const quoteExactOut = await periphery.quoteExactOutput(
  pool,
  amountOut,
  tokenIn === token0
);

console.log(`${quoteExactOut} tokenIn needed for ${amountOut} tokenOut`);
```

**Correct: checking quote validity**

```solidity
// computeQuote reverts if:
// 1. Insufficient liquidity
// 2. Pool is decommissioned
// 3. Amount exceeds pool limits

function safeQuote(
    address pool,
    address tokenIn,
    address tokenOut,
    uint256 amount,
    bool exactIn
) public view returns (uint256 quote, bool valid) {
    try IEulerSwap(pool).computeQuote(tokenIn, tokenOut, amount, exactIn) 
        returns (uint256 result) 
    {
        return (result, true);
    } catch {
        return (0, false);
    }
}

// Check limits before quoting
(uint256 limit0In, uint256 limit1In, uint256 limit0Out, uint256 limit1Out) = 
    IEulerSwap(pool).getLimits();

// Ensure your swap is within limits
require(amountIn <= (tokenInIsToken0 ? limit0In : limit1In), "Exceeds input limit");
```

**Correct: comparing across pools**

```typescript
interface SwapRoute {
  pool: Address;
  amountOut: bigint;
  priceImpact: number;
}

async function findBestRoute(
  pools: Address[],
  amountIn: bigint,
  tokenIn: Address
): Promise<SwapRoute | null> {
  const quotes = await Promise.all(
    pools.map(async (pool) => {
      try {
        const token0 = await IEulerSwap(pool).token0();
        const tokenInIsToken0 = tokenIn === token0;
        
        const [amountOut] = await IEulerSwap(pool).computeQuote(
          amountIn,
          true // exact input
        );
        
        // Calculate price impact
        const spotPrice = await getSpotPrice(pool);
        const executionPrice = amountOut * 1e18 / amountIn;
        const priceImpact = (spotPrice - executionPrice) / spotPrice;
        
        return { pool, amountOut, priceImpact };
      } catch {
        return null;
      }
    })
  );
  
  // Filter failed quotes and sort by best output
  return quotes
    .filter((q): q is SwapRoute => q !== null)
    .sort((a, b) => Number(b.amountOut - a.amountOut))[0];
}
```

Key points:

- Always quote and execute atomically (same tx)

- Use slippage tolerance to handle price movement

- Check `getLimits()` before large swaps

- Quote reverts if insufficient liquidity

- Compare quotes across multiple pools for best price

Reference: [https://github.com/euler-xyz/euler-swap/blob/master/src/interfaces/IEulerSwap.sol](https://github.com/euler-xyz/euler-swap/blob/master/src/interfaces/IEulerSwap.sol)

---

## References

1. [https://docs.euler.finance](https://docs.euler.finance)
2. [https://github.com/euler-xyz/euler-swap](https://github.com/euler-xyz/euler-swap)
