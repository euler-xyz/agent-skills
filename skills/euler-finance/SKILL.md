---
name: euler-finance
description: Comprehensive guide for interacting with Euler Finance V2 protocol. This skill should be used when building DeFi integrations, managing lending positions, deploying vaults/oracles, or automating yield strategies on Euler. Triggers on tasks involving lending, borrowing, collateral, liquidation, EVC, EVK, EulerEarn, EulerSwap, or Euler-specific operations.
license: MIT
metadata:
  author: Euler Labs
  version: "1.0.0"
---

# Euler Finance Agent Skill

Comprehensive guide for interacting with Euler Finance V2 protocol. Contains rules across 11 categories covering vault operations, EVC orchestration, risk management, oracle integration, architecture concepts, interest rate models, advanced features, security, and developer tools.

## When to Apply

Reference these guidelines when:
- Depositing, borrowing, or managing positions on Euler vaults
- Batching operations via the Ethereum Vault Connector (EVC)
- Monitoring health factors and liquidation risk
- Deploying or configuring price oracles
- Understanding Euler architecture (vault types, market design)
- Configuring Interest Rate Models
- Implementing hooks and custom vault logic
- Using creator tools and development resources
- Creating or managing EulerEarn yield aggregation vaults
- Integrating with EulerSwap for token swaps

## Rule Categories by Priority

| # | Category | Impact | Prefix | Key Questions |
|---|----------|--------|--------|---------------|
| 1 | Vault Operations | CRITICAL | `vault-` | Get APY, deposit, borrow, create market |
| 2 | EVC Operations | CRITICAL | `evc-` | Batch calls, sub-accounts, operators |
| 3 | Risk Management | HIGH | `risk-` | Check health, liquidation, curators |
| 4 | Oracle Integration | HIGH | `oracle-` | Deploy oracle, configure router, get price |
| 5 | Architecture | HIGH | `arch-` | Market design, vault types |
| 6 | Interest Rate Models | HIGH | `irm-` | IRM types, configuration |
| 7 | Advanced Features | MEDIUM | `adv-` | Hooks, fee flow, rewards |
| 8 | Security | CRITICAL | `sec-` | Audits, best practices |
| 9 | Developer Tools | MEDIUM | `tools-` | Addresses, ABIs, subgraphs |
| 10 | EulerEarn | MEDIUM | `earn-` | Create vault, manage strategies |
| 11 | EulerSwap | MEDIUM | `swap-` | Quote and execute swaps |

## Quick Reference

### 1. Vault Operations (CRITICAL)

- `vault-get-apy` - How to get vault APY and interest rates
- `vault-deposit` - How to deposit assets into a vault
- `vault-borrow` - How to borrow assets from a vault
- `vault-repay` - How to repay borrowed debt
- `vault-create-market` - How to create a new vault/market

### 2. EVC Operations (CRITICAL)

- `evc-batch` - How to batch multiple operations atomically
- `evc-sub-accounts` - How to use sub-accounts for isolated positions
- `evc-operators` - How to delegate control via operators
- `evc-enable-collateral` - How to enable vault as collateral

### 3. Risk Management (HIGH)

- `risk-check-health` - How to check account health factor
- `risk-liquidation` - How liquidation works on Euler
- `risk-monitor-position` - How to monitor position health
- `risk-curators` - Understanding risk curator roles

### 4. Oracle Integration (HIGH)

- `oracle-deploy` - How to deploy an oracle adapter
- `oracle-configure-router` - How to configure EulerRouter
- `oracle-get-price` - How to get asset prices

### 5. Architecture (HIGH)

- `arch-market-design` - Understanding Euler market design
- `arch-vault-types` - Core, Edge, and Escrow vault types

### 6. Interest Rate Models (HIGH)

- `irm-models` - Available IRM types and configuration

### 7. Advanced Features (MEDIUM)

- `adv-hooks` - Vault hooks and use cases
- `adv-fee-flow` - Fee flow controller mechanics
- `adv-rewards-eul` - EUL reward token distribution

### 8. Security (CRITICAL)

- `sec-audits` - Security practices and audit information

### 9. Developer Tools (MEDIUM)

- `tools-creator` - Creator tools and deployment resources
- `tools-interfaces` - Contract addresses and ABIs
- `tools-subgraphs` - Data querying with subgraphs

### 10. EulerEarn (MEDIUM)

- `earn-create-vault` - How to create an EulerEarn vault
- `earn-manage-strategies` - How to manage yield strategies

### 11. EulerSwap (MEDIUM)

- `swap-quote` - How to get swap quotes
- `swap-execute` - How to execute swaps
- `swap-liquidity` - How to check liquidity limits

## Core Protocol Components

### Ethereum Vault Connector (EVC)
The EVC is the foundational layer mediating between vaults. It provides:
- **Batching**: Execute multiple operations atomically
- **Sub-accounts**: 256 isolated positions per address
- **Operators**: Delegate control to automated strategies
- **Deferred checks**: Temporarily violate constraints within a batch

### Euler Vault Kit (EVK)
Credit vaults extending ERC-4626 with borrowing:
- Standard ERC-4626 deposit/withdraw/mint/redeem
- Borrow and repay functionality
- Collateral and controller management
- LTV ratios (borrow LTV vs liquidation LTV)

### Price Oracles
Modular oracle adapters implementing IPriceOracle:
- Chainlink, Pyth, Chronicle adapters
- Uniswap V3 TWAP oracles
- EulerRouter for price resolution

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/vault-get-apy.md
rules/evc-batch.md
rules/oracle-deploy.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`
