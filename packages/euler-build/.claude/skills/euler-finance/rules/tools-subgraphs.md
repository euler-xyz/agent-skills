---
title: Data Querying with Subgraphs
impact: MEDIUM
impactDescription: Efficiently querying historical and aggregated data
tags: subgraph, graphql, data, indexing, analytics
---

## Data Querying with Subgraphs

Euler provides subgraphs deployed via Goldsky for efficient querying of historical data, vault statistics, and account positions across all supported chains.

**Incorrect (querying everything on-chain):**

```typescript
// WRONG: Fetching all vault positions on-chain is expensive and slow
const allVaults = await factory.read.getAllProxies();
for (const vault of allVaults) {
  const info = await vault.read.getVaultInfo(); // Many RPC calls!
}
```

**Correct (using Subgraph for aggregated data):**

```typescript
// Subgraphs are deployed via Goldsky
// Check docs.euler.finance for current endpoint URLs

// Supported networks (as of 2025):
// mainnet, arbitrum, base, swell, sonic, ink, unichain, avalanche,
// berachain, bob, bsc, worldchain, hyperevm, optimism, gnosis,
// tac, linea, plasma, mantle, monad
```

**Correct (querying vault data):**

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

**Correct (querying vault status/state):**

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

**Correct (querying account balances via TrackingVaultBalance):**

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

**Correct (querying interest rate history):**

```graphql
# Get interest rate snapshots for a vault
query GetInterestRateHistory($vault: Bytes!, $since: BigInt!) {
  vaultStatuses(
    where: { vault: $vault, timestamp_gte: $since }
    orderBy: timestamp
    orderDirection: asc
  ) {
    timestamp
    interestRate
    supplyApy
    borrowApy
    totalShares
    totalBorrows
    cash
  }
}
```

**TypeScript: Complete subgraph integration:**

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

**Correct (querying liquidation events):**

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

**Correct (querying deposits and withdrawals):**

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

**Correct (querying Euler Earn vaults):**

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

Reference: [Euler Subgraph Repository](https://github.com/euler-xyz/euler-subgraph)
