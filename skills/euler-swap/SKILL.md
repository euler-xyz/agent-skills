---
name: euler-swap
description: EulerSwap AMM integration guide for Euler Finance. This skill should be used when deploying swap pools, getting quotes, checking liquidity limits, or executing token swaps on EulerSwap. Triggers on tasks involving EulerSwap pools, swap execution, liquidity limits, or AMM operations on Euler.
license: MIT
metadata:
  author: Euler Labs
  version: "1.0.0"
---

# EulerSwap Agent Skill

EulerSwap AMM integration guide for Euler Finance. Covers pool deployment, quotes, liquidity limits, and swap execution.

## When to Apply

Reference these guidelines when:
- Deploying EulerSwap pools via factory
- Getting swap quotes with computeQuote
- Checking liquidity limits with getLimits
- Executing swaps (direct or via periphery)
- Implementing flash swaps with callbacks
- Managing LP positions and pool parameters

## Rule Categories

| Rule | Impact | Description |
|------|--------|-------------|
| `swap-deploy-pool` | HIGH | Deploy EulerSwap pools backed by Euler vaults |
| `swap-quote` | MEDIUM | Get swap quotes from EulerSwap pools |
| `swap-liquidity` | MEDIUM | Check directional liquidity limits |
| `swap-execute` | MEDIUM | Execute swaps on EulerSwap |

## Quick Reference

### Pool Architecture

- **supplyVault0/1** - LP deposits earn lending yield
- **borrowVault0/1** - Pool borrows when providing output tokens
- **eulerAccount** - EVC sub-account holding LP position
- **equilibriumReserve** - Target reserve amounts
- **concentrationX/Y** - Curve shape (0 to <1e18)

### Key Concepts

1. **Just-in-time Liquidity** - Borrows output tokens from vaults
2. **Dual Yield** - LPs earn trading fees + lending APY
3. **Directional Limits** - getLimits() returns per-direction capacity
4. **Uniswap V2 Interface** - Compatible swap() interface

## Companion Skills

- `euler-vaults` - Core vault operations, EVC, risk management
- `euler-irm-oracles` - Oracle adapters and interest rate models
- `euler-earn` - Yield aggregation vaults
- `euler-advanced` - Hooks, flash loans, fee flow
- `euler-data` - Lens contracts and data querying

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/swap-deploy-pool.md
rules/swap-quote.md
rules/swap-liquidity.md
rules/swap-execute.md
```

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
