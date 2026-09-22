---
title: Pre-Execution Simulation and Safety Gates
section: 2
impact: CRITICAL
impactDescription: Catches failing routes and unhealthy positions before users sign
tags: simulation, batchSimulation, safety, health, state-overrides
---

## Pre-Execution Simulation and Safety Gates

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
