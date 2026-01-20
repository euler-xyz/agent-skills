---
title: Create a New Vault/Market
impact: HIGH
impactDescription: Deploy new lending markets for any asset
tags: vault, create, deploy, factory, market, governance
---

## Create a New Vault/Market

Creating a new Euler vault allows you to establish a lending market for any ERC-20 token. This requires deploying the vault via the factory and configuring its parameters.

**Incorrect (deploying vault without proper configuration):**

```solidity
// Deploying without IRM or oracle makes vault unusable for borrowing
address vault = factory.createProxy(address(0), true, "");
// This vault cannot price collateral or calculate interest
```

**Correct (full vault deployment flow):**

```solidity
import {GenericFactory} from "evk/GenericFactory/GenericFactory.sol";
import {IEVault} from "evk/EVault/IEVault.sol";

// Step 1: Deploy or select an Interest Rate Model
address irm = irmFactory.deploy(
    baseRate,    // e.g., 0 for 0% base rate
    slope1,      // e.g., 4e27 for 4% at kink
    slope2,      // e.g., 300e27 for 300% max
    kink         // e.g., 0.9e18 for 90% utilization
);

// Step 2: Deploy or configure an oracle
address oracle = eulerRouter; // EulerRouter configured for this asset

// Step 3: Prepare vault initialization data (tightly packed, 60 bytes)
// Format: 20 bytes asset + 20 bytes oracle + 20 bytes unitOfAccount
bytes memory initData = abi.encodePacked(
    asset,              // Underlying asset address (20 bytes)
    oracle,             // Price oracle address (20 bytes)
    unitOfAccount       // Unit of account (20 bytes, e.g., USD reference or address(0) for ETH)
);

// Step 4: Create the vault via factory
address vault = GenericFactory(factory).createProxy(
    address(0),  // No specific salt (use msg.sender + nonce)
    true,        // Upgradeable
    initData
);
```

**Correct (configuring vault after deployment):**

```solidity
IEVault vault = IEVault(vaultAddress);

// Set interest rate model
vault.setInterestRateModel(irm);

// Configure LTV for accepted collaterals
// borrowLTV: max LTV for new borrows
// liquidationLTV: LTV at which liquidation can occur
vault.setLTV(
    collateralVault,     // Address of collateral vault
    0.75e4,              // 75% borrow LTV
    0.85e4,              // 85% liquidation LTV
    0                    // No ramp (instant)
);

// Set caps to limit exposure (uint16 AmountCap encoding)
// AmountCap format: 10 bits mantissa + 6 bits exponent
// Use encodeAmountCap helper or pre-calculated values
// Example: supplyCap=7059 ≈ 11e18, borrowCap=38418 ≈ 5e18
vault.setCaps(
    7059,   // ~11e18 supply cap (see AmountCap encoding docs)
    38418   // ~5e18 borrow cap
);
// NOTE: Use VaultLens to decode caps to human-readable amounts

// Set interest fee (protocol revenue)
vault.setInterestFee(0.1e4); // 10% of interest goes to fee receiver

// Set fee receiver
vault.setFeeReceiver(feeRecipient);

// Configure hooks if needed
vault.setHookConfig(hookTarget, hookedOps);
```

**Correct (using EVK deployment scripts):**

```bash
# Clone euler-vault-kit repository
git clone https://github.com/euler-xyz/euler-vault-kit
cd euler-vault-kit

# Configure deployment parameters in script
# See script/deploy.s.sol for full example

# Deploy with Foundry
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

Important considerations:
- Always test on testnet first
- Configure appropriate LTV ratios for risk management
- Set reasonable caps to limit protocol exposure
- Consider using a perspective contract for vault verification
- Governance admin can be set to address(0) for immutability

Reference: [EVK Whitepaper](https://docs.euler.finance/euler-vault-kit-white-paper/)
