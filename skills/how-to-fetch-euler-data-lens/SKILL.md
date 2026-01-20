---
name: how-to-fetch-euler-data-lens
description: Developer tools and data access guide for Euler Finance V2. This skill should be used when querying vault data via Lens contracts, fetching historical data from subgraphs, accessing contract interfaces, or deploying vaults via Euler Creator. Triggers on tasks involving VaultLens, OracleLens, subgraph queries, ABIs, or no-code deployment.
license: MIT
metadata:
  author: Euler Labs
  version: "1.0.0"
---

# Euler Lens & Data Agent Skill

Developer tools and data access guide for Euler Finance V2. Covers Lens contracts, subgraphs, interfaces, and deployment tools.

## When to Apply

Reference these guidelines when:
- Querying vault data using Lens contracts (VaultLens, OracleLens, UtilsLens)
- Fetching historical data from Euler subgraphs
- Looking up contract addresses and ABIs
- Deploying vaults using Euler Creator (no-code)
- Building dashboards or analytics for Euler
- Integrating with Euler from frontends or bots

## Rule Categories

| Rule | Impact | Description |
|------|--------|-------------|
| `tools-lens` | MEDIUM | Query vault and oracle data via Lens contracts |
| `tools-subgraphs` | MEDIUM | Fetch historical data from Euler subgraphs |
| `tools-interfaces` | MEDIUM | Contract addresses and ABI references |
| `tools-creator` | MEDIUM | No-code vault deployment via Euler Creator |

## Quick Reference

### Lens Contracts

- **VaultLens** - Query vault state, positions, APYs
- **OracleLens** - Check oracle configuration and prices
- **UtilsLens** - Utility functions for data formatting
- **EulerEarnVaultLens** - Query EulerEarn vault data

### Subgraphs

- Vault deployments and configurations
- Historical interest rates and utilization
- Liquidation events and user positions
- Oracle price history

### Key Endpoints

- Mainnet: `https://api.thegraph.com/subgraphs/name/euler-xyz/euler-v2`
- Use `getVaultInfoFull` for comprehensive vault data
- Batch queries with multicall for efficiency

## Companion Skills

- `how-to-use-euler-vaults` - Core vault operations, EVC, risk management
- `euler-interest-rate-models-and-oracles` - Oracle adapters and interest rate models
- `interact-with-euler-earn` - Yield aggregation vaults
- `how-to-use-euler-swap` - AMM integration
- `use-euler-feeflow-hooks-rewardEUL-flashloan` - Hooks, flash loans, fee flow

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/tools-lens.md
rules/tools-subgraphs.md
rules/tools-interfaces.md
rules/tools-creator.md
```

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
