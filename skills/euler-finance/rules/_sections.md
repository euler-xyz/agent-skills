# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

---

## 1. Vault Operations (vault)

**Impact:** CRITICAL

**Description:** Core lending and borrowing operations on Euler V2 vaults. These are the fundamental building blocks for interacting with Euler - depositing collateral, borrowing assets, and managing positions. Understanding these operations is essential for any integration.

## 2. EVC Operations (evc)

**Impact:** CRITICAL

**Description:** The Ethereum Vault Connector (EVC) is the central orchestration layer for Euler V2. It enables batching multiple operations atomically, managing sub-accounts for isolated positions, delegating control via operators, and handling collateral/controller relationships. Mastering EVC operations is key to efficient Euler integration.

## 3. Risk Management (risk)

**Impact:** HIGH

**Description:** Monitoring and managing position health to avoid liquidation. Includes health factor calculations, understanding liquidation mechanics, risk curator roles, and implementing protection strategies. Critical for maintaining safe positions.

## 4. Oracle Integration (oracle)

**Impact:** HIGH

**Description:** Price oracle adapters and configuration for Euler vaults. Covers deploying oracle adapters (Chainlink, Pyth, Uniswap TWAP), configuring EulerRouter for price resolution, and querying prices for assets.

## 5. Architecture (arch)

**Impact:** HIGH

**Description:** Core market design and vault architecture concepts. Understanding Euler's modular design - including vault types (Core, Edge, Escrow), market structure, and how components interact - is essential for building on Euler.

## 6. Interest Rate Models (irm)

**Impact:** HIGH

**Description:** Available Interest Rate Models and their configuration. Euler supports multiple IRM types (Linear Kink, Adaptive Curve, Fixed Cyclical Binary, Base Premium) each suited for different use cases and risk profiles.

## 7. Advanced Features (adv)

**Impact:** MEDIUM

**Description:** Advanced protocol features including hooks for custom vault logic, fee flow for protocol revenue, and EUL reward token distribution. These enable sophisticated integrations and protocol mechanics.

## 8. Security (sec)

**Impact:** CRITICAL

**Description:** Security practices, audit reports, and safety guidelines for Euler integrations. Understanding security considerations is essential for building safe applications on Euler.

## 9. Developer Tools (tools)

**Impact:** MEDIUM

**Description:** Tools and resources for developers including contract addresses, ABIs, subgraphs for data querying, and no-code deployment platforms. Essential for efficient Euler development.

## 10. EulerEarn (earn)

**Impact:** MEDIUM

**Description:** Yield aggregation protocol built on top of Euler vaults. Enables creating meta-vaults that allocate across multiple strategies, with role-based access control (owner, curator, guardian, allocator) and timelocked governance.

## 11. EulerSwap (swap)

**Impact:** MEDIUM

**Description:** Automated market maker integrated with Euler credit vaults for deeper liquidity. Enables just-in-time liquidity from lending positions, providing up to 40x deeper markets than traditional AMMs.
