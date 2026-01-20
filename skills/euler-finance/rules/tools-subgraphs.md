---
title: Data Querying with Subgraphs
impact: MEDIUM
impactDescription: Efficiently querying historical and aggregated data
tags: subgraph, graphql, data, indexing, analytics
---

## Data Querying with Subgraphs

Euler provides subgraphs for efficient querying of historical data, vault statistics, and account positions across all supported chains.

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
// Subgraph endpoints (as of 2025)
const SUBGRAPH_URLS = {
  1: 'https://api.studio.thegraph.com/query/[id]/euler-v2-mainnet/version/latest',
  42161: 'https://api.studio.thegraph.com/query/[id]/euler-v2-arbitrum/version/latest',
  8453: 'https://api.studio.thegraph.com/query/[id]/euler-v2-base/version/latest',
};

// Check docs.euler.finance for current endpoints
```

**Correct (querying vault data):**

```graphql
# Get all vaults with their configuration
query GetVaults {
  vaults(first: 100, orderBy: totalSupplyAssets, orderDirection: desc) {
    id
    address
    asset {
      address
      symbol
      decimals
    }
    totalSupplyAssets
    totalSupplyShares
    totalBorrowAssets
    totalBorrowShares
    interestRate
    interestFee
    oracle
    unitOfAccount
    governorAdmin
    supplyCap
    borrowCap
    createdAt
    lastInterestAccrual
  }
}
```

**Correct (querying account positions):**

```graphql
# Get all positions for an account
query GetAccountPositions($account: String!) {
  account(id: $account) {
    id
    positions {
      vault {
        address
        asset {
          symbol
        }
      }
      supplyShares
      supplyAssets
      borrowShares
      borrowAssets
      enabledAsCollateral
    }
    controllers {
      vault {
        address
      }
    }
  }
}
```

**Correct (querying interest rate history):**

```graphql
# Get interest rate snapshots for a vault
query GetInterestRateHistory($vault: String!, $since: BigInt!) {
  vaultSnapshots(
    where: { vault: $vault, timestamp_gte: $since }
    orderBy: timestamp
    orderDirection: asc
  ) {
    timestamp
    interestRate
    totalSupplyAssets
    totalBorrowAssets
    utilization
  }
}
```

**TypeScript: Complete subgraph integration:**

```typescript
import { request, gql } from 'graphql-request';

const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/[id]/euler-v2-mainnet/version/latest';

// Query vault information
const getVaultInfo = async (vaultAddress: string) => {
  const query = gql`
    query GetVault($id: ID!) {
      vault(id: $id) {
        id
        address
        asset {
          address
          symbol
          decimals
        }
        totalSupplyAssets
        totalBorrowAssets
        interestRate
        supplyCap
        borrowCap
        collaterals {
          collateral {
            address
            asset {
              symbol
            }
          }
          borrowLTV
          liquidationLTV
        }
      }
    }
  `;
  
  return request(SUBGRAPH_URL, query, { id: vaultAddress.toLowerCase() });
};

// Query top vaults by TVL
const getTopVaults = async (limit: number = 10) => {
  const query = gql`
    query GetTopVaults($first: Int!) {
      vaults(first: $first, orderBy: totalSupplyAssets, orderDirection: desc) {
        id
        address
        asset {
          symbol
        }
        totalSupplyAssets
        totalBorrowAssets
      }
    }
  `;
  
  return request(SUBGRAPH_URL, query, { first: limit });
};

// Query user positions
const getUserPositions = async (account: string) => {
  const query = gql`
    query GetUserPositions($account: ID!) {
      account(id: $account) {
        positions(where: { supplyShares_gt: "0" }) {
          vault {
            address
            asset {
              symbol
              decimals
            }
          }
          supplyAssets
          borrowAssets
        }
      }
    }
  `;
  
  return request(SUBGRAPH_URL, query, { account: account.toLowerCase() });
};

// Query historical APY
const getHistoricalAPY = async (vault: string, days: number = 30) => {
  const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
  
  const query = gql`
    query GetAPYHistory($vault: String!, $since: BigInt!) {
      vaultSnapshots(
        where: { vault: $vault, timestamp_gte: $since }
        orderBy: timestamp
        first: 1000
      ) {
        timestamp
        interestRate
        utilization
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
  liquidations(
    where: { timestamp_gte: $since }
    orderBy: timestamp
    orderDirection: desc
    first: 100
  ) {
    id
    timestamp
    liquidator
    violator
    vault {
      address
      asset {
        symbol
      }
    }
    collateralVault {
      address
      asset {
        symbol
      }
    }
    repayAssets
    yieldBalance
  }
}
```

**Combining Subgraph with On-Chain Data:**

```typescript
// Best practice: Use subgraph for discovery, on-chain for current state

// 1. Use subgraph to find relevant vaults
const topVaults = await getTopVaults(20);

// 2. Use on-chain for real-time data
const vaultLens = getContract({
  address: VAULT_LENS,
  abi: vaultLensABI,
  client
});

for (const vault of topVaults.vaults) {
  // Get current state on-chain (more accurate)
  const info = await vaultLens.read.getVaultInfoDynamic([vault.address]);
  
  // Combine with historical data from subgraph
  const history = await getHistoricalAPY(vault.address, 7);
  
  console.log(`${vault.asset.symbol}: Current APY ${info.supplyAPY}, 7d avg ${calculateAvg(history)}`);
}
```

**Available Subgraph Data:**

| Entity | Fields | Use Case |
|--------|--------|----------|
| Vault | TVL, rates, caps, config | Vault discovery |
| Account | Positions, collaterals, controllers | User portfolios |
| VaultSnapshot | Historical rates, utilization | APY charts |
| Liquidation | Events, amounts, participants | Risk monitoring |
| Deposit/Withdraw | User activity history | Transaction history |

Reference: [Euler Subgraphs](https://docs.euler.finance/developers/data-querying/subgraphs)
