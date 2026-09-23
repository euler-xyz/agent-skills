# EulerEarn Agent Skill

**Version 1.1.0**

Euler Labs

September 2026

> Generated from SKILL.md, metadata.json, and rules/. Edit those sources and run pnpm build.

EulerEarn yield aggregation guide for Euler Finance. Covers creating yield aggregation meta-vaults, managing strategies, role-based access control (owner, curator, guardian, allocator), and PublicAllocator for permissionless reallocation.

## Table of Contents

- [EulerEarn Yield Aggregation](#1-eulerearn-yield-aggregation)
  - [Create an EulerEarn Vault](#earn-create-vault-create-an-eulerearn-vault)
  - [Manage EulerEarn Strategies](#earn-manage-strategies-manage-eulerearn-strategies)

## 1. EulerEarn Yield Aggregation

**Impact: MEDIUM**

EulerEarn yield aggregation guide for Euler Finance. Covers creating yield aggregation meta-vaults, managing strategies across multiple ERC-4626 vaults, role-based access control (owner, curator, guardian, allocator), and PublicAllocator for permissionless reallocation.

### earn-create-vault Create an EulerEarn Vault

**Impact: MEDIUM (Deploy yield aggregation vaults)**

EulerEarn vaults are yield aggregation meta-vaults that allocate deposited assets across multiple ERC-4626 strategy vaults. They provide passive yield optimization with role-based governance.

**Incorrect (deploying without proper initialization):**

```solidity
// Don't deploy EulerEarn directly - use factory
EulerEarn vault = new EulerEarn();
// Missing proper initialization, not tracked by factory
```

**Correct (deploy via EulerEarnFactory):**

```solidity
import {EulerEarnFactory} from "euler-earn/EulerEarnFactory.sol";
import {IEulerEarn} from "euler-earn/interfaces/IEulerEarn.sol";

// Deploy EulerEarn vault via factory
// Parameters: initialOwner, initialTimelock, asset, name, symbol, salt
address earnVault = EulerEarnFactory(factory).createEulerEarn(
    initialOwner,       // Address that becomes vault owner
    0,                  // Initial timelock (can be 0)
    asset,              // Underlying asset (e.g., USDC)
    name,               // Vault name (e.g., "Euler USDC Earn")
    symbol,             // Vault symbol (e.g., "eUSDC")
    bytes32(0)          // Salt for CREATE2 (0 for default)
);

IEulerEarn earn = IEulerEarn(earnVault);
```

**Correct (configure vault after deployment):**

```solidity
// Set fee (max 50%)
earn.setFeeRecipient(treasuryAddress);
earn.setFee(0.1e18); // 10% of yield (setFee, not setPerformanceFee)

// Set timelock for governance actions (two-step process)
// Initial timelock can be 0, but subsequent changes are timelocked
// Step 1: Submit new timelock value
earn.submitTimelock(24 hours);
// Step 2: After current timelock elapses, accept the new value
earn.acceptTimelock();

// Set guardian for emergency actions (also two-step if timelock > 0)
earn.submitGuardian(guardianAddress);

// Set curator for strategy management
earn.setCurator(curatorAddress);

// Add allocators who can rebalance
earn.setIsAllocator(allocatorAddress, true);
```

**Correct (add strategy vaults):**

```solidity
// Strategy vaults must be ERC-4626 compliant
// EVK vaults are preferred due to built-in protections

// Submit cap for a strategy (timelocked if timelock > 0)
// Note: submitCap takes IERC4626, not address
earn.submitCap(
    IERC4626(strategyVault),  // IERC4626 strategy vault
    100_000e6                  // Supply cap (e.g., 100k USDC)
);

// After timelock, accept the cap
earn.acceptCap(IERC4626(strategyVault));

// Add strategy to supply queue (order matters)
// Note: setSupplyQueue takes IERC4626[] not address[]
IERC4626[] memory newSupplyQueue = new IERC4626[](2);
newSupplyQueue[0] = IERC4626(strategyVault1);  // First priority
newSupplyQueue[1] = IERC4626(strategyVault2);  // Second priority
earn.setSupplyQueue(newSupplyQueue);

// Withdraw queue contains all strategies with allocation
// Updated automatically, but can be reordered
```

**Correct (TypeScript vault creation):**

```typescript
import { encodeFunctionData, parseEventLogs } from 'viem';

// Deploy earn vault via factory
const creationHash = await eulerEarnFactory.write.createEulerEarn([
  ownerAddress,          // initialOwner
  0n,                    // initialTimelock
  usdcAddress,           // asset
  'Euler USDC Earn',     // name
  'eUSDC',               // symbol
  '0x0000000000000000000000000000000000000000000000000000000000000000', // salt
]);

// A write returns a transaction hash. Read the deployed address from its receipt.
const receipt = await publicClient.waitForTransactionReceipt({ hash: creationHash });
if (receipt.status !== 'success') throw new Error('Vault creation reverted');
const events = parseEventLogs({
  abi: eulerEarnFactoryABI,
  eventName: 'CreateEulerEarn',
  logs: receipt.logs.filter(log =>
    log.address.toLowerCase() === eulerEarnFactory.address.toLowerCase()),
});
if (events.length !== 1) throw new Error('Expected one factory creation event');
const earnVaultAddress = events[0].args.eulerEarn;

// Configure the deployed vault
const setupCalls = [
  encodeFunctionData({
    abi: eulerEarnABI,
    functionName: 'setFeeRecipient',
    args: [treasuryAddress],
  }),
  encodeFunctionData({
    abi: eulerEarnABI,
    functionName: 'setFee',
    args: [100_000_000_000_000_000n], // 10%
  }),
  encodeFunctionData({
    abi: eulerEarnABI,
    functionName: 'setCurator',
    args: [curatorAddress],
  }),
  encodeFunctionData({
    abi: eulerEarnABI,
    functionName: 'submitGuardian',
    args: [guardianAddress],
  }),
];

// Execute setup
for (const call of setupCalls) {
  const setupHash = await ownerWallet.sendTransaction({
    to: earnVaultAddress,
    data: call,
  });
  const setupReceipt = await publicClient.waitForTransactionReceipt({ hash: setupHash });
  if (setupReceipt.status !== 'success') throw new Error('Vault setup reverted');
}
```

**Role permissions overview:**

| Role | Capabilities |
|------|-------------|
| Owner | All actions, set other roles, set fee |
| Curator | Manage caps, submit removals, do allocator actions |
| Guardian | Revoke pending changes, emergency stops |
| Allocator | Set queues, reallocate funds |

**Non-borrowable idle vault setup:**

```solidity
// For guaranteed liquidity, add a non-borrowable "idle" strategy
// This ensures some funds are always withdrawable

// Create or use an Escrow Vault (non-borrowable EVK)
address escrowVault = createEscrowVault(asset);

// Add to EulerEarn with infinite cap
earn.submitCap(IERC4626(escrowVault), type(uint184).max);
// Wait for timelock...
earn.acceptCap(IERC4626(escrowVault));

// Put at end of supply queue (last priority)
// Funds only go here if other strategies are full
```

---

#### EulerEarnFactory Query Functions

The factory provides useful functions for discovering and validating EulerEarn vaults:

```solidity
import {EulerEarnFactory} from "euler-earn/EulerEarnFactory.sol";

EulerEarnFactory factory = EulerEarnFactory(factoryAddress);

// Check if an address is an EulerEarn vault deployed by this factory
bool isEarnVault = factory.isVault(vaultAddress);

// Check if a strategy is allowed (verified by perspective OR is an EulerEarn vault)
// Strategies must pass this check to be added to an EulerEarn vault
bool allowed = factory.isStrategyAllowed(strategyAddress);

// Get the perspective used for strategy verification
address perspective = factory.supportedPerspective();

// Get total number of deployed vaults
uint256 count = factory.getVaultListLength();

// Get a slice of deployed vaults (for pagination)
// Use type(uint256).max for end to get all remaining
address[] memory vaults = factory.getVaultListSlice(0, 10);  // First 10
address[] memory allVaults = factory.getVaultListSlice(0, type(uint256).max);  // All
```

```typescript
// TypeScript: Query factory for deployed vaults
const vaultCount = await factory.read.getVaultListLength();
console.log(`Total EulerEarn vaults: ${vaultCount}`);

// Check if strategy can be used
const canUseStrategy = await factory.read.isStrategyAllowed([strategyAddress]);
if (!canUseStrategy) {
  console.error('Strategy not verified by perspective');
}

// Get all deployed vaults (pass type(uint256).max for end)
const MAX_UINT256 = 2n ** 256n - 1n;
const allVaults = await factory.read.getVaultListSlice([0n, MAX_UINT256]);
```

Reference: [EulerEarn README](https://github.com/euler-xyz/euler-earn#readme), [EulerEarnFactory.sol](https://github.com/euler-xyz/euler-earn/blob/master/src/EulerEarnFactory.sol)

### earn-manage-strategies Manage EulerEarn Strategies

**Impact: MEDIUM (Optimize yield through strategy allocation)**

Strategy management involves adjusting allocations across ERC-4626 vaults to optimize yield while maintaining risk parameters. This is done by curators and allocators.

**Incorrect (wrong function signature and no liquidity check):**

```solidity
// ERROR: Wrong signature! reallocate takes MarketAllocation[] struct array
// Also doesn't check if strategy has enough liquidity
earn.reallocate(
    [strategyA, strategyB],
    [type(uint256).max, 0]  // Wrong! This is not valid syntax
);
// The actual function takes: reallocate(MarketAllocation[] memory allocations)
// where MarketAllocation has { IERC4626 id; uint256 assets; }
```

**Correct (check liquidity before reallocating):**

```solidity
// Check available liquidity in each strategy
function getStrategyLiquidity(address strategy)
    public view returns (uint256)
{
    return IERC4626(strategy).maxWithdraw(address(earn));
}

// Reallocate respecting liquidity
uint256 availableLiquidity = getStrategyLiquidity(fromStrategy);
uint256 currentAllocation = earn.expectedSupplyAssets(IERC4626(fromStrategy));
uint256 toWithdraw = min(desiredAmount, min(availableLiquidity, currentAllocation));
// Also bound toWithdraw by destination cap headroom and maxDeposit before sending.

// reallocate takes MarketAllocation[] struct array
// struct MarketAllocation { IERC4626 id; uint256 assets; }
//
// CRITICAL: The assets field specifies the TARGET allocation, not the delta!
// - assets = 0: Withdraw everything from this strategy
// - assets = N: Leave exactly N assets in this strategy
// - assets = type(uint256).max: Deposit the remaining assets withdrawn by this reallocation
//
// Order matters: withdrawals should come before deposits

MarketAllocation[] memory allocations = new MarketAllocation[](2);
allocations[0] = MarketAllocation({
    id: IERC4626(fromStrategy),
    assets: currentAllocation - toWithdraw  // Target after the bounded withdrawal
});
allocations[1] = MarketAllocation({
    id: IERC4626(toStrategy),
    assets: type(uint256).max  // Target: deposit the assets withdrawn above
});

earn.reallocate(allocations);
```

**Correct (updating supply queue priority):**

```typescript
// Supply queue determines deposit order
// First strategy gets filled first, then second, etc.

// Current queue: [vaultA, vaultB, vaultC]
// Want to prioritize vaultB for higher yield

const newSupplyQueue = [vaultB, vaultA, vaultC];

await earn.write.setSupplyQueue([newSupplyQueue]);

// Now deposits flow: vaultB (until cap) -> vaultA -> vaultC
```

**Correct (updating withdraw queue for liquidity):**

```solidity
// Withdraw queue determines withdrawal order
// Put most liquid strategies first for user experience

// Get current allocations
uint256[] memory allocations = new uint256[](strategies.length);
for (uint256 i = 0; i < strategies.length; i++) {
    allocations[i] = earn.expectedSupplyAssets(IERC4626(strategies[i]));
}

// updateWithdrawQueue takes uint256[] indexes, NOT addresses
// The indexes represent the new order of the current withdraw queue
// Example: To swap positions 0 and 1 in a 3-element queue: [1, 0, 2]
uint256[] memory newOrder = sortByLiquidityIndexes(strategies);
earn.updateWithdrawQueue(newOrder);
```

**Correct (reducing strategy cap safely):**

```solidity
// To reduce exposure to a strategy:

// Step 1: Reduce cap (instant for curator/owner)
earn.submitCap(IERC4626(riskyStrategy), newLowerCap);
// No timelock for cap reduction!

// Step 2: If over cap, reallocate excess
uint256 currentAllocation = earn.expectedSupplyAssets(IERC4626(riskyStrategy));
if (currentAllocation > newLowerCap) {
    // reallocate takes MarketAllocation[] struct array
    // Set target allocation for risky strategy to the new cap
    MarketAllocation[] memory allocations = new MarketAllocation[](2);
    allocations[0] = MarketAllocation({
        id: IERC4626(riskyStrategy),
        assets: newLowerCap  // Target: reduce to new cap
    });
    allocations[1] = MarketAllocation({
        id: IERC4626(safeStrategy),
        assets: type(uint256).max  // Target: deposit all freed assets
    });

    earn.reallocate(allocations);
}
```

**Correct (emergency strategy removal):**

```solidity
// If a strategy is reverting/compromised:

// Step 1: Set cap to 0
earn.submitCap(IERC4626(brokenStrategy), 0);

// Step 2: Submit forced removal (starts timelock)
// Note: Takes IERC4626, not address
earn.submitMarketRemoval(IERC4626(brokenStrategy));

// Step 3: Wait for timelock

// Step 4: After timelock, update withdraw queue with new indexes
// updateWithdrawQueue takes uint256[] indexes to reorder/remove
// To remove an entry, omit its index from the array
// WARNING: Funds in removed strategy are considered lost!
uint256[] memory newIndexes = getQueueWithoutBrokenStrategy();
earn.updateWithdrawQueue(newIndexes);
```

**Correct (asset-denominated reallocation targets):**

Read each allocation with `earn.read.expectedSupplyAssets([strategy])`. This converts EulerEarn's tracked strategy shares to underlying assets; raw `balanceOf` values are shares and can include untracked donations. Read source `maxWithdraw(earnAddress)`, destination `maxDeposit(earnAddress)`, and destination `config().cap` at a consistent block.

<!-- checked-example: earn-targets -->
```typescript
export function reallocationTargets(
  desired: bigint,
  sourceAssets: bigint,
  sourceMaxWithdraw: bigint,
  targetAssets: bigint,
  targetCap: bigint,
  targetMaxDeposit: bigint,
) {
  const inputs = [desired, sourceAssets, sourceMaxWithdraw, targetAssets, targetCap, targetMaxDeposit];
  if (inputs.some(value => value < 0n)) throw new Error('Negative asset amount');
  const headroom = targetCap > targetAssets ? targetCap - targetAssets : 0n;
  const amount = [desired, sourceAssets, sourceMaxWithdraw, headroom, targetMaxDeposit]
    .reduce((a, b) => a < b ? a : b);
  return { amount, sourceTarget: sourceAssets - amount, targetTarget: targetAssets + amount };
}
```

Skip zero movements and identical source/destination strategies. Encode `[{ id: source, assets: sourceTarget }, { id: destination, assets: targetTarget }]`, then simulate immediately before submitting. Withdrawals must precede deposits; interest, rounding, liquidity, and cap changes can invalidate a previously calculated target. For a single-source move, `type(uint256).max` on the destination deposits the actual amount withdrawn; ensure its cap and liquidity constraints can accept it. APY values use 1e27 scaling (`formatUnits(supplyAPY, 25)` gives percent), and utilization needs a zero-total-assets guard before division.

Key considerations:
- Only allocators/curators/owner can reallocate
- Respect strategy liquidity when withdrawing
- Cap increases are timelocked; decreases are instant
- Monitor strategy APYs and adjust allocations
- Keep some allocation in liquid/idle vault for withdrawals

---

#### PublicAllocator: Permissionless Reallocation

PublicAllocator enables anyone to trigger reallocations on EulerEarn vaults within admin-configured flow caps. This allows third parties (bots, keepers, MEV searchers) to optimize allocations without requiring allocator permissions.

**Correct (admin configuring PublicAllocator):**

```solidity
import {IPublicAllocator, FlowCapsConfig, FlowCaps} from "euler-earn/interfaces/IPublicAllocator.sol";

IPublicAllocator publicAllocator = IPublicAllocator(publicAllocatorAddress);

// Only vault owner or PublicAllocator admin can configure
// Set admin for this vault (optional - owner can always configure)
publicAllocator.setAdmin(earnVault, adminAddress);

// Set fee for public reallocations (in wei, paid by caller)
publicAllocator.setFee(earnVault, 0.001 ether);

// Configure flow caps per strategy
// maxIn: max assets that can flow INTO this strategy via public reallocation
// maxOut: max assets that can flow OUT OF this strategy via public reallocation
FlowCapsConfig[] memory configs = new FlowCapsConfig[](2);

configs[0] = FlowCapsConfig({
    id: IERC4626(strategyA),
    caps: FlowCaps({
        maxIn: 100_000e6,   // Allow up to 100k USDC to flow in
        maxOut: 50_000e6    // Allow up to 50k USDC to flow out
    })
});

configs[1] = FlowCapsConfig({
    id: IERC4626(strategyB),
    caps: FlowCaps({
        maxIn: 200_000e6,
        maxOut: 100_000e6
    })
});

publicAllocator.setFlowCaps(earnVault, configs);
```

**Correct (public reallocation by anyone):**

```solidity
import {IPublicAllocator, Withdrawal} from "euler-earn/interfaces/IPublicAllocator.sol";

// Anyone can call reallocateTo if they pay the fee
// This moves assets FROM withdrawal strategies TO a supply strategy

// Step 1: Get the fee
uint256 fee = publicAllocator.fee(earnVault);

// Step 2: Prepare withdrawals (must be sorted by address, ascending)
// Withdrawal struct: { IERC4626 id; uint128 amount; }
Withdrawal[] memory withdrawals = new Withdrawal[](2);
withdrawals[0] = Withdrawal({
    id: IERC4626(lowYieldStrategy),
    amount: 10_000e6  // Withdraw 10k from this strategy
});
withdrawals[1] = Withdrawal({
    id: IERC4626(anotherLowYieldStrategy),
    amount: 5_000e6   // Withdraw 5k from this strategy
});

// IMPORTANT: Withdrawals must be sorted by address (ascending)
// and the supplyId cannot be in the withdrawals array

// Step 3: Execute reallocation (paying the fee)
publicAllocator.reallocateTo{value: fee}(
    earnVault,
    withdrawals,
    IERC4626(highYieldStrategy)  // Deposit all withdrawn assets here
);

// Flow caps are automatically updated:
// - Withdrawn strategies: maxIn increases, maxOut decreases
// - Supply strategy: maxIn decreases, maxOut increases
```

**Correct (TypeScript public reallocation):**

```typescript
import { encodeFunctionData, parseEther } from 'viem';

// Check flow caps before attempting reallocation
const [maxIn, maxOut] = await publicAllocator.read.flowCaps([
  earnVault,
  strategyAddress,
]);

console.log(`Strategy flow caps: maxIn=${maxIn}, maxOut=${maxOut}`);

// Get fee
const fee = await publicAllocator.read.fee([earnVault]);

// Prepare withdrawals (sorted by address!)
const withdrawals = [
  { id: lowYieldStrategy, amount: 10000n * 10n ** 6n },
].sort((a, b) => a.id.toLowerCase().localeCompare(b.id.toLowerCase()));

// Execute public reallocation
await publicAllocator.write.reallocateTo(
  [earnVault, withdrawals, highYieldStrategy],
  { value: fee }
);
```

**Correct (claiming accrued fees as admin):**

```solidity
// Check accrued fees
uint256 accrued = publicAllocator.accruedFee(earnVault);

// Transfer fees to recipient (only admin or vault owner)
publicAllocator.transferFee(earnVault, payable(feeRecipient));
```

**PublicAllocator Key Points:**

| Aspect | Details |
|--------|---------|
| Who can configure | Vault owner or designated admin |
| Who can reallocate | Anyone (permissionless) |
| Fee | Paid in ETH by caller, set per vault |
| Flow caps | Per-strategy limits on in/out flows |
| Sorting | Withdrawals must be sorted by address (ascending) |
| Restrictions | Cannot include supplyId in withdrawals; strategies must be enabled |

**Common Errors:**

```solidity
// IncorrectFee: msg.value doesn't match configured fee
// EmptyWithdrawals: No withdrawals provided
// MarketNotEnabled: Strategy not in earn vault
// InconsistentWithdrawals: Not sorted by address or duplicates
// DepositMarketInWithdrawals: supplyId appears in withdrawals
// MaxOutflowExceeded: Trying to withdraw more than maxOut
// MaxInflowExceeded: Trying to deposit more than maxIn
// NotEnoughSupply: Strategy doesn't have enough assets
```

See also: [Lens Contracts](https://github.com/euler-xyz/agent-skills/blob/main/skills/euler-data/rules/tools-lens.md) - EulerEarnVaultLens provides `getVaultInfoFull()` to query all strategies and their allocations.

Reference: [EulerEarn Roles](https://github.com/euler-xyz/euler-earn#roles), [PublicAllocator.sol](https://github.com/euler-xyz/euler-earn/blob/master/src/PublicAllocator.sol)

## References

- [https://docs.euler.finance](https://docs.euler.finance)
- [https://github.com/euler-xyz/euler-earn](https://github.com/euler-xyz/euler-earn)
