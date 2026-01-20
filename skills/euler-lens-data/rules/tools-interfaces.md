---
title: Contract Addresses and ABIs
impact: MEDIUM
impactDescription: Essential reference for Euler contract integration
tags: addresses, abi, interfaces, contracts, chains
---

## Contract Addresses and ABIs

The `euler-interfaces` package provides verified contract addresses and ABIs for all supported chains. Always use this package rather than hardcoding addresses.

**Incorrect (hardcoding addresses):**

```typescript
// WRONG: Addresses may differ between chains and change over time
const EVC = "0x0C9a3dd6b8F28529d72d7f9cE918D493519EE383";
const FACTORY = "0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e";
// What about Arbitrum? Base? Other chains?
// What if addresses are updated?
```

**Correct (using euler-interfaces package):**

```typescript
// Install: npm install @eulerxyz/euler-interfaces

// Import chain-specific addresses
import coreMainnet from '@eulerxyz/euler-interfaces/addresses/1/CoreAddresses.json';
import peripheryMainnet from '@eulerxyz/euler-interfaces/addresses/1/PeripheryAddresses.json';
import lensMainnet from '@eulerxyz/euler-interfaces/addresses/1/LensAddresses.json';

// For other chains, use their chain ID
import coreArbitrum from '@eulerxyz/euler-interfaces/addresses/42161/CoreAddresses.json';
import coreBase from '@eulerxyz/euler-interfaces/addresses/8453/CoreAddresses.json';

// Access addresses
console.log('EVC:', coreMainnet.evc);
console.log('Factory:', coreMainnet.eVaultFactory);
console.log('VaultLens:', lensMainnet.vaultLens);
```

**Correct (dynamic chain-based loading):**

```typescript
// Dynamic address loading for multi-chain apps
async function getEulerAddresses(chainId: number) {
  const core = await import(
    `@eulerxyz/euler-interfaces/addresses/${chainId}/CoreAddresses.json`
  );
  const periphery = await import(
    `@eulerxyz/euler-interfaces/addresses/${chainId}/PeripheryAddresses.json`
  );
  const lens = await import(
    `@eulerxyz/euler-interfaces/addresses/${chainId}/LensAddresses.json`
  );
  
  return { core, periphery, lens };
}

// Usage
const { core, periphery, lens } = await getEulerAddresses(1); // Mainnet
const { core: arbCore } = await getEulerAddresses(42161);     // Arbitrum
```

**Address file structure in euler-interfaces:**

```
@eulerxyz/euler-interfaces/
├── addresses/
│   ├── 1/                        # Ethereum Mainnet
│   │   ├── CoreAddresses.json    # EVC, factory, protocol config
│   │   ├── PeripheryAddresses.json # IRMs, perspectives, fee flow
│   │   ├── LensAddresses.json    # Lens contracts
│   │   ├── OracleAdaptersAddresses.csv # Deployed oracles
│   │   └── ...
│   ├── 42161/                    # Arbitrum
│   ├── 8453/                     # Base
│   ├── 10/                       # Optimism
│   └── ...
└── abis/
    ├── EVault.json
    ├── EthereumVaultConnector.json
    └── ...
```

**Supported Chains:**

| Chain | Chain ID | Package Path |
|-------|----------|--------------|
| Ethereum | 1 | `addresses/1/` |
| Arbitrum | 42161 | `addresses/42161/` |
| Base | 8453 | `addresses/8453/` |
| Optimism | 10 | `addresses/10/` |
| Polygon | 137 | `addresses/137/` |
| Avalanche | 43114 | `addresses/43114/` |
| BSC | 56 | `addresses/56/` |
| Linea | 59144 | `addresses/59144/` |
| Mantle | 5000 | `addresses/5000/` |
| Berachain | 80094 | `addresses/80094/` |
| Sonic | 146 | `addresses/146/` |

**Correct (using with viem):**

```typescript
import { createPublicClient, http, getContract } from 'viem';
import { mainnet } from 'viem/chains';
import core from '@eulerxyz/euler-interfaces/addresses/1/CoreAddresses.json';
import evcABI from '@eulerxyz/euler-interfaces/abis/EthereumVaultConnector.json';
import evaultABI from '@eulerxyz/euler-interfaces/abis/EVault.json';

const client = createPublicClient({
  chain: mainnet,
  transport: http()
});

// Create contract instances using imported addresses
const evc = getContract({
  address: core.evc as `0x${string}`,
  abi: evcABI,
  client
});

// Check collaterals for an account
const collaterals = await evc.read.getCollaterals([accountAddress]);
```

**Available ABIs:**

```typescript
// Core contracts
import EVault from '@eulerxyz/euler-interfaces/abis/EVault.json';
import EthereumVaultConnector from '@eulerxyz/euler-interfaces/abis/EthereumVaultConnector.json';
import GenericFactory from '@eulerxyz/euler-interfaces/abis/GenericFactory.json';

// Oracle
import EulerRouter from '@eulerxyz/euler-interfaces/abis/EulerRouter.json';

// EulerEarn
import EulerEarn from '@eulerxyz/euler-interfaces/abis/EulerEarn.json';
import EulerEarnFactory from '@eulerxyz/euler-interfaces/abis/EulerEarnFactory.json';
import PublicAllocator from '@eulerxyz/euler-interfaces/abis/PublicAllocator.json';

// EulerSwap
import EulerSwap from '@eulerxyz/euler-interfaces/abis/EulerSwap.json';
import EulerSwapFactory from '@eulerxyz/euler-interfaces/abis/EulerSwapFactory.json';

// Lens
import VaultLens from '@eulerxyz/euler-interfaces/abis/VaultLens.json';
import AccountLens from '@eulerxyz/euler-interfaces/abis/AccountLens.json';
import OracleLens from '@eulerxyz/euler-interfaces/abis/OracleLens.json';
import IRMLens from '@eulerxyz/euler-interfaces/abis/IRMLens.json';

// Periphery
import FeeFlowController from '@eulerxyz/euler-interfaces/abis/FeeFlowController.json';
import RewardToken from '@eulerxyz/euler-interfaces/abis/RewardToken.json';
import TrackingRewardStreams from '@eulerxyz/euler-interfaces/abis/TrackingRewardStreams.json';
```

**Correct (Solidity remapping):**

```solidity
// In remappings.txt for Foundry
euler-interfaces/=node_modules/@eulerxyz/euler-interfaces/

// In Solidity
import {IEVault} from "euler-interfaces/interfaces/IEVault.sol";
import {IEVC} from "euler-interfaces/interfaces/IEVC.sol";
```

Always refer to the euler-interfaces package for the most up-to-date addresses. The package is maintained by Euler Labs and updated when new contracts are deployed.

Reference: [euler-interfaces](https://github.com/euler-xyz/euler-interfaces)
