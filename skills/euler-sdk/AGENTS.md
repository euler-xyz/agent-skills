# Euler SDK Agent Skill

**Version 1.6.0**

Euler Labs

September 2026

> Generated from SKILL.md, metadata.json, and rules/. Edit those sources and run pnpm build.

Euler V2 SDK integration guide for building production UIs, automation scripts, and developer tooling on top of @eulerxyz/euler-v2-sdk.

## Table of Contents

- [SDK Foundations](#1-sdk-foundations)
  - [SDK Architecture and Service Boundaries](#sdk-architecture-sdk-architecture-and-service-boundaries)
  - [UI Data Layer with Fetch Options and Population](#sdk-ui-data-layer-ui-data-layer-with-fetch-options-and-population)
- [Execution Safety](#2-execution-safety)
  - [Transaction Planning and Execution](#sdk-execution-flow-transaction-planning-and-execution)
  - [Pre-Execution Simulation and Safety Gates](#sdk-simulation-safety-pre-execution-simulation-and-safety-gates)
- [Runtime Performance](#3-runtime-performance)
  - [Query Decoration and Caching with buildQuery](#sdk-caching-buildquery-query-decoration-and-caching-with-buildquery)
  - [Fallback Adapter for V3 / Onchain Routing](#sdk-fallback-adapter-fallback-adapter-for-v3--onchain-routing)
  - [Plugin Integration for Read and Write Preconditions](#sdk-plugins-plugin-integration-for-read-and-write-preconditions)
- [Integration Patterns](#4-integration-patterns)
  - [Cross-Protocol Position Migration](#sdk-migrations-cross-protocol-position-migration)
  - [Script and Tooling Workflows from SDK Examples](#sdk-scripts-script-and-tooling-workflows-from-sdk-examples)
  - [Swap Quotes and Swap-Driven Execution Flows](#sdk-swaps-swap-quotes-and-swap-driven-execution-flows)

## 1. SDK Foundations

**Impact: HIGH**

Core architecture, service selection, and fetch option strategy for correct SDK usage in UIs and tools.

### sdk-architecture SDK Architecture and Service Boundaries

**Impact: HIGH (Prevents incorrect service usage and missing data in app state)**

Initialize the SDK once, treat services as layered APIs, and pick the right service boundary for each task.

**Incorrect (using typed vault service when vault type is unknown):**

```typescript
// WRONG: Fails for non-EVault addresses
const vault = await sdk.eVaultService.fetchVault(chainId, maybeAnyVault);
```

**Correct (route by type with vaultMetaService):**

```typescript
const { result: vault, errors } = await sdk.vaultMetaService.fetchVault(chainId, maybeAnyVault, {
  populateMarketPrices: true,
  populateRewards: true,
  populateIntrinsicApy: true,
  populateLabels: true,
});

if (!vault) throw new Error(errors[0]?.message ?? "Vault could not be resolved");
```

**Correct build pattern (single composition root):**

<!-- checked-example: sdk-build -->
```typescript
import { buildEulerSDK } from "@eulerxyz/euler-v2-sdk";

// Set EULER_SDK_RPC_URL_<chainId> in the environment for on-chain reads.
const sdk = await buildEulerSDK({
  config: {
    v3ApiUrl: process.env.EULER_SDK_V3_API_URL,
    v3ApiKey: process.env.EULER_SDK_V3_API_KEY,
  },
});
```

Built-in scalar config resolves as `config` prop, explicit SDK option, `EULER_SDK_*` env var, then default. Use [packages/euler-v2-sdk/docs/config-through-env.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/config-through-env.md) when adding runtime config.

Use these default boundaries:

- `accountService`: account/sub-account portfolio state
- `vaultMetaService`: mixed/unknown vault types
- `walletService`: native/ERC20 wallet balances and direct/Permit2 allowance state
- `executionService`: transaction planning, approvals, batch encoding, execution, and post-state preview
- `swapService`: quotes and providers
- `rewardsService`: reward reads and provider-specific claim planning
- `reulLockService`: rEUL vesting lock reads and unlock transaction plans
- `safeAccountService`: Safe smart-account detection and signer configuration (threshold/owners) reads
- `eulerLabelsService`: normalized off-chain labels metadata; use exported helpers from `utils/eulerLabels` for product/vault flags, notices, and restrictions
- `oracleAdapterService`: Data V3 oracle adapter recognition and health assessments plus indexed router state; assessment maps use normalized adapter addresses

Most service `fetch*` methods return `{ result, errors }`; keep diagnostics with the fetched entity when rendering warnings or enforcing data-quality policy. `oracleAdapterService` returns assessments and routers directly, while `safeAccountService.fetchSafeAccount()` returns `SafeAccountInfo | null` directly.

Reference: [packages/euler-v2-sdk/docs/services.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/services.md), [packages/euler-v2-sdk/docs/config-through-env.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/config-through-env.md), [packages/euler-v2-sdk/docs/wallet-service.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/wallet-service.md), [packages/euler-v2-sdk/docs/reul-lock-service.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/reul-lock-service.md), [packages/euler-v2-sdk/docs/entity-diagnostics.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/entity-diagnostics.md), [docs/data-architecture.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/data-architecture.md), [src/sdk/buildSDK.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/sdk/buildSDK.ts)

### sdk-ui-data-layer UI Data Layer with Fetch Options and Population

**Impact: HIGH (Prevents undefined computed values and stale portfolio views)**

Explicitly set population flags based on what the screen needs. Computed metrics require populated dependencies.

**Incorrect (expecting computed USD/risk metrics without population):**

```typescript
const { result: account } = await sdk.accountService.fetchAccount(chainId, owner, {
  populateVaults: false,
});

console.log(account.getSubAccount(owner)?.netValueUsd); // undefined
```

**Correct (declare population requirements):**

```typescript
const { result: account, errors } = await sdk.accountService.fetchAccount(chainId, owner, {
  populateVaults: true,
  populateMarketPrices: true,
  populateUserRewards: true,
  vaultFetchOptions: {
    populateMarketPrices: true,
    populateCollaterals: true,
    populateStrategyVaults: true,
    populateRewards: true,
    populateIntrinsicApy: true,
    populateLabels: true,
  },
});
```

Use `populated` flags as a hard guard before rendering computed fields:

```typescript
if (!account) throw new Error(errors[0]?.message ?? 'Account unavailable');
if (!account.populated.marketPrices) return null;
if (!account.populated.vaults) return null;
```

Keep `errors` alongside the entity snapshot. Diagnostics are not entity state; use them for field-level badges, telemetry, and policy decisions.

APY/ROE values on SDK vault and portfolio entities are percentage points (`5` = `5%`). Raw reward campaign APRs are decimal fractions; convert them before adding them to vault APYs in custom UI code, or use the SDK's computed breakdown fields.

Vault rewards are exposed as a `VaultRewardInfo` whose `getTotalRewardsApr({ viewer })` / `getActiveCampaigns({ viewer })` apply Merkl-style whitelist/blacklist eligibility. The plain `totalRewardsApr` getter returns headline rewards without a viewer. Pass the connected address as `viewer` so gated campaigns don't inflate displayed APY; yield breakdowns also include `BORROW_COLLATERAL` and `LOOPING` reward campaigns.

The viewer-aware method names depend on the entity:

| Entity | Viewer-aware yield methods |
|--------|----------------------------|
| `Portfolio` | `getNetApy({ viewer })`, `getRoe({ viewer })`, `getNetApyBreakdown({ viewer })`, `getRoeBreakdown({ viewer })` |
| `PortfolioSavingsPosition` | `getApyBreakdown({ viewer })` |
| `PortfolioBorrowPosition` | `getApyBreakdown({ viewer })`, `getRoeBreakdown({ viewer })` |
| `SubAccount` | `getRoe({ viewer })` returns a structured ROE breakdown |

Portfolio's `netApy`, `roe`, `apyBreakdown`, and `roeBreakdown` getters return the headline values without viewer filtering. Position breakdown getters follow the same headline convention.

**Correct (fetch viewer-aware portfolio and position yields):**

<!-- checked-example: sdk-portfolio-yields -->
```typescript
import type { EulerSDK } from '@eulerxyz/euler-v2-sdk';
import type { Address } from 'viem';

export async function fetchViewerYields(
  sdk: EulerSDK,
  chainId: number,
  owner: Address,
  viewer: Address,
) {
  const { result: portfolio, errors } = await sdk.portfolioService.fetchPortfolio(chainId, owner);
  if (!portfolio) throw new Error(errors[0]?.message ?? 'Portfolio unavailable');

  return {
    errors,
    netApy: portfolio.getNetApy({ viewer }),
    roe: portfolio.getRoe({ viewer }),
    apyBreakdown: portfolio.getNetApyBreakdown({ viewer }),
    roeBreakdown: portfolio.getRoeBreakdown({ viewer }),
    savings: portfolio.savings.map(position => position.getApyBreakdown({ viewer })),
    borrows: portfolio.borrows.map(position => ({
      apyBreakdown: position.getApyBreakdown({ viewer }),
      roeBreakdown: position.getRoeBreakdown({ viewer }),
    })),
  };
}
```

USD market price and value fields (`marketPriceUsd`, `suppliedValueUsd`, `borrowedValueUsd`, `totalRewardsValueUsd`, portfolio USD totals) are plain `number` values. Direct oracle/risk fields such as `oraclePriceRaw`, `assetRiskPrice`, `healthFactor`, and LTV ratios remain `bigint`.

#### Portfolio Views and Prices

For position-first UIs (savings/borrows lists, net-worth headers), use
`portfolioService` instead of hand-rolling over sub-accounts. `fetchPortfolio(chainId, owner)`
fetches the backing account with `populateAll: true` and returns a diagnostics envelope
`{ result: portfolio, errors }`; `buildPortfolio(account)` directly wraps an already-populated account. It exposes `.savings`,
`.borrows`, and computed totals (`netAssetValueUsd`, `netApy`, `roe`,
`totalRewardsValueUsd`), plus `positionFilter` and `getNextSubAccount(...)`. Use
`Account` for contract-shaped data; use `Portfolio` for the opinionated view. The
portfolio holds an account reference, so re-populating the account updates its reads.

For prices, prefer the `populateMarketPrices` fetch option to auto-populate
`marketPriceUsd` on entities. Reach for `priceService` directly only for on-demand
lookups (`fetchAssetUsdPrice`, `fetchAssetUsdPriceByAddress`, `fetchCollateralUsdPrice`;
V3 with on-chain oracle fallback). `marketPriceUsd` is **display-only** — for risk
math use oracle risk prices (`assetRiskPrice`, `getCollateralRiskPrice`), which can
intentionally differ from market prices.

For React UIs:

1. Build SDK in a provider/context once.
2. Use query hooks per feature (`vault list`, `vault detail`, `account`, `rewards`).
3. Use short UI stale times and let `buildQuery` handle deeper caching.
4. Re-fetch account/vault data after successful execution receipts.
5. For batch vault calls, handle sparse arrays (`undefined` entries) and map diagnostics by `locations[].owner` to show per-address failures.

Reference: [packages/euler-v2-sdk/docs/basic-usage.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/basic-usage.md), [docs/cross-service-data-population.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/cross-service-data-population.md), [docs/account-computed-properties.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/account-computed-properties.md), [docs/portfolio.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/portfolio.md), [docs/pricing-system.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/pricing-system.md), [docs/entity-diagnostics.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/entity-diagnostics.md), [examples/react-sdk-example/src/queries/sdkQueries.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/react-sdk-example/src/queries/sdkQueries.ts)


## 2. Execution Safety

**Impact: CRITICAL**

Transaction planning, approval handling, simulation, and execution flows that reduce user-facing failures.

### sdk-execution-flow Transaction Planning and Execution

**Impact: CRITICAL (Keep approvals, plugins, simulation and dispatched requests consistent)**

Use `executionService.planX` for user intents. Planners carry approval requirements and account context. Raw `encodeX` helpers only encode calls. Fetch the account entity before planning; an owner address alone is not a planner account.

**Correct (prepare, simulate, execute a scripted deposit):**

<!-- checked-example: sdk-execution -->
```typescript
import type {
  EulerSDK,
  PlanDepositArgs,
  ExecutePreparedTransactionPlanArgs,
} from "@eulerxyz/euler-v2-sdk";

export async function deposit(
  sdk: EulerSDK,
  chainId: number,
  args: PlanDepositArgs,
  wallet: Pick<ExecutePreparedTransactionPlanArgs, "sendTransaction" | "signTypedData">,
) {
  const plan = sdk.executionService.planDeposit(args);
  const prepared = await sdk.executionService.prepareTransactionPlan({
    plan, chainId, account: args.account,
    usePermit2: true,
    unlimitedApproval: false,
  });
  const simulation = await sdk.executionService.simulatePreparedTransactionPlan(prepared);
  if (!simulation.canExecute) throw new Error("Deposit simulation failed");
  return sdk.executionService.executePreparedTransactionPlan({ prepared, ...wallet });
}
```

Preparation runs plugins and resolves approval requirements once. Prepared simulation/execution reuse that plan, but execution still composes live Permit2 details. Surface executor progress, check terminal receipt status, and refresh account/vault queries after confirmed execution.

For an application that commits the user to exact reviewed wallet requests, use the SDK 3.4.0 materialized path:

1. Prepare and simulate the plan.
2. Resolve the live EVC address and each Permit2 nonce/deadline/expiration, then call `materializeExecution({ prepared, inputs })`.
3. Bind the accepted review to both request templates and signature slots/typed-data hashes.
4. Use `executeMaterialized` to sign and dispatch that accepted materialization. `finalizeMaterializedExecution` supports explicit signature insertion and Safe calls.
5. Rebuild and obtain a fresh review if any covered intent, account, chain, quote, deadline, or materialization input changes.

The SDK does not authenticate an application's review digest. Persist/reconcile ambiguous dispatch outcomes before retrying; an unknown receipt is not a failed transaction.

Use `rewardsService.buildClaimPlan(s)` for reward-provider plans. Some plans include direct `contractCall` items; they cannot all be treated as EVC batches. A simulation that rejects an unsupported direct call must not be replaced by a success result for only part of the plan.

CoW planners produce asynchronous order plans. Use `executeCowSwapTransactionPlan`, then track order UIDs with `fetchCowSwapOrderStatus` or `pollCowSwapOrderStatus`. CoW plans are unsupported by EVC plan simulation, prepared-plan APIs, `mergePlans`, and `describeBatch`.

Borrow planners prepend cleanup unless `skipCleanup` is set. Inspect that behavior when reusing an account. Full-repay `cleanupOnMax` can disable collaterals and sweep EVK shares; it does not sweep non-EVK collateral tokens. Keep named operation groups intact when combining or previewing plans.

Reference: [Execution and materialized review](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/execution-service.md), [CoW swaps](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/cow-swaps.md)

### sdk-simulation-safety Pre-Execution Simulation and Safety Gates

**Impact: CRITICAL (Catches failing routes and unhealthy positions before users sign)**

Simulate any non-trivial plan before execution, especially swaps, leverage, debt migration, and liquidation paths.

**Correct simulation flow:**

<!-- checked-example: sdk-simulation -->
```typescript
import type { EulerSDK, TransactionPlan } from '@eulerxyz/euler-v2-sdk';
import type { Address } from 'viem';

export async function simulate(sdk: EulerSDK, chainId: number, ownerOrAccount: Address, plan: TransactionPlan) {
const result = await sdk.executionService.simulateTransactionPlan(
  chainId,
  ownerOrAccount,
  plan,
  {
    stateOverrides: true,
    accountFetchOptions: {
      populateVaults: true,
      populateMarketPrices: true,
      populateUserRewards: true,
      vaultFetchOptions: {
        populateMarketPrices: true,
        populateRewards: true,
        populateIntrinsicApy: true,
      },
    },
  },
);

if (!result.canExecute) {
  throw new Error("Simulation failed safety checks");
}
return result;
}
```

Simulation and gas estimation use the same plugin processing path as execution. Their account argument is `AddressOrAccount` (`Address | Account`), so passing an already-fetched account can avoid duplicate plugin account fetches.

Gate execution on:

- `result.canExecute`
- `result.failedBatchItems`
- `result.accountStatusErrors` and `result.vaultStatusErrors`
- insufficiency fields (`insufficientWalletAssets`, allowances)

If simulation fails, decode and surface actionable messages rather than raw revert bytes.

For UI fan-outs that simulate N candidate plans per user action (swap-quote sweeps, leverage explorers), avoid blowing up RPC + Hermes traffic:

- Pass `stateOverrideOptions` (`SimulationStateOverrideOptions`) to skip overrides the form already validated: `noBalanceOverride: true` when the form gates submit on wallet balance, `wallet.balances`/`wallet.allowances` from the snapshot the form already holds, and `slotHints` pre-fetched once per token with `fetchErc20SlotHints(provider, token, { allowanceSpender })`.
- Fetch plugin data with `executionService.prefetchPluginDataForPlan(plan, account, chainId)` and pass `prefetch` into `prepareTransactionPlan`. Pass the returned prepared plan to `simulatePreparedTransactionPlan`, `estimateGasForPreparedTransactionPlan`, and `executePreparedTransactionPlan`. These downstream APIs reuse the prepared plan without rerunning plugins and do not accept a `prefetch` option.

**Correct (prefetch during preparation and reuse the prepared plan):**

<!-- checked-example: sdk-prepared-prefetch -->
```typescript
import type {
  AddressOrAccount,
  EulerSDK,
  ExecutePreparedTransactionPlanArgs,
  TransactionPlan,
} from '@eulerxyz/euler-v2-sdk';

export async function executeWithPrefetch(
  sdk: EulerSDK,
  chainId: number,
  account: AddressOrAccount,
  plan: TransactionPlan,
  wallet: Pick<ExecutePreparedTransactionPlanArgs, 'sendTransaction' | 'signTypedData'>,
) {
  const prefetch = await sdk.executionService.prefetchPluginDataForPlan(plan, account, chainId);
  const prepared = await sdk.executionService.prepareTransactionPlan({
    plan, chainId, account, prefetch,
    usePermit2: true,
    unlimitedApproval: false,
  });
  const simulation = await sdk.executionService.simulatePreparedTransactionPlan(prepared);
  if (!simulation.canExecute) throw new Error('Prepared plan simulation failed');
  const estimatedGas = await sdk.executionService.estimateGasForPreparedTransactionPlan(prepared);
  const execution = await sdk.executionService.executePreparedTransactionPlan({ prepared, ...wallet });
  return { estimatedGas, execution };
}
```

The unprepared `simulateTransactionPlan` and `estimateGasForTransactionPlan` APIs accept `prefetch` in their options because they run plugin processing themselves. Without explicit `prefetch`, preparation resolves plugin data through the normal plugin path. Reuse shared data across candidate preparations only when it covers their chain, account, and plugin requirements; refresh and prepare again when those inputs change or oracle updates expire. Applications with an accepted transaction review should follow the materialized execution flow in the execution rule.

Reference: [packages/euler-v2-sdk/docs/simulations-and-state-overrides.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/simulations-and-state-overrides.md), [docs/execution-service.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/execution-service.md), [docs/decode-smart-contract-errors.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/decode-smart-contract-errors.md), [examples/simulations/simulate-deposit-example.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/simulations/simulate-deposit-example.ts)


## 3. Runtime Performance

**Impact: HIGH**

Query decoration, caching policy, and plugin-based preconditions for performant and correct reads/writes.

### sdk-caching-buildquery Query Decoration and Caching with buildQuery

**Impact: HIGH (Reduces RPC/API load and stabilizes UI latency)**

Wrap SDK `query*` methods through `buildQuery` instead of adding ad-hoc caches around service calls.
When adding a new RPC/API dependency, expose it as a `query*` method on the adapter or service rather than calling it directly from orchestration code.

**Correct pattern:**

<!-- checked-example: sdk-cache -->
```typescript
import { QueryClient } from "@tanstack/query-core";
import { serializeQueryArgs, type BuildQueryFn } from "@eulerxyz/euler-v2-sdk";

const queryClient = new QueryClient();

export const buildQuery: BuildQueryFn = (queryName, fn, _target, context) => {
  const staleTime = queryName.startsWith("querySwap") ? 10_000 : 60_000;
  return ((...args: unknown[]) => {
    const cacheKey = context
      ? context.getCacheKey(args)
      : serializeQueryArgs(args);
    if (cacheKey === null) return fn(...args);

    return queryClient.fetchQuery({
      queryKey: ["sdk", queryName, cacheKey],
      queryFn: () => fn(...args),
      staleTime,
    });
  }) as typeof fn;
};
```

Treat `context.getCacheKey(args) === null` as an explicit no-cache signal and
call the underlying fetcher directly. Do not replace it with a generic key;
cursor-based pagination uses this contract to avoid retaining every page.

Recommended stale-time strategy:

- hours (e.g. 12-24h): deployments, ABI, token list, static labels
- minutes: perspectives, providers, reward campaign catalogs
- minutes: external intrinsic APY queries such as `queryV3IntrinsicApy`
- minutes: oracle assessment queries such as `queryV3OracleAdapterAssessment` and `queryV3OracleAdapterAssessmentsPage`
- 10-30s: vault/account/wallet state
- ~5s: transaction-sensitive wallet reads such as `queryNativeBalance`, `queryTokenBalances`, `queryAllowance`, and `queryPermit2Allowance`
- ~10s: swap quotes and Pyth update payloads

This keeps service-level `fetch*` orchestration cheap because underlying `query*` calls are cached.
By default, `buildEulerSDK` applies a 5s in-memory cache to decorated `query*` methods. Supplying a custom `buildQuery` replaces that default cache layer, so include caching/deduping there if the app needs it.

Reference: [packages/euler-v2-sdk/docs/caching-external-data-queries.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/caching-external-data-queries.md), [examples/react-sdk-example/src/queries/sdkQueries.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/react-sdk-example/src/queries/sdkQueries.ts)

### sdk-fallback-adapter Fallback Adapter for V3 / Onchain Routing

**Impact: HIGH (Prevents over-eager fallbacks, lost fast-path latency, and silent data loss)**

`buildEulerSDK` supports fallback adapters for account, vault, vault-type, and reward reads (V3 → onchain / subgraph / direct), selected according to configuration and available endpoints. Configure them explicitly and read telemetry through `onFallback` rather than guessing why a call fell back from `primaryIssues` alone.

**Incorrect (over-eager fallback inferred from any SOURCE_UNAVAILABLE):**

```typescript
// WRONG: Treats per-collateral oracle warnings as a fallback trigger.
const wrapped = createFallbackAdapter(primary, secondary, {
  methods: ["fetchVaults"],
  adapterNames: { primary: "v3", secondary: "onchain" },
  shouldFallback: (r) => r.errors.some((e) => e.code === "SOURCE_UNAVAILABLE"),
});
```

Per-entity warnings on a fully-populated response should not trigger fallback — the secondary cannot recover information the primary already returned, and re-fetching only doubles latency.

**Correct (rely on the default trigger logic):**

```typescript
const wrapped = createFallbackAdapter(primary, secondary, {
  methods: ["fetchVaults"],
  adapterNames: { primary: "v3", secondary: "onchain" },
});
// Default falls back ONLY when:
// - primary throws,
// - ServiceResult.result is undefined, or
// - result is an array containing at least one undefined slot.
```

**Correct (route by service-level config in buildEulerSDK):**

```typescript
const sdk = await buildEulerSDK({
  config: {
    v3ApiUrl: process.env.EULER_SDK_V3_API_URL,
    v3ApiKey: process.env.EULER_SDK_V3_API_KEY,
    eVaultServiceAdapter: "fallback",     // default when both adapters are buildable
    accountServiceAdapter: "v3",          // pin to V3 only
    rewardsServiceAdapter: "direct",      // pin to direct (no V3 calls)
    disableV3: process.env.ENV === "ci",  // global kill switch for V3 across all chains
  },
});
```

`disableV3: true` collapses every `"fallback"` selection to its non-V3 alternative. When a required V3 endpoint is absent, a fallback selection uses the configured secondary and logs a warning. Construction can still fail if neither required source can be built; an explicit `"v3"` selection also requires a configured V3 endpoint. A missing API key alone does not disable a configured endpoint.

**Correct (observe fallback events via telemetry):**

```typescript
import { buildEulerSDK, type FallbackInfo } from "@eulerxyz/euler-v2-sdk";

const sdk = await buildEulerSDK({
  onFallback: (info: FallbackInfo) => {
    // info.trigger distinguishes the real cause:
    //   "primary-threw" | "result-undefined" | "array-missing-slots"
    //   | "custom-shouldFallback" | "circuit-open"
    // info.missingIndices is populated for "array-missing-slots".
    metrics.increment("sdk.fallback", {
      method: info.method,
      adapter: info.primaryName,
      trigger: info.trigger,
    });
  },
});
```

Use `info.trigger` for routing logic; treat `info.primaryIssues` as context only. Per-entity warnings appear in `primaryIssues` whenever the primary returned a `ServiceResult`, but they never by themselves cause the fallback — the actual cause is whatever `trigger` says.

**Correct (custom fallback for a non-built-in adapter):**

```typescript
import { createFallbackAdapter } from "@eulerxyz/euler-v2-sdk";

const wrapped = createFallbackAdapter<MyAdapter, "fetchThings">(primary, secondary, {
  methods: ["fetchThings"],
  adapterNames: { primary: "v3", secondary: "onchain" },
  // Trip the circuit after 3 consecutive primary failures, skip primary for 30s.
  circuitBreaker: { failures: 3, cooldownMs: 30_000 },
  onFallback: (info) => console.log("fallback", info.method, info.trigger),
});
```

Only methods listed in `methods` are wrapped; setters and other state (`setConfig`, `setPlugins`, internal caches) pass through to the primary unchanged. Methods that return a plain `Promise` (not a `ServiceResult`) fall back only on throw.

Diagnostics on the returned secondary `ServiceResult` are prefixed with a `FALLBACK_USED` issue (`severity: "info"`, `source: "<primary>"`, `originalValue` carries the primary error or its `errors[]`). UIs that surface diagnostics already pick this up; routing decisions should still come from `onFallback`'s `trigger`, not from scraping the `errors` array.

See [packages/euler-v2-sdk/docs/fallback-system.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/fallback-system.md) for the full reference, [packages/euler-v2-sdk/docs/entity-diagnostics.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/entity-diagnostics.md) for `DataIssue` shape, and [packages/euler-v2-sdk/test/fallbackAdapter.test.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/test/fallbackAdapter.test.ts) for the trigger-by-trigger test matrix.

### sdk-plugins Plugin Integration for Read and Write Preconditions

**Impact: HIGH (Prevents stale-oracle and credential-gating failures)**

Use plugins whenever vault interactions require preconditions that are not part of core calls.

**Correct initialization with plugin support:**

<!-- checked-example: sdk-plugins -->
```typescript
import { buildEulerSDK, createPythPlugin, createKeyringPlugin } from "@eulerxyz/euler-v2-sdk";

export async function buildWithPlugins(keyring: Parameters<typeof createKeyringPlugin>[0]) {
return buildEulerSDK({
  plugins: [
    createPythPlugin(),
    createKeyringPlugin(keyring),
  ],
});
}
```

Plugin behavior:

- `getReadPrepend`: prepends calls before lens reads (`batchSimulation` path)
- `processPlan`: transforms plans before `simulateTransactionPlan`, `estimateGasForTransactionPlan`, and `executeTransactionPlan`

Guidelines:

1. Keep plugin list deterministic and ordered.
2. Use same `buildQuery` wrapper for plugin queries where possible.
3. For plan previews, call `sdk.executionService.simulateTransactionPlan(...)` or `estimateGasForTransactionPlan(...)`; these apply the same plugin pipeline as execution.
4. Treat the execution account argument as `AddressOrAccount` (`Address | Account`). Passing an `Account` lets plugins reuse account state; passing an address lets plugins fetch minimal data.

Implementation notes:

- `EulerPlugin.processPlan(plan, account, chainId, sdk)` receives the full SDK instance.
- Pyth write processing uses the generic `calculateHealthCheckSets(plan, account)` utility, which requires a vault-populated `Account` and returns per-batch controller/collateral sets.
- Keyring reuses target vaults already present on a passed `Account` and fetches any missing targets; passing an address fetches all target vaults.

Reference: [packages/euler-v2-sdk/docs/plugins.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/plugins.md), [src/plugins/pyth/pythPlugin.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/plugins/pyth/pythPlugin.ts), [src/plugins/keyring/keyringPlugin.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/plugins/keyring/keyringPlugin.ts)


## 4. Integration Patterns

**Impact: HIGH**

Swap flows, cross-protocol position migration, and script templates for production integrations, bots, and operational tooling.

### sdk-migrations Cross-Protocol Position Migration

**Impact: MEDIUM (Correct connector/direction usage and authorization signing for position migrations)**

Use `positionMigrationService` to move a position between an external protocol
(Aave V3, Morpho Blue, MetaMorpho) and Euler in one EVC batch, without closing
the user's borrow. (Same-asset, intra-Euler migration is instead
`executionService.planMigrateSameAssetCollateral` / `planMigrateSameAssetDebt`.)

Flow:

1. Read the source position: `getPosition({ connectorId, chainId, owner, positionRef })`
   (`listPositions` / `listTargets` for discovery).
2. Resolve the authorization: `getAuthorization({ direction, connectorId, owner, position, target | source, deadline })`.
   Typed-data requests may be `undefined` when already authorized — guard for
   that, otherwise sign `request.typedData` and pass `{ request, signature }` as
   `authorization`.
   For wallets that cannot sign, request the transaction form instead (rule 5).
3. Build and execute: `planMigration({ ...args, authorization })` → `TransactionPlan`
   → `executionService.executeTransactionPlan(...)`.

Rules:

1. `direction` is `"external-to-euler"` (supply an `EulerMigrationTarget`) or
   `"euler-to-external"` (supply an `EulerMigrationSource`, optionally
   `ExternalMigrationTarget`). Connector `id`s: `aave`, `morpho`, `metamorpho`.
2. MetaMorpho is supply-only and inbound only; Aave/Morpho outbound flows reject
   swap quotes. Only enabled `connectorId:direction` pairs work — a disabled pair
   throws "temporarily disabled".
3. Change collateral/debt assets on inbound migrations with `collateralSwapQuote`
   / `debtSwapQuote` from `swapService` (quotes must target the Euler Swapper);
   set `collateralSwapVerification: "deposit"` for ERC-4626/EulerEarn targets.
4. For a pre-trade dry run use `planMigrationSimulation(...)` → `{ plan,
   stateOverrides, previewPlan, authorizationRequest }`; simulate `plan` with
   `stateOverrides` (when a permit or transaction grant is required it is
   represented by a storage override, so no signature or mined grant is needed),
   then gate on
   `canExecute`. Pass `authorizationKind: "transaction"` to dry-run the
   contract-wallet flow; its grant remains outside `previewPlan` and the EVC
   batch.
5. Contract wallets cannot sign the typed-data form — Aave, Morpho, and
   MetaMorpho verify permits/delegations/authorizations without an ERC-1271
   fallback. Pass `authorizationKind: "transaction"` to `getAuthorization` for a
   `msg.sender` flow instead: `{ kind: "transaction", call?, revocation }`.
   When `call` is present, send it and **wait for it to be mined** before
   `planMigration` — the
   connectors read the live allowance to decide whether the batch still needs an
   authorization item, so a grant that has not landed yet makes the build throw
   "… is required". Then omit `authorization` and pass
   `removeAuthorizationAfterMigration: false` (its in-batch disable needs a
   signature), and send `revocation` only after the migration has a known
   terminal outcome or is known not to have been dispatched. If core dispatch or
   receipt status is unknown, persist the pending cleanup and reconcile the core
   transaction first because it may still need the authorization. Morpho omits
   `call` when authorization already stands but still returns the disable call
   as `revocation`. Use the owner-controlled wallet path for both calls, reject
   reverted cleanup receipts, and preserve migration and cleanup errors
   separately. The grant cannot be a batch item: the EVC forwards batch items as
   itself, so it would grant from the EVC.

Reference: [packages/euler-v2-sdk/docs/position-migration-service.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/position-migration-service.md),
[examples/execution/aave-to-euler-position-migration-example.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/execution/aave-to-euler-position-migration-example.ts),
[examples/execution/euler-to-morpho-position-migration-example.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/execution/euler-to-morpho-position-migration-example.ts)

### sdk-scripts Script and Tooling Workflows from SDK Examples

**Impact: MEDIUM (Speeds up reliable bot/script development with proven patterns)**

Use [packages/euler-v2-sdk/examples/](https://github.com/euler-xyz/euler-sdks/tree/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples) as canonical templates for script structure, then parameterize config/env.

Suggested workflow:

1. Start from nearest example (`deposit`, `repay-with-swap`, `swap-and-borrow-from-wallet`, `withdraw-and-swap`, `multiply-same-asset`, `liquidation`, etc.).
2. Move chain/account/vault constants into a shared `config.ts`, and put SDK runtime config behind `buildEulerSDK({ config })` or `EULER_SDK_*` env vars.
3. Use `sdk.executionService.executeTransactionPlan(...)` for plugin processing, approval resolution, Permit2, and EVC batch execution.
4. Add simulation gates before submission for bots. CoW plans are submitted to the CoW orderbook and cannot be simulated through SDK plan simulation; print `getCowSwapOrderExplorerUrl(orderUid)` and track them with `fetchCowSwapOrderStatus` / `pollCowSwapOrderStatus` after submission.
5. Run non-CoW flows against fork first (Anvil), then production RPC. CoW orderbook examples require live chain/RPC credentials.

**Correct starting points:**

- [packages/euler-v2-sdk/examples/execution/*.ts](https://github.com/euler-xyz/euler-sdks/tree/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/execution) for transaction flows
- [packages/euler-v2-sdk/examples/wallets/*.ts](https://github.com/euler-xyz/euler-sdks/tree/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/wallets) for wallet balance and allowance reads
- [packages/euler-v2-sdk/examples/simulations/*.ts](https://github.com/euler-xyz/euler-sdks/tree/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/simulations) for safety checks
- `sdk.executionService.executeTransactionPlan(...)` for plugin-aware execution plumbing
- [packages/euler-v2-sdk/examples/execution/open-position-with-cow-live-example.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/execution/open-position-with-cow-live-example.ts) for live CoW order submission with a real private key
- [packages/euler-v2-sdk/examples/run-examples.sh](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/run-examples.sh) for local fork regression pass

When building CLI tools, prefer idempotent commands and explicit chain/account flags.
Use `EULER_SDK_RPC_URL_<chainId>` for RPC URLs and `EULER_SDK_V3_API_KEY` for the shared V3 key in example `.env` files.

Reference: [packages/euler-v2-sdk/examples/](https://github.com/euler-xyz/euler-sdks/tree/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples), [packages/euler-v2-sdk/examples/run-examples.sh](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/run-examples.sh), [packages/euler-v2-sdk/docs/config-through-env.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/config-through-env.md), [packages/euler-v2-sdk/docs/cow-swaps.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/cow-swaps.md)

### sdk-swaps Swap Quotes and Swap-Driven Execution Flows

**Impact: HIGH (Avoids incorrect quote usage and repay/swap mismatches)**

Use `swapService` as the first step for any swap-driven action, then feed selected quotes into `executionService.plan*`.

**Correct flow:**

```typescript
import { SwapperMode } from "@eulerxyz/euler-v2-sdk";

const quotes = await sdk.swapService.fetchRepayQuotes({
  chainId,
  fromVault,
  fromAsset,
  fromAccount,
  liabilityVault,
  liabilityAsset,
  liabilityAmount,
  currentDebt,
  toAccount,
  origin,
  swapperMode: SwapperMode.TARGET_DEBT,
  slippage: 0.5,
});

const plan = sdk.executionService.planRepayWithSwap({
  account,
  swapQuote: quotes[0]!,
});
```

Rules:

1. Always re-quote close to execution time.
2. Use the planner that matches the quote verifier mode: `planSwapFromWallet` for `transferMin`, `planDepositWithSwapFromWallet` / `planSwapAndBorrowFromWallet` / `planSwapCollateral` for `skimMin`, and `planRepayWithSwap` / `planSwapDebt` / `planSwapAndRepayFromWallet` for `debtMax`.
3. For full debt repay, set `liabilityAmount` to `currentDebt` with `SwapperMode.TARGET_DEBT`.
4. For wallet-sourced repay, request the quote with a real `fromVault` and `fromAccount` as the router sweep context, then let `planSwapAndRepayFromWallet` pull the input token from the wallet. Use `BigInt(quote.amountIn)` for exact-input quotes and `BigInt(quote.amountInMax || quote.amountIn)` for target-debt quotes.
5. For CoW open-position, close-position, and collateral-swap routes, pass `cowSwap` into `fetchDepositQuote` / `fetchRepayQuotes`, then use `planOpenPositionWithCoW`, `planClosePositionWithCow`, or `planSwapCollateralWithCoW`. Execute the returned plan with `executeCowSwapTransactionPlan`; do not simulate or gas-estimate CoW plans. Track orders with `fetchCowSwapOrderStatus` / `pollCowSwapOrderStatus`; cancel open/collateral orders with `cancelCowSwapOrder` and close-position orders with `planCancelClosePositionWithCow`.
6. For same-asset debt migration, ensure the destination debt vault has positive-LTV collateral enabled on the account before executing the migration plan.
7. Validate quote-provider assumptions (quotes are best-first, but still simulate non-CoW plans).
8. Compare providers when building professional routing UIs.

Reference: [packages/euler-v2-sdk/docs/swaps.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/swaps.md), [packages/euler-v2-sdk/docs/cow-swaps.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/cow-swaps.md), [examples/execution/repay-with-swap-example.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/execution/repay-with-swap-example.ts), [examples/execution/swap-and-borrow-from-wallet-example.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/execution/swap-and-borrow-from-wallet-example.ts), [examples/execution/swap-and-repay-from-wallet-example.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/execution/swap-and-repay-from-wallet-example.ts), [examples/execution/withdraw-and-swap-example.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/execution/withdraw-and-swap-example.ts), [examples/execution/redeem-and-swap-example.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/execution/redeem-and-swap-example.ts), [examples/execution/open-position-with-cow-live-example.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/examples/execution/open-position-with-cow-live-example.ts)

## References

- [https://github.com/euler-xyz/euler-sdks](https://github.com/euler-xyz/euler-sdks)
- [https://docs.euler.finance](https://docs.euler.finance)
