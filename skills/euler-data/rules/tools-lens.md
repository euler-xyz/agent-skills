---
title: Lens Contracts and SDK Data Reads
impact: HIGH
impactDescription: Read typed vault and account state with explicit diagnostics
tags: lens, sdk, data-v3, account, vault, oracle
---

## Lens Contracts and SDK Data Reads

Use the SDK's typed services for application state. Data V3 supplies indexed data; on-chain adapters read current contract state through Lens contracts. Choose adapter/fallback policy explicitly for the application's latency and freshness requirements. Historical activity is a separate indexed-data concern.

**Correct (typed account read with diagnostics):**

<!-- checked-example: account-read -->
```typescript
import type { Address } from "viem";
import type { EulerSDK } from "@eulerxyz/euler-v2-sdk";

export async function readPortfolio(sdk: EulerSDK, chainId: number, owner: Address) {
  const { result: account, errors } = await sdk.accountService.fetchAccount(chainId, owner, {
    populateVaults: true,
    populateMarketPrices: true,
    populateUserRewards: true,
    vaultFetchOptions: {
      populateMarketPrices: true,
      populateCollaterals: true,
      populateRewards: true,
      populateIntrinsicApy: true,
    },
  });
  if (!account) throw new Error(errors[0]?.message ?? "Account unavailable");
  return { account, errors };
}
```

Keep diagnostics beside the entity; missing/failed data is not a zero balance. Populate only the data needed for the screen, and check the entity's population flags before using dependent computed metrics.

| Lens | Purpose |
|------|---------|
| AccountLens | Account/vault positions, EVC state, liquidity and time to liquidation |
| VaultLens | EVK configuration, LTVs, cash, debt and IRM data |
| OracleLens | Oracle configuration and adapter metadata |
| IRMLens | Interest-rate-model configuration |
| UtilsLens | APYs, token balances, allowances and price utilities |
| EulerEarnVaultLens | Earn configuration, strategies and allocations |

**Correct (low-level Lens eth_call):**

Obtain `deployment` and `vaultLensAbi` through the services in the interfaces rule. Some Lens entrypoints are non-view because they simulate updates; `simulateContract` uses `eth_call` without submitting a transaction.

```typescript
const { result } = await publicClient.simulateContract({
  address: deployment.addresses.lensAddrs.vaultLens,
  abi: vaultLensAbi,
  functionName: "getVaultInfoFull",
  args: [vaultAddress],
});
console.log(result);
```

For Pyth/other read preconditions, use SDK plugins and the SDK's Lens batch-simulation path. A direct Lens call does not add price updates for you. For on-chain contracts, use specific vault methods such as `accountLiquidity(account, true)` rather than gas-heavy Lens aggregation.

Health is liquidation-adjusted collateral value divided by liability value. Use bigint/fixed-point arithmetic and check query-failure diagnostics. Time-to-liquidation is a model under fixed prices/rates, not a safety guarantee; preserve its special infinity/error/liquidatable values.

Use `rewardsService` for provider-aware claims and rewards. AccountLens on-chain reward streams do not cover every off-chain provider.

Reference: [SDK services](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/services.md), [Lens read simulation](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/simulations-and-state-overrides.md), [Lens contracts](https://github.com/euler-xyz/evk-periphery/tree/26e5b883d42a08e8a0b6b63c72a28050c40bbfdd/src/Lens)
