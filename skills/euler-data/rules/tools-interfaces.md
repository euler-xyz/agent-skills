---
title: Contract Addresses and ABIs
impact: HIGH
impactDescription: Resolve chain-specific deployments and matching contract interfaces
tags: addresses, abi, sdk, interfaces, provenance
---

## Contract Addresses and ABIs

Use the SDK deployment and ABI services for application integrations, or the canonical [euler-interfaces repository](https://github.com/euler-xyz/euler-interfaces) for source artifacts. Check the selected chain and deployment before encoding a transaction.

**Correct (SDK 3.4.0 deployment and ABI access):**

<!-- checked-example: interface-services -->
```typescript
import { buildEulerSDK } from "@eulerxyz/euler-v2-sdk";

const sdk = await buildEulerSDK();
const chainId = 1;
const deployment = sdk.deploymentService.getDeployment(chainId);
const evcAddress = deployment.addresses.coreAddrs.evc;
const vaultLensAddress = deployment.addresses.lensAddrs.vaultLens;
const evcAbi = await sdk.abiService.fetchABI(chainId, "EthereumVaultConnector");

console.log({ evcAddress, vaultLensAddress, evcAbi });
```

The SDK uses live upstream sources by default. Dynamic ABIs have runtime types; use the SDK's typed services for entity reads, or generate typed bindings from a reviewed ABI snapshot. The constructor option `abiServiceConfig.eulerInterfacesBranch` selects a branch, not a commit SHA. For reproducible source artifacts, check out a specific revision:

**Correct (reviewed source checkout):**

```bash
git clone https://github.com/euler-xyz/euler-interfaces.git
git -C euler-interfaces checkout d0e9a428523b3de6cb3e6c7a06ad55b6e59223f3
```

The checkout contains:

- `addresses/<chainId>/CoreAddresses.json`, `LensAddresses.json`, and `PeripheryAddresses.json`
- `abis/<Contract>.json`
- `interfaces/I<Contract>.sol`
- `verify/manifest.json` and per-chain bytecode verification reports

When consuming a fixed snapshot, reconcile its deployment addresses and implementation revision with the target chain before use. Review the verification reports for source/audit provenance; factory membership alone does not establish economic safety.

For Solidity EVC integration, import `IEVC` from `ethereum-vault-connector/interfaces/IEthereumVaultConnector.sol` in the EVC source dependency. Foundry remappings should point to the checked-out dependencies' `src/` directories.

Reference: [Canonical interfaces and verification](https://github.com/euler-xyz/euler-interfaces/tree/d0e9a428523b3de6cb3e6c7a06ad55b6e59223f3), [SDK ABI service](https://github.com/euler-xyz/euler-sdks/blob/ff224741c251cae7673c5f835dcf3bbccd9d6605/packages/euler-v2-sdk/src/services/abiService/abiService.ts)
