---
title: Plugin Integration for Read and Write Preconditions
section: 3
impact: HIGH
impactDescription: Prevents stale-oracle and credential-gating failures
tags: plugins, pyth, keyring, processPlan, batchSimulation
---

## Plugin Integration for Read and Write Preconditions

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
- Keyring uses vaults already present on a passed `Account`; it fetches target vaults only when the account argument is an address.

Reference: [packages/euler-v2-sdk/docs/plugins.md](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/docs/plugins.md), [src/plugins/pyth/pythPlugin.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/plugins/pyth/pythPlugin.ts), [src/plugins/keyring/keyringPlugin.ts](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/plugins/keyring/keyringPlugin.ts)
