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
// Using EulerKinkIRMFactory - kink is uint32 on type(uint32).max scale
address irm = EulerKinkIRMFactory(kinkIRMFactory).deploy(
    0,            // baseRate: 0% at 0 utilization
    1406417851,   // slope1: ~10% APY at kink (in SPY)
    19050045013,  // slope2: ~300% APY at 100% utilization (in SPY)
    3865470566    // kink: 90% utilization (type(uint32).max * 9 / 10)
);
// See irm-models rule for detailed IRM configuration

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
// AmountCap format: upper 10 bits mantissa + lower 6 bits exponent
// Formula: 10^exponent * mantissa / 100
// Encoding: (mantissa << 6) | exponent
//
// IMPORTANT: Caps are in raw token units - you MUST account for decimals!
//
// Special values:
//   - 0: NO CAP (unlimited) - uninitialized storage default
//   - 1: ZERO CAP (blocks all deposits/borrows) - mantissa=0, exp=1
//
// For 18-decimal tokens (ETH, DAI, etc.):
//   - 100 tokens = 100e18:  exp=20, mantissa=100 → (100 << 6) | 20 = 6420
//   - 1000 tokens = 1000e18: exp=21, mantissa=100 → (100 << 6) | 21 = 6421
//
// For 6-decimal tokens (USDC, USDT, etc.):
//   - 100 tokens = 100e6:   exp=8, mantissa=100 → (100 << 6) | 8 = 6408
//   - 1000 tokens = 1000e6: exp=9, mantissa=100 → (100 << 6) | 9 = 6409
//   - 1M tokens = 1e12:     exp=12, mantissa=100 → (100 << 6) | 12 = 6412
//
// For 8-decimal tokens (WBTC):
//   - 100 tokens = 100e8:   exp=10, mantissa=100 → (100 << 6) | 10 = 6410

// Example: 18-decimal token vault
vault.setCaps(
    6420,   // 100 tokens supply cap (100e18 for 18-decimal token)
    6419    // 10 tokens borrow cap (10e18 for 18-decimal token)
);

// Example: 6-decimal token vault (USDC)
// vault.setCaps(6412, 6411);  // 1M supply cap, 100k borrow cap

// Zero caps work the same for ANY token (6, 8, or 18 decimals):
// The value 1 always resolves to 0 (mantissa=0, exp=1 → 10^1 * 0 / 100 = 0)

vault.setCaps(0, 1);  // Disable borrowing: unlimited supply, zero borrow cap
vault.setCaps(1, 0);  // Disable deposits: zero supply cap, unlimited borrow  
vault.setCaps(1, 1);  // Disable both: zero supply cap, zero borrow cap

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
