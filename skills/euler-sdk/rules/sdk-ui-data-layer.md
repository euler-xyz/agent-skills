---
title: UI Data Layer with Fetch Options and Population
impact: HIGH
impactDescription: Prevents undefined computed values and stale portfolio views
tags: react, queries, accountService, population, computed-properties
---

## UI Data Layer with Fetch Options and Population

Explicitly set population flags based on what the screen needs. Computed metrics require populated dependencies.

**Incorrect (expecting computed USD/risk metrics without population):**

```typescript
const account = await sdk.accountService.fetchAccount(chainId, owner, {
  populateVaults: false,
});

console.log(account.netAssetValueUsd); // undefined
```

**Correct (declare population requirements):**

```typescript
const account = await sdk.accountService.fetchAccount(chainId, owner, {
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

For React UIs:

1. Build SDK in a provider/context once.
2. Use query hooks per feature (`vault list`, `vault detail`, `account`, `rewards`).
3. Use short UI stale times and let `buildQuery` handle deeper caching.
4. Re-fetch account/vault data after successful execution receipts.

Reference: `packages/euler-v2-sdk/docs/basic-usage.md`, `docs/cross-service-data-population.md`, `docs/account-computed-properties.md`, `react-sdk-example/src/queries/sdkQueries.ts`
