---
name: how-to-fetch-euler-data-lens
description: Developer tools and data access guide for Euler Finance V2. This skill should be used when querying vault/account data via Lens contracts, tracking active accounts via subgraph, or accessing contract interfaces. Triggers on tasks involving AccountLens, VaultLens, OracleLens, subgraph queries, or ABIs.
license: MIT
metadata:
  author: Euler Labs
  version: "1.0.0"
---

# Euler Lens & Data Agent Skill

Developer tools and data access guide for Euler Finance V2. Covers Lens contracts, subgraphs, interfaces, and deployment tools.

## When to Apply

Reference these guidelines when:
- Querying account positions and health using AccountLens
- Querying vault data using Lens contracts (VaultLens, OracleLens, IRMLens, UtilsLens)
- Tracking active accounts via Euler subgraph
- Looking up contract addresses and ABIs
- Building dashboards or analytics for Euler
- Integrating with Euler from frontends or bots

## Rule Categories

| Rule | Impact | Description |
|------|--------|-------------|
| `tools-lens` | MEDIUM | Query vault, account, and oracle data via Lens contracts |
| `tools-subgraphs` | MEDIUM | Track active accounts and vault factories via subgraph |
| `tools-interfaces` | MEDIUM | Contract addresses and ABI references |

## Quick Reference

### Lens Contracts

- **AccountLens** - Query account positions, liquidity, health factor, time to liquidation (TTL)
- **VaultLens** - Query vault state, configuration, LTVs, IRM info
- **OracleLens** - Check oracle configuration and prices
- **IRMLens** - Interest rate model details and calculations
- **UtilsLens** - Utility functions: APY calculations, token balances, allowances
- **EulerEarnVaultLens** - Query EulerEarn vault data and strategies

### Subgraphs

The subgraph is intentionally minimal - use Lens contracts for detailed data:

- **Vault** - Track which factory created each vault
- **TrackingActiveAccount** - Active accounts indexed by address prefix (first 19 bytes)
- **TrackingVaultBalance** - Per-account vault balances and debt (at the time of the last update)

## Companion Skills

- `how-to-use-euler-vaults` - Core vault operations, EVC, risk management
- `euler-interest-rate-models-and-oracles` - Oracle adapters and interest rate models
- `interact-with-euler-earn` - Yield aggregation vaults
- `use-euler-feeflow-hooks-rewardEUL-flashloan` - Hooks, flash loans, fee flow

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/tools-lens.md
rules/tools-subgraphs.md
rules/tools-interfaces.md
```

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
