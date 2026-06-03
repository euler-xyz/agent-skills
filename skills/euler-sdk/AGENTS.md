# Euler SDK Agent Skill

**Version 1.2.1**  
Euler Labs  
June 2026

> **Note:**  
> This document is for agents and LLMs to follow when integrating with  
> the Euler V2 SDK. It covers service boundaries, entity population,  
> transaction planning, approvals, simulation, caching, plugins, fallbacks,  
> swap flows, and scripts.

---

## Abstract

Euler V2 SDK integration guide for building production UIs, automation scripts, and developer tooling on top of euler-v2-sdk.

---

## Table of Contents

1. [SDK Foundations](#1-sdk-foundations) — **HIGH**
   - 1.1 [Fallback Adapter for V3 / Onchain Routing](#11-fallback-adapter-for-v3--onchain-routing)
   - 1.2 [Plugin Integration for Read and Write Preconditions](#12-plugin-integration-for-read-and-write-preconditions)
   - 1.3 [Pre-Execution Simulation and Safety Gates](#13-pre-execution-simulation-and-safety-gates)
   - 1.4 [Query Decoration and Caching with buildQuery](#14-query-decoration-and-caching-with-buildquery)
   - 1.5 [Script and Tooling Workflows from SDK Examples](#15-script-and-tooling-workflows-from-sdk-examples)
   - 1.6 [SDK Architecture and Service Boundaries](#16-sdk-architecture-and-service-boundaries)
   - 1.7 [Swap Quotes and Swap-Driven Execution Flows](#17-swap-quotes-and-swap-driven-execution-flows)
   - 1.8 [Transaction Planning, Approvals, and EVC Batch Execution](#18-transaction-planning-approvals-and-evc-batch-execution)
   - 1.9 [UI Data Layer with Fetch Options and Population](#19-ui-data-layer-with-fetch-options-and-population)

---

## 1. SDK Foundations

**Impact: HIGH**

Core architecture, service selection, and fetch option strategy for correct SDK usage in UIs and tools.

### 1.1 Fallback Adapter for V3 / Onchain Routing

**Impact: HIGH (Prevents over-eager fallbacks, lost fast-path latency, and silent data loss)**

`buildEulerSDK` wraps `accountService`, `eVaultService`, `eulerEarnService`, `vaultMetaService`, and `rewardsService` in fallback adapters (V3 → onchain / subgraph / direct). Configure them explicitly and read telemetry through `onFallback` rather than guessing why a call fell back from `primaryIssues` alone.

**Incorrect: over-eager fallback inferred from any SOURCE_UNAVAILABLE**

```typescript
// WRONG: Treats per-collateral oracle warnings as a fallback trigger.
const wrapped = createFallbackAdapter(primary, secondary, {
  methods: ["fetchVaults"],
  adapterNames: { primary: "v3", secondary: "onchain" },
  shouldFallback: (r) => r.errors.some((e) => e.code === "SOURCE_UNAVAILABLE"),
});
```

Per-entity warnings on a fully-populated response should not trigger fallback — the secondary cannot recover information the primary already returned, and re-fetching only doubles latency.

**Correct: rely on the default trigger logic**

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

**Correct: route by service-level config in buildEulerSDK**

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

`disableV3: true` collapses every `"fallback"` selection to its non-V3 alternative. If V3 credentials are simply missing, fallback chains auto-collapse to the secondary with a one-line warning during construction — never throw.

**Correct: observe fallback events via telemetry**

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

**Correct: custom fallback for a non-built-in adapter**

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

See [`packages/euler-v2-sdk/docs/fallback-system.md`](../../../packages/euler-v2-sdk/docs/fallback-system.md) for the full reference, [`packages/euler-v2-sdk/docs/entity-diagnostics.md`](../../../packages/euler-v2-sdk/docs/entity-diagnostics.md) for `DataIssue` shape, and `packages/euler-v2-sdk/test/fallbackAdapter.test.ts` for the trigger-by-trigger test matrix.

### 1.2 Plugin Integration for Read and Write Preconditions

**Impact: HIGH (Prevents stale-oracle and credential-gating failures)**

Use plugins whenever vault interactions require preconditions that are not part of core calls.

**Correct initialization with plugin support:**

```typescript
import { buildEulerSDK, createPythPlugin, createKeyringPlugin } from "euler-v2-sdk";

const sdk = await buildEulerSDK({
  plugins: [
    createPythPlugin(),
    createKeyringPlugin({
      hookTargets,
      getCredentialData: async (args) => fetchCredential(args),
    }),
  ],
});
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

- Pyth write processing uses the generic `calculateHealthCheckSets(plan, account)` utility, which requires a vault-populated `Account` and returns per-batch controller/collateral sets. Feed collection is route-step based: use `debtPricingOracleRoute` and `collaterals[].oracleRoute`, not removed `debtPricingOracleAdapters` / `collateral.oracleAdapters` projections.

- Keyring uses vaults already present on a passed `Account`; it fetches target vaults only when the account argument is an address.

### 1.3 Pre-Execution Simulation and Safety Gates

**Impact: CRITICAL (Catches failing routes and unhealthy positions before users sign)**

Simulate any non-trivial plan before execution, especially swaps, leverage, debt migration, and liquidation paths.

**Correct simulation flow:**

```typescript
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

- Compute `prefetch` once per sweep with `executionService.prefetchPluginDataForPlan(plan, account, chainId)` and thread it through every `prepareTransactionPlan` / `simulatePreparedTransactionPlan` / `estimateGasForPreparedTransactionPlan` / `executePreparedTransactionPlan` call. The Pyth / Keyring plugin work happens once instead of N times.

These options are additive and degrade gracefully — omit them and the SDK falls back to full derivation + per-call plugin fetch.

### 1.4 Query Decoration and Caching with buildQuery

**Impact: HIGH (Reduces RPC/API load and stabilizes UI latency)**

Wrap SDK `query*` methods through `buildQuery` instead of adding ad-hoc caches around service calls.

When adding a new RPC/API dependency, expose it as a `query*` method on the adapter or service rather than calling it directly from orchestration code.

**Correct pattern:**

```typescript
import { QueryClient } from "@tanstack/react-query";
import type { BuildQueryFn } from "euler-v2-sdk";

const queryClient = new QueryClient();

const buildQuery: BuildQueryFn = (queryName, fn, _target) => {
  const staleTime = queryName.startsWith("querySwap") ? 10_000 : 60_000;
  return ((...args: unknown[]) =>
    queryClient.fetchQuery({
      queryKey: ["sdk", queryName, ...args],
      queryFn: () => fn(...args),
      staleTime,
    })) as typeof fn;
};
```

Recommended stale-time strategy:

- hours (e.g. 12-24h): deployments, ABI, token list, static labels

- minutes: perspectives, providers, reward campaign catalogs

- minutes: external intrinsic APY queries such as `queryV3IntrinsicApy`

- 10-30s: vault/account/wallet state

- ~5s: transaction-sensitive wallet reads such as `queryNativeBalance`, `queryTokenBalances`, `queryAllowance`, and `queryPermit2Allowance`

- ~10s: swap quotes and Pyth update payloads

- minutes: Fuul totals / claim checks / claimable rewards for reward claim UIs

This keeps service-level `fetch*` orchestration cheap because underlying `query*` calls are cached.

By default, `buildEulerSDK` applies a 5s in-memory cache to decorated `query*` methods. Supplying a custom `buildQuery` replaces that default cache layer, so include caching/deduping there if the app needs it.

Oracle route ABI decoding is memoized inside the SDK; avoid adding app-level caches around pure oracle-route helpers unless profiling shows a real UI bottleneck.

### 1.5 Script and Tooling Workflows from SDK Examples

**Impact: MEDIUM (Speeds up reliable bot/script development with proven patterns)**

Use `packages/euler-v2-sdk/examples/` as canonical templates for script structure, then parameterize config/env.

Suggested workflow:

1. Start from nearest example (`deposit`, `repay-with-swap`, `swap-and-borrow-from-wallet`, `withdraw-and-swap`, `multiply-same-asset`, `liquidation`, etc.).

2. Move chain/account/vault constants into a shared `config.ts`, and put SDK runtime config behind `buildEulerSDK({ config })` or `EULER_SDK_*` env vars.

3. Use `sdk.executionService.executeTransactionPlan(...)` for plugin processing, approval resolution, Permit2, and EVC batch execution.

4. Add simulation gates before submission for bots. CoW plans are submitted to the CoW orderbook and cannot be simulated through SDK plan simulation; print `getCowSwapOrderExplorerUrl(orderUid)` and track them with `fetchCowSwapOrderStatus` / `pollCowSwapOrderStatus` after submission.

5. Run non-CoW flows against fork first (Anvil), then production RPC. CoW orderbook examples require live chain/RPC credentials.

**Correct starting points:**

- `packages/euler-v2-sdk/examples/execution/*.ts` for transaction flows

- `packages/euler-v2-sdk/examples/wallets/*.ts` for wallet balance and allowance reads

- `packages/euler-v2-sdk/examples/simulations/*.ts` for safety checks

- `sdk.executionService.executeTransactionPlan(...)` for plugin-aware execution plumbing

- `packages/euler-v2-sdk/examples/execution/open-position-with-cow-live-example.ts` for live CoW order submission with a real private key

- `packages/euler-v2-sdk/examples/run-examples.sh` for local fork regression pass

When building CLI tools, prefer idempotent commands and explicit chain/account flags.

Use `EULER_SDK_RPC_URL_<chainId>` for RPC URLs and `EULER_SDK_V3_API_KEY` for the shared V3 key in example `.env` files.

**Correct:**

```typescript
import { buildEulerSDK, type Address } from "@eulerxyz/euler-v2-sdk";

const sdk = await buildEulerSDK({
  config: {
    rpcUrls: { [chainId]: process.env[`EULER_SDK_RPC_URL_${chainId}`] },
    v3ApiKey: process.env.EULER_SDK_V3_API_KEY,
  },
});

const { result: account } = await sdk.accountService.fetchAccount({
  chainId,
  account: owner as Address,
  populateVaults: true,
  populateMarketPrices: true,
});

const plan = await sdk.executionService.planDeposit({
  chainId,
  account,
  vault: vault as Address,
  amount,
});

const simulation = await sdk.executionService.simulateTransactionPlan({
  chainId,
  account,
  plan,
});

if (!simulation.canExecute) {
  throw new Error("Deposit plan failed simulation");
}

await sdk.executionService.executeTransactionPlan({
  chainId,
  account,
  plan,
});
```

### 1.6 SDK Architecture and Service Boundaries

**Impact: HIGH (Prevents incorrect service usage and missing data in app state)**

Initialize the SDK once, treat services as layered APIs, and pick the right service boundary for each task.

The package is now published as stable `euler-v2-sdk` 1.0.0; prefer the current package docs and examples over older beta-era assumptions.

**Incorrect: using typed vault service when vault type is unknown**

```typescript
// WRONG: Fails for non-EVault addresses
const vault = await sdk.eVaultService.fetchVault(chainId, maybeAnyVault);
```

**Correct: route by type with vaultMetaService**

```typescript
const { result: vault, errors } = await sdk.vaultMetaService.fetchVault(chainId, maybeAnyVault, {
  populateMarketPrices: true,
  populateRewards: true,
  populateIntrinsicApy: true,
  populateLabels: true,
});

if (!vault) throw new Error(errors[0]?.message ?? "Vault could not be resolved");
```

**Correct build pattern: single composition root**

```typescript
import { buildEulerSDK } from "euler-v2-sdk";

// Set EULER_SDK_RPC_URL_<chainId> in the environment for on-chain reads.
const sdk = await buildEulerSDK({
  config: {
    v3ApiUrl: process.env.EULER_SDK_V3_API_URL,
    v3ApiKey: process.env.EULER_SDK_V3_API_KEY,
  },
});
```

Built-in scalar config resolves as `config` prop, explicit SDK option, `EULER_SDK_*` env var, then default. Use `packages/euler-v2-sdk/docs/config-through-env.md` when adding runtime config.

Use these default boundaries:

- `accountService`: account/sub-account portfolio state

- `vaultMetaService`: mixed/unknown vault types

- `walletService`: native/ERC20 wallet balances and direct/Permit2 allowance state

- `executionService`: `planX`/`encodeX`, approvals, batch encoding

- `executionService`: transaction planning, execution, plan validation, and post-state preview

- `swapService`: quotes and providers

- `rewardsService`: reward reads and provider-specific claim planning for Merkl, Brevis/Incentra, and Fuul

- `reulLockService`: rEUL vesting lock reads and unlock transaction plans

- `eulerLabelsService`: normalized off-chain labels metadata; use exported helpers from `utils/eulerLabels` for product/vault flags, notices, restrictions, deprecation, and recently-added markers

- `oracleAdapterService`: oracle adapter metadata keyed by normalized `adapter.oracle` address

All service `fetch*` methods return `{ result, errors }`; keep diagnostics with the fetched entity when rendering warnings or enforcing data-quality policy.

For oracle metadata UIs, do not read removed `vault.oracle.adapters` / `debtPricingOracleAdapters` projections. Selected routes live on `vault.debtPricingOracleRoute` and `collaterals[].oracleRoute`; use `getOracleRouteAdapters(route)` or `getOracleRouteResolvedVaults(route)` when a consumer needs adapter/vault projections.

For reward claim UIs, keep provider-specific proof/payload work inside `rewardsService.buildClaimPlan(s)`. V3 reward reads delegate Brevis and Fuul claim helper reads to the direct adapter, and `fetchFuulTotals(address, chainId?)` / `fetchFuulClaimChecks(address, chainId?)` can derive public Fuul claimable rewards when caller-hosted Fuul totals/check endpoints are not configured.

### 1.7 Swap Quotes and Swap-Driven Execution Flows

**Impact: HIGH (Avoids incorrect quote usage and repay/swap mismatches)**

Use `swapService` as the first step for any swap-driven action, then feed selected quotes into `executionService.plan*`.

**Correct flow:**

```typescript
import { SwapperMode } from "euler-v2-sdk";

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

3. For full debt repay, set `liabilityAmount` to `currentDebt` with `SwapperMode.TARGET_DEBT`. If a `debtMax` verifier quote encodes amount `0`, treat it as an intentional full-debt repay/max path; the planner uses that signal for controller cleanup even if the pre-swap debt comparison is ambiguous.

4. For wallet-sourced repay, request the quote with a real `fromVault` and `fromAccount` as the router sweep context, then let `planSwapAndRepayFromWallet` pull the input token from the wallet. Use `BigInt(quote.amountIn)` for exact-input quotes and `BigInt(quote.amountInMax || quote.amountIn)` for target-debt quotes.

5. For CoW open-position, close-position, and collateral-swap routes, pass `cowSwap` into `fetchDepositQuote` / `fetchRepayQuotes`, then use `planOpenPositionWithCoW`, `planClosePositionWithCow`, or `planSwapCollateralWithCoW`. Execute the returned plan with `executeCowSwapTransactionPlan`; do not simulate or gas-estimate CoW plans. Track orders with `fetchCowSwapOrderStatus` / `pollCowSwapOrderStatus`; cancel open/collateral orders with `cancelCowSwapOrder` and close-position orders with `planCancelClosePositionWithCow`.

6. For same-asset debt migration, ensure the destination debt vault has positive-LTV collateral enabled on the account before executing the migration plan.

7. Validate quote-provider assumptions (quotes are best-first, but still simulate non-CoW plans).

8. Compare providers when building professional routing UIs.

### 1.8 Transaction Planning, Approvals, and EVC Batch Execution

**Impact: CRITICAL (Prevents reverted transactions and broken wallet UX)**

Prefer `planX` over `encodeX` for app flows. `planX` includes required approvals and context-driven execution decisions.

For reward claims, use `rewardsService.buildClaimPlan(s)` instead of adding provider-specific claim logic to `executionService`.

Reward claim planning resolves Merkl, Brevis, and Fuul provider payloads lazily at plan-build time; Fuul claim checks are fetched with the target `chainId`, and selecting a Fuul reward claims all currently claimable Fuul checks for that account on that chain.

**Incorrect: encoding raw calls but skipping approvals**

```typescript
const batchItems = sdk.executionService.encodeDeposit({ ...args });
// WRONG: no approval resolution; tx may revert on allowance
```

**Correct: plan + resolve + execute**

```typescript
const plan = sdk.executionService.planDeposit({
  account,
  vault,
  asset,
  amount,
  receiver,
  enableCollateral: true,
});

const resolved = await sdk.executionService.resolveRequiredApprovals({
  chainId,
  account: owner,
  plan,
});

// Execute required approvals first, then handle each executable item:
// - contractCall: send directly
// - evcBatch: send through EVC.batch
```

Execution checklist:

1. Build plan with `planX`.

2. Pass the plan to `sdk.executionService.executeTransactionPlan(...)`; it applies configured plugins before resolving approvals and sending transactions.

3. Use `onProgress` to surface approval, Permit2 signature, direct call, EVC batch, CoW signing/submission, and completion states.

4. Wait for the returned receipts and refetch dependent queries.

5. Decode contract errors for user-facing diagnostics.

CoW swap plans are built with `planOpenPositionWithCoW`, `planClosePositionWithCow`, or `planSwapCollateralWithCoW`. They are executed through `executeCowSwapTransactionPlan`, return `orderUids`, and settle asynchronously through CoW Protocol. Track order state with `fetchCowSwapOrderStatus` or `pollCowSwapOrderStatus`. Cancel open-position and collateral-swap orders with `cancelCowSwapOrder`; cancel close-position orders with `planCancelClosePositionWithCow`, which invalidates the signed EVC permit nonce. Use `formatCowSwapExecutionErrorMessage` for short UI-safe errors. Do not pass CoW plans to simulation, gas estimation, `mergePlans`, or `describeBatch`.

`executeTransactionPlan`, `simulateTransactionPlan`, and `estimateGasForTransactionPlan` accept `AddressOrAccount` (`Address | Account`) for the account argument. Pass an `Account` when the caller already has account state that plugins can reuse; pass an address when plugin-side minimal fetching is preferable.

When the same plan is both simulated (for a Review preview) and then executed (on Confirm), call `prepareTransactionPlan({ plan, chainId, account, usePermit2?, unlimitedApproval? })` once and pass the returned `TransactionPlanPrepared` envelope to `simulatePreparedTransactionPlan(prepared, options?)` and `executePreparedTransactionPlan({ prepared, sendTransaction, signTypedData, onProgress })`. The prepared variants skip the internal plugin pipeline (and approval re-resolution for execute), so plugin reads — TOS, Keyring, Pyth — run once per Review instead of three times. Use `isPreparedTransactionPlan` to discriminate envelope vs raw plan. CoW plans are not supported by `prepareTransactionPlan`.

Borrow and leverage planners (`planBorrow`, `planSwapAndBorrowFromWallet`, `planMultiplyWithSwap`, `planMultiplySameAsset`) automatically prepend cleanup that disables stale enabled collaterals/controllers on the target sub-account before borrowing; pass `skipCleanup: true` to opt out when you manage EVC state yourself. `planCleanup` builds that batch standalone. Full-repay `cleanupOnMax` only sweeps collateral shares for EVK vaults (non-EVK collaterals like Securitize RWA are disabled but not transferred, since they lack `transferFromMax`).

Full-debt `debtMax` swap quotes with verifier amount `0` are treated as max repay during planning so controller cleanup can run even when the current debt comparison alone cannot prove the swap output covers the position. Approval state overrides now try `eth_createAccessList` discovery before sequential ERC20 slot probing for unknown allowance layouts; keep caller-supplied slot hints when available, but do not add per-token workarounds before checking the SDK helper path.

Use `mergePlans` to atomically combine multiple intents and `describeBatch` for previews/logging. `mergePlans` collapses redundant EVC state transitions across merged batches (e.g. a cleanup `disableCollateral` cancels a borrow `enableCollateral`), so merging a `planCleanup` plan with a borrow plan yields a minimal batch.

Planner-created `evcBatch` entries contain named operations (`{ type: "operation", name, items }`). Keep those groups intact in previews and merge flows. Raw `EVCBatchItem` entries are still valid for low-level utilities and plugin-inserted setup calls. Use `convertBatchItemsToPlan(items, operationName)` when a raw encoded batch should be named as one operation; omit `operationName` to preserve the raw item array.

### 1.9 UI Data Layer with Fetch Options and Population

**Impact: HIGH (Prevents undefined computed values and stale portfolio views)**

Explicitly set population flags based on what the screen needs. Computed metrics require populated dependencies.

**Incorrect: expecting computed USD/risk metrics without population**

```typescript
const { result: account } = await sdk.accountService.fetchAccount(chainId, owner, {
  populateVaults: false,
});

console.log(account.getSubAccount(owner)?.netValueUsd); // undefined
```

**Correct: declare population requirements**

```typescript
if (!account.populated.marketPrices) return null;
if (!account.populated.vaults) return null;
```

Use `populated` flags as a hard guard before rendering computed fields:

Keep `errors` alongside the entity snapshot. Diagnostics are not entity state; use them for field-level badges, telemetry, and policy decisions.

APY/ROE values on SDK vault and portfolio entities are percentage points (`5` = `5%`). Raw reward campaign APRs are decimal fractions; convert them before adding them to vault APYs in custom UI code, or use the SDK's computed breakdown fields.

Vault rewards are exposed as a `VaultRewardInfo` whose `getTotalRewardsApr({ viewer })` / `getActiveCampaigns({ viewer })` apply Merkl-style whitelist/blacklist eligibility — the plain `totalRewardsApr` getter stays headline (no viewer). Portfolio, per-position, and sub-account views mirror this: headline `netApy`/`roe`/`apyBreakdown`/`roeBreakdown` getters vs viewer-aware `getNetApy/getRoe/getApyBreakdown/getRoeBreakdown({ viewer })`. Pass the connected address as `viewer` once a wallet is connected so gated campaigns don't inflate displayed APY. These breakdowns also pick up `BORROW_COLLATERAL` and `LOOPING` reward campaigns.

USD market price and value fields (`marketPriceUsd`, `suppliedValueUsd`, `borrowedValueUsd`, `totalRewardsValueUsd`, portfolio USD totals) are plain `number` values. Direct oracle/risk fields such as `oraclePriceRaw`, `assetRiskPrice`, `healthFactor`, and LTV ratios remain `bigint`.

Account portfolio computations report zero LTV for debt positions that have no enabled collateral; treat that as "no collateral backing this debt", not as a missing value.

Labels use "recently added" markers instead of the removed "featured" flag. Use `label.recentlyAdded`, `recentlyAddedVaults`, `recentlyAddedEarnVaults`, or `isEulerLabelVaultRecentlyAdded(labelsData, vaultAddress)` depending on whether you are working with an attached label object or raw labels data.

EVault oracle payloads expose only selected routes: `vault.debtPricingOracleRoute` for asset-to-unit-of-account debt pricing and `collaterals[].oracleRoute` for collateral pricing. `vault.oracle` is only the root oracle identity (`oracle`, `name`). Use the ordered `route.steps` as the primary display surface; call `getOracleRouteAdapters(route)` / `getOracleRouteResolvedVaults(route)` only when you need derived projections.

For React UIs:

1. Build SDK in a provider/context once.

2. Use query hooks per feature (`vault list`, `vault detail`, `account`, `rewards`).

3. Use short UI stale times and let `buildQuery` handle deeper caching.

4. Re-fetch account/vault data after successful execution receipts.

5. For batch vault calls, handle sparse arrays (`undefined` entries) and map diagnostics by `locations[].owner` to show per-address failures.

---

## References

1. [https://github.com/euler-xyz/euler-sdks](https://github.com/euler-xyz/euler-sdks)
2. [https://docs.euler.finance](https://docs.euler.finance)
