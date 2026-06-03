---
title: Script and Tooling Workflows from SDK Examples
impact: MEDIUM
impactDescription: Speeds up reliable bot/script development with proven patterns
tags: scripts, examples, automation, anvil, fork-testing
---

## Script and Tooling Workflows from SDK Examples

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

Reference: `packages/euler-v2-sdk/examples/`, `packages/euler-v2-sdk/examples/run-examples.sh`, `packages/euler-v2-sdk/docs/config-through-env.md`, `packages/euler-v2-sdk/docs/cow-swaps.md`
