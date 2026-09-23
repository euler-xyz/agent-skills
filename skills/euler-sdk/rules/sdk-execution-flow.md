---
title: Transaction Planning and Execution
section: 2
impact: CRITICAL
impactDescription: Keep approvals, plugins, simulation and dispatched requests consistent
tags: execution, planX, approvals, permit2, evc, materialization
---

## Transaction Planning and Execution

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
