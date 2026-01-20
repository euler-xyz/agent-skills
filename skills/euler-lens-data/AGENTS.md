# Euler Lens & Data Agent Skill

**Version 1.0.0**  
Euler Labs  
January 2026

> **Note:**  
> This document is for agents and LLMs to follow when querying Euler data  
> or using developer tools. It covers Lens contracts, subgraphs, contract  
> interfaces, and no-code vault deployment.

---

## Abstract

Developer tools and data access guide for Euler Finance V2. Covers Lens contracts for querying vault data, subgraph queries for historical data, contract interfaces and ABIs, and no-code vault deployment via Euler Creator.

---

## Table of Contents

1. [Developer Tools](#1-developer-tools) — **MEDIUM**
   - 1.1 [Contract Addresses and ABIs](#11-contract-addresses-and-abis)
   - 1.2 [Creator Tools and Deployment Resources](#12-creator-tools-and-deployment-resources)
   - 1.3 [Data Querying with Subgraphs](#13-data-querying-with-subgraphs)
   - 1.4 [Lens Contracts for Data Queries](#14-lens-contracts-for-data-queries)

---

## 1. Developer Tools

**Impact: MEDIUM**

Tools and resources for developers including Lens contracts for querying vault data, subgraphs for historical data, contract addresses and ABIs, and no-code deployment via Euler Creator. Essential for efficient Euler development and integration.

### 1.1 Contract Addresses and ABIs

**Impact: MEDIUM (Essential reference for Euler contract integration)**

The `euler-interfaces` package provides verified contract addresses and ABIs for all supported chains. Always use this package rather than hardcoding addresses.

**Incorrect: hardcoding addresses**

```typescript
// WRONG: Addresses may differ between chains and change over time
const EVC = "0x0C9a3dd6b8F28529d72d7f9cE918D493519EE383";
const FACTORY = "0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e";
// What about Arbitrum? Base? Other chains?
// What if addresses are updated?
```

**Correct: using euler-interfaces package**

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

**Correct: dynamic chain-based loading**

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

```typescript
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

**Correct: using with viem**

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

**Correct: Solidity remapping**

```solidity
// In remappings.txt for Foundry
euler-interfaces/=node_modules/@eulerxyz/euler-interfaces/

// In Solidity
import {IEVault} from "euler-interfaces/interfaces/IEVault.sol";
import {IEVC} from "euler-interfaces/interfaces/IEVC.sol";
```

Always refer to the euler-interfaces package for the most up-to-date addresses. The package is maintained by Euler Labs and updated when new contracts are deployed.

Reference: [https://github.com/euler-xyz/euler-interfaces](https://github.com/euler-xyz/euler-interfaces)

### 1.2 Creator Tools and Deployment Resources

**Impact: MEDIUM (Tools for deploying and managing Euler vaults)**

Euler provides multiple tools for creating and managing vaults, from no-code platforms to scripting libraries.

**Available Creator Tools:**

```solidity
// From euler-vault-scripts repository

// Deploy a new vault cluster
forge script script/DeployVaultCluster.s.sol \
    --rpc-url $RPC_URL \
    --broadcast

// Configure LTV relationships
forge script script/ConfigureLTV.s.sol \
    --rpc-url $RPC_URL \
    --broadcast

// Emergency governance procedures
forge script script/EmergencyPause.s.sol \
    --rpc-url $RPC_URL \
    --broadcast
```

A bare-bones no-code platform for creating and managing lending vaults on Euler.

Tool for deploying and managing price oracles for Euler markets.

Collection of scripts for deploying, configuring, and managing vault clusters.

**Correct: deploying vault via script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";
import {GenericFactory} from "evk/GenericFactory/GenericFactory.sol";
import {IEVault} from "evk/EVault/IEVault.sol";

contract DeployVault is Script {
    // Mainnet addresses
    address constant EVAULT_FACTORY = 0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e;
    address constant KINK_IRM_FACTORY = 0xcAe0A39B45Ee9C3213f64392FA6DF30CE034C9F9;
    address constant ORACLE_ROUTER_FACTORY = 0x70B3f6F61b7Bf237DF04589DdAA842121072326A;
    
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        
        // 1. Deploy IRM
        address irm = IKinkIRMFactory(KINK_IRM_FACTORY).deploy(
            0,           // baseRate
            1.585e25,    // slope1 (~5% APY at kink)
            13.16e27,    // slope2 (~300% at 100%)
            0.9e9        // kink (90%)
        );
        
        // 2. Deploy oracle router
        address router = IEulerRouterFactory(ORACLE_ROUTER_FACTORY).deploy(
            msg.sender   // governor
        );
        
        // 3. Configure oracle adapters
        IEulerRouter(router).govSetConfig(
            asset,
            unitOfAccount,
            oracleAdapter
        );
        
        // 4. Deploy vault
        bytes memory trailingData = abi.encodePacked(
            asset,
            router,
            unitOfAccount
        );
        address vault = GenericFactory(EVAULT_FACTORY).createProxy(
            address(0),  // no salt
            true,        // upgradeable
            trailingData
        );
        
        // 5. Configure vault
        IEVault(vault).setInterestRateModel(irm);
        IEVault(vault).setHookConfig(address(0), 0);
        // Caps use AmountCap uint16 encoding (0 = unlimited)
        // See AmountCap.sol for encoding formula
        IEVault(vault).setCaps(0, 0); // 0 = no cap
        IEVault(vault).setInterestFee(0.1e4); // 10%
        
        // 6. Configure LTV for collaterals
        IEVault(vault).setLTV(
            collateralVault,
            0.75e4,     // 75% borrow LTV
            0.85e4,     // 85% liquidation LTV
            0           // no ramp
        );
        
        vm.stopBroadcast();
        
        console.log("Vault deployed:", vault);
    }
}
```

**Correct: using EdgeFactory for ungoverned vaults**

```typescript
// euler-interfaces provides contract addresses and ABIs
import addresses from '@eulerxyz/euler-interfaces/addresses/1/CoreAddresses.json';
import periphery from '@eulerxyz/euler-interfaces/addresses/1/PeripheryAddresses.json';
import evaultABI from '@eulerxyz/euler-interfaces/abis/EVault.json';

// Core addresses
const evc = addresses.evc;
const evaultFactory = addresses.eVaultFactory;
const eulerEarnFactory = addresses.eulerEarnFactory;

// Periphery addresses
const kinkIrmFactory = periphery.kinkIRMFactory;
const oracleRouterFactory = periphery.oracleRouterFactory;
const governedPerspective = periphery.governedPerspective;

// Create contract instance
const vault = getContract({
  address: vaultAddress,
  abi: evaultABI,
  client: walletClient,
});
```

**TypeScript: Using euler-interfaces package:**

**Development Workflow:**

```bash
# 1. Clone vault scripts repo
git clone https://github.com/euler-xyz/euler-vault-scripts

# 2. Install dependencies
cd euler-vault-scripts
./install.sh

# 3. Configure environment
cp .env.example .env
# Edit .env with RPC_URL and PRIVATE_KEY

# 4. Deploy vault cluster
forge script script/DeployVaultCluster.s.sol \
    --rpc-url $RPC_URL \
    --broadcast \
    --verify

# 5. Verify on Etherscan
forge verify-contract $VAULT_ADDRESS EVault \
    --chain mainnet
```

Reference: [https://github.com/euler-xyz/euler-vault-scripts](https://github.com/euler-xyz/euler-vault-scripts), [https://create.euler.finance](https://create.euler.finance)

### 1.3 Data Querying with Subgraphs

**Impact: MEDIUM (Efficiently querying historical and aggregated data)**

Euler provides subgraphs deployed via Goldsky for efficient querying of historical data, vault statistics, and account positions across all supported chains.

**Incorrect: querying everything on-chain**

```typescript
// WRONG: Fetching all vault positions on-chain is expensive and slow
const allVaults = await factory.read.getAllProxies();
for (const vault of allVaults) {
  const info = await vault.read.getVaultInfo(); // Many RPC calls!
}
```

**Correct: using Subgraph for aggregated data**

```typescript
// Subgraphs are deployed via Goldsky
// Check docs.euler.finance for current endpoint URLs

// Supported networks (as of 2025):
// mainnet, arbitrum, base, swell, sonic, ink, unichain, avalanche,
// berachain, bob, bsc, worldchain, hyperevm, optimism, gnosis,
// tac, linea, plasma, mantle, monad
```

**Correct: querying vault data**

```graphql
# Get all vaults with their configuration
query GetVaults {
  eulerVaults(first: 100, orderBy: blockTimestamp, orderDirection: desc) {
    id
    evault
    name
    symbol
    asset
    decimals
    supplyCap
    borrowCap
    interestFee
    oracle
    unitOfAccount
    governonAdmin
    feeReceiver
    creator
    interestRateModel
    collaterals
    perspectives
    blockTimestamp
  }
}
```

**Correct: querying vault status/state**

```graphql
# Get vault status with TVL and rates
query GetVaultStatus($vault: Bytes!) {
  vaultStatuses(
    where: { vault: $vault }
    orderBy: timestamp
    orderDirection: desc
    first: 1
  ) {
    id
    vault
    totalShares
    totalBorrows
    cash
    accumulatedFees
    interestAccumulator
    interestRate
    supplyApy
    borrowApy
    timestamp
    blockTimestamp
  }
}
```

**Correct: querying account balances via TrackingVaultBalance**

```graphql
# Get all positions for an account
# Note: Account entity only has id, subAccount, owner
# Use TrackingVaultBalance for position data
query GetAccountPositions($mainAddress: Bytes!) {
  trackingVaultBalances(where: { mainAddress: $mainAddress }) {
    id
    vault
    mainAddress
    account
    balance
    debt
    isControllerEnabled
    blockTimestamp
  }
}
```

**Correct: querying interest rate history**

```typescript
import { request, gql } from 'graphql-request';

// Get current endpoint from docs.euler.finance
const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/.../euler-mainnet/gn';

// Query vault information
const getVaultInfo = async (vaultAddress: string) => {
  const query = gql`
    query GetVault($id: Bytes!) {
      eulerVault(id: $id) {
        id
        evault
        name
        symbol
        asset
        decimals
        supplyCap
        borrowCap
        interestFee
        oracle
        unitOfAccount
        collaterals
        governonAdmin
        feeReceiver
        creator
        blockTimestamp
      }
    }
  `;
  
  return request(SUBGRAPH_URL, query, { id: vaultAddress.toLowerCase() });
};

// Query vault current state
const getVaultStatus = async (vaultAddress: string) => {
  const query = gql`
    query GetVaultStatus($vault: Bytes!) {
      vaultStatuses(
        where: { vault: $vault }
        orderBy: timestamp
        orderDirection: desc
        first: 1
      ) {
        totalShares
        totalBorrows
        cash
        interestRate
        supplyApy
        borrowApy
        timestamp
      }
    }
  `;
  
  return request(SUBGRAPH_URL, query, { vault: vaultAddress.toLowerCase() });
};

// Query user positions
const getUserPositions = async (account: string) => {
  const query = gql`
    query GetUserPositions($mainAddress: Bytes!) {
      trackingVaultBalances(
        where: { mainAddress: $mainAddress, balance_gt: "0" }
      ) {
        vault
        balance
        debt
        isControllerEnabled
        blockTimestamp
      }
    }
  `;
  
  return request(SUBGRAPH_URL, query, { mainAddress: account.toLowerCase() });
};

// Query historical APY
const getHistoricalAPY = async (vault: string, days: number = 30) => {
  const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
  
  const query = gql`
    query GetAPYHistory($vault: Bytes!, $since: BigInt!) {
      vaultStatuses(
        where: { vault: $vault, timestamp_gte: $since }
        orderBy: timestamp
        first: 1000
      ) {
        timestamp
        interestRate
        supplyApy
        borrowApy
        totalShares
        totalBorrows
      }
    }
  `;
  
  return request(SUBGRAPH_URL, query, { 
    vault: vault.toLowerCase(), 
    since: since.toString() 
  });
};
```

**TypeScript: Complete subgraph integration:**

**Correct: querying liquidation events**

```graphql
# Get recent liquidations
query GetLiquidations($since: BigInt!) {
  liquidates(
    where: { blockTimestamp_gte: $since }
    orderBy: blockTimestamp
    orderDirection: desc
    first: 100
  ) {
    id
    blockTimestamp
    liquidator
    violator
    vault
    collateral
    repayAssets
    yieldBalance
    transactionHash
  }
}
```

**Correct: querying deposits and withdrawals**

```graphql
# Get deposit events
query GetDeposits($vault: Bytes!, $since: BigInt!) {
  deposits(
    where: { vault: $vault, blockTimestamp_gte: $since }
    orderBy: blockTimestamp
    orderDirection: desc
  ) {
    id
    sender
    owner
    assets
    shares
    vault
    blockTimestamp
    transactionHash
  }
}

# Get withdrawal events
query GetWithdrawals($vault: Bytes!, $since: BigInt!) {
  withdraws(
    where: { vault: $vault, blockTimestamp_gte: $since }
    orderBy: blockTimestamp
    orderDirection: desc
  ) {
    id
    sender
    receiver
    owner
    assets
    shares
    vault
    blockTimestamp
    transactionHash
  }
}
```

**Correct: querying Euler Earn vaults**

```graphql
# Get Euler Earn aggregator vaults
query GetEulerEarnVaults {
  eulerEarnVaults(first: 100) {
    id
    name
    symbol
    asset
    owner
    curator
    guardian
    feeReceiver
    performanceFee
    timelock
    totalShares
    totalAssets
    totalAllocated
    supplyQueue
    blockTimestamp
  }
}
```

**Combining Subgraph with On-Chain Data:**

```typescript
// Best practice: Use subgraph for discovery, on-chain for current state

// 1. Use subgraph to find relevant vaults
const vaultsQuery = gql`
  query {
    eulerVaults(first: 20, orderBy: blockTimestamp, orderDirection: desc) {
      evault
      name
      symbol
      asset
    }
  }
`;
const topVaults = await request(SUBGRAPH_URL, vaultsQuery);

// 2. Use on-chain for real-time data
const vaultLens = getContract({
  address: VAULT_LENS,
  abi: vaultLensABI,
  client
});

for (const vault of topVaults.eulerVaults) {
  // Get current state on-chain (more accurate)
  const info = await vaultLens.read.getVaultInfoDynamic([vault.evault]);
  
  // Combine with historical data from subgraph
  const history = await getHistoricalAPY(vault.evault, 7);
  
  console.log(`${vault.symbol}: Current APY ${info.supplyAPY}`);
}
```

**Available Subgraph Entities:**

| Entity | Key Fields | Use Case |

|--------|------------|----------|

| EulerVault | evault, asset, caps, oracle | Vault discovery & config |

| VaultStatus | totalShares, totalBorrows, APYs | TVL, rates, utilization |

| TrackingVaultBalance | balance, debt, vault | User positions |

| Liquidate | violator, repayAssets, collateral | Liquidation events |

| Deposit/Withdraw | assets, shares, sender | Transaction history |

| Borrow/Repay | assets, account | Borrow activity |

| EulerEarnVault | totalAssets, strategies | Earn aggregators |

| EulerSwapPool | reserves, fee, assets | Swap pool data |

Reference: [https://github.com/euler-xyz/euler-subgraph](https://github.com/euler-xyz/euler-subgraph)

### 1.4 Lens Contracts for Data Queries

**Impact: MEDIUM (Essential for reading comprehensive vault and account data)**

Lens contracts provide read-only aggregated views of Euler protocol data. They simplify complex multi-call queries into single function calls, returning structured data about vaults, accounts, oracles, and interest rate models.

**Available Lens Contracts:**

| Lens | Purpose |

|------|---------|

| AccountLens | Account positions, liquidity, health, time to liquidation |

| VaultLens | Vault configuration, state, LTVs, rewards |

| OracleLens | Oracle configuration and validation |

| IRMLens | Interest rate model parameters |

| UtilsLens | APY calculations, token balances, price queries |

| EulerEarnVaultLens | EulerEarn vault strategies and allocations |

**Incorrect: making many individual calls**

```typescript
// WRONG: Multiple calls, complex assembly, easy to miss data
const totalAssets = await vault.read.totalAssets();
const totalBorrows = await vault.read.totalBorrows();
const cash = await vault.read.cash();
const governor = await vault.read.governorAdmin();
const irm = await vault.read.interestRateModel();
// ... many more calls needed
```

**Correct: using VaultLens for comprehensive vault data**

```typescript
import { getContract } from 'viem';
import lens from '@eulerxyz/euler-interfaces/addresses/1/LensAddresses.json';
import vaultLensABI from '@eulerxyz/euler-interfaces/abis/VaultLens.json';

const vaultLens = getContract({
  address: lens.vaultLens as Address,
  abi: vaultLensABI,
  client: publicClient
});

// Get all vault info in one call
const vaultInfo = await vaultLens.read.getVaultInfoFull([vaultAddress]);

console.log(`Vault: ${vaultInfo.vaultName} (${vaultInfo.vaultSymbol})`);
console.log(`Asset: ${vaultInfo.assetName} (${vaultInfo.assetDecimals} decimals)`);
console.log(`Total Assets: ${vaultInfo.totalAssets}`);
console.log(`Total Borrowed: ${vaultInfo.totalBorrowed}`);
console.log(`Supply Cap: ${vaultInfo.supplyCap}`);
console.log(`Borrow Cap: ${vaultInfo.borrowCap}`);
console.log(`Governor: ${vaultInfo.governorAdmin}`);
console.log(`Oracle: ${vaultInfo.oracle}`);
console.log(`IRM: ${vaultInfo.interestRateModel}`);

// LTV info for each collateral
for (const ltv of vaultInfo.collateralLTVInfo) {
  console.log(`Collateral ${ltv.collateral}: borrow=${ltv.borrowLTV}, liq=${ltv.liquidationLTV}`);
}
```

**Correct: using AccountLens for position data**

```typescript
import accountLensABI from '@eulerxyz/euler-interfaces/abis/AccountLens.json';

const accountLens = getContract({
  address: lens.accountLens as Address,
  abi: accountLensABI,
  client: publicClient
});

// Get full account info for a specific vault
const accountInfo = await accountLens.read.getAccountInfo([account, vaultAddress]);

// EVC account state
const evcInfo = accountInfo.evcAccountInfo;
console.log(`Owner: ${evcInfo.owner}`);
console.log(`Controllers: ${evcInfo.enabledControllers}`);
console.log(`Collaterals: ${evcInfo.enabledCollaterals}`);
console.log(`Lockdown Mode: ${evcInfo.isLockdownMode}`);

// Vault position
const vaultInfo = accountInfo.vaultAccountInfo;
console.log(`Shares: ${vaultInfo.shares}`);
console.log(`Assets (deposits): ${vaultInfo.assets}`);
console.log(`Borrowed: ${vaultInfo.borrowed}`);
console.log(`Is Controller: ${vaultInfo.isController}`);
console.log(`Is Collateral: ${vaultInfo.isCollateral}`);

// Liquidity and health
const liq = vaultInfo.liquidityInfo;
console.log(`Collateral Value (borrow): ${liq.collateralValueBorrowing}`);
console.log(`Collateral Value (liq): ${liq.collateralValueLiquidation}`);
console.log(`Liability Value: ${liq.liabilityValueLiquidation}`);
console.log(`Time to Liquidation: ${liq.timeToLiquidation}`);
```

**Correct: using AccountLens for liquidity info only**

```typescript
// Quick health check without full account info
const liquidityInfo = await accountLens.read.getAccountLiquidityInfo([
  account,
  controllerVault
]);

if (liquidityInfo.queryFailure) {
  console.error('Query failed:', liquidityInfo.queryFailureReason);
  return;
}

// Calculate health factor
const health = liquidityInfo.liabilityValueLiquidation > 0n
  ? (liquidityInfo.collateralValueLiquidation * 10n ** 18n) / liquidityInfo.liabilityValueLiquidation
  : MaxUint256;

console.log(`Health Factor: ${formatUnits(health, 18)}`);

// Time to liquidation (special values)
const TTL_INFINITY = await accountLens.read.TTL_INFINITY();
const TTL_LIQUIDATION = await accountLens.read.TTL_LIQUIDATION();

if (liquidityInfo.timeToLiquidation === TTL_INFINITY) {
  console.log('Safe: Infinite time to liquidation');
} else if (liquidityInfo.timeToLiquidation === TTL_LIQUIDATION) {
  console.log('DANGER: Already liquidatable!');
} else if (liquidityInfo.timeToLiquidation > 0) {
  console.log(`Time to liquidation: ${liquidityInfo.timeToLiquidation} seconds`);
}
```

**Correct: using VaultLens for IRM curve data**

```typescript
// Get interest rate model info with custom utilization points
const utilizationPoints = [
  { cash: 90n * 10n ** 18n, borrows: 10n * 10n ** 18n },   // 10% utilization
  { cash: 50n * 10n ** 18n, borrows: 50n * 10n ** 18n },   // 50% utilization
  { cash: 10n * 10n ** 18n, borrows: 90n * 10n ** 18n },   // 90% utilization
  { cash: 5n * 10n ** 18n, borrows: 95n * 10n ** 18n },    // 95% utilization
];

const cashArray = utilizationPoints.map(p => p.cash);
const borrowsArray = utilizationPoints.map(p => p.borrows);

const irmInfo = await vaultLens.read.getVaultInterestRateModelInfo([
  vaultAddress,
  cashArray,
  borrowsArray
]);

// Plot the interest rate curve
for (let i = 0; i < irmInfo.interestRateInfo.length; i++) {
  const info = irmInfo.interestRateInfo[i];
  const utilization = (info.borrows * 100n) / (info.cash + info.borrows);
  console.log(`${utilization}% util: Borrow APY=${info.borrowAPY}, Supply APY=${info.supplyAPY}`);
}

// For kink IRM, get standard curve points
const kinkIrmInfo = await vaultLens.read.getVaultKinkInterestRateModelInfo([vaultAddress]);
console.log(`IRM Type: ${kinkIrmInfo.interestRateModelInfo.interestRateModelType}`);
```

**Correct: using OracleLens for oracle validation**

```typescript
import oracleLensABI from '@eulerxyz/euler-interfaces/abis/OracleLens.json';

const oracleLens = getContract({
  address: lens.oracleLens as Address,
  abi: oracleLensABI,
  client: publicClient
});

// Get oracle info for multiple base/quote pairs
const bases = [wethAddress, wbtcAddress, linkAddress];
const quotes = [usdAddress, usdAddress, usdAddress];

const oracleInfo = await oracleLens.read.getOracleInfo([
  routerAddress,
  bases,
  quotes
]);

console.log(`Oracle: ${oracleInfo.name}`);
console.log(`Oracle Address: ${oracleInfo.oracle}`);
// oracleInfo.oracleInfo contains encoded adapter-specific info

// Check for stale pull oracles (Pyth, RedStone)
const isStale = await oracleLens.read.isStalePullOracle([
  oracleAddress,
  '0x' // failure reason bytes
]);

if (isStale) {
  console.warn('Oracle prices are stale - update required!');
}

// Get valid oracle adapters for a pair
const validAdapters = await oracleLens.read.getValidAdapters([
  baseToken,
  quoteToken
]);
console.log('Valid adapters:', validAdapters);
```

**Correct: using UtilsLens for calculations**

```typescript
import utilsLensABI from '@eulerxyz/euler-interfaces/abis/UtilsLens.json';

const utilsLens = getContract({
  address: lens.utilsLens as Address,
  abi: utilsLensABI,
  client: publicClient
});

// Get APYs for a vault
const [borrowAPY, supplyAPY] = await utilsLens.read.getAPYs([vaultAddress]);
console.log(`Borrow APY: ${formatUnits(borrowAPY, 25)}%`);  // 1e27 scale
console.log(`Supply APY: ${formatUnits(supplyAPY, 25)}%`);

// Batch token balances
const tokens = [wethAddress, usdcAddress, daiAddress];
const balances = await utilsLens.read.tokenBalances([account, tokens]);
tokens.forEach((token, i) => {
  console.log(`${token}: ${balances[i]}`);
});

// Batch token allowances
const allowances = await utilsLens.read.tokenAllowances([
  spenderAddress,
  account,
  tokens
]);

// Get ERC4626 vault info (works for any 4626 vault)
const vaultInfo = await utilsLens.read.getVaultInfoERC4626([vaultAddress]);
console.log(`Is EVault: ${vaultInfo.isEVault}`);
console.log(`Share/Asset ratio: ${vaultInfo.totalAssets / vaultInfo.totalShares}`);

// Calculate time to liquidation
const ttl = await utilsLens.read.calculateTimeToLiquidation([
  liabilityVault,
  liabilityValue,
  collateralAddresses,
  collateralValues
]);
```

**Correct: using EulerEarnVaultLens for yield strategies**

```solidity
import {IVaultLens} from "euler-interfaces/interfaces/IVaultLens.sol";
import {IAccountLens} from "euler-interfaces/interfaces/IAccountLens.sol";

contract MyContract {
    IVaultLens public vaultLens;
    IAccountLens public accountLens;
    
    constructor(address _vaultLens, address _accountLens) {
        vaultLens = IVaultLens(_vaultLens);
        accountLens = IAccountLens(_accountLens);
    }
    
    function getAccountHealth(address account, address vault) 
        external 
        view 
        returns (uint256 health) 
    {
        IAccountLens.AccountLiquidityInfo memory liq = 
            accountLens.getAccountLiquidityInfo(account, vault);
        
        if (liq.queryFailure) revert("Query failed");
        if (liq.liabilityValueLiquidation == 0) return type(uint256).max;
        
        health = (liq.collateralValueLiquidation * 1e18) / liq.liabilityValueLiquidation;
    }
    
    function getVaultUtilization(address vault) 
        external 
        view 
        returns (uint256 utilization) 
    {
        IVaultLens.VaultInfoDynamic memory info = 
            vaultLens.getVaultInfoDynamic(vault);
        
        uint256 total = info.totalCash + info.totalBorrowed;
        if (total == 0) return 0;
        
        utilization = (info.totalBorrowed * 1e18) / total;
    }
}
```

**Solidity: Using Lens contracts on-chain:**

**Key Lens Functions Summary:**

| Lens | Function | Returns |

|------|----------|---------|

| VaultLens | `getVaultInfoFull(vault)` | Complete vault config + state |

| VaultLens | `getVaultInfoDynamic(vault)` | Current state only |

| VaultLens | `getVaultInfoStatic(vault)` | Immutable config only |

| VaultLens | `getRecognizedCollateralsLTVInfo(vault)` | LTV for all collaterals |

| VaultLens | `getVaultKinkInterestRateModelInfo(vault)` | IRM curve data |

| AccountLens | `getAccountInfo(account, vault)` | Full account position |

| AccountLens | `getAccountLiquidityInfo(account, vault)` | Health and liquidation info |

| AccountLens | `getTimeToLiquidation(account, vault)` | Seconds until liquidatable |

| OracleLens | `getOracleInfo(oracle, bases, quotes)` | Oracle configuration |

| OracleLens | `isStalePullOracle(oracle, reason)` | Check for stale Pyth/RedStone |

| UtilsLens | `getAPYs(vault)` | Current borrow/supply APY |

| UtilsLens | `tokenBalances(account, tokens)` | Batch balance query |

| EulerEarnLens | `getVaultInfoFull(vault)` | Earn vault with strategies |

Reference: [https://github.com/euler-xyz/evk-periphery/tree/master/src/Lens](https://github.com/euler-xyz/evk-periphery/tree/master/src/Lens)

---

## References

1. [https://docs.euler.finance](https://docs.euler.finance)
2. [https://github.com/euler-xyz/evk-periphery](https://github.com/euler-xyz/evk-periphery)
3. [https://github.com/euler-xyz/euler-vault-kit](https://github.com/euler-xyz/euler-vault-kit)
