---
title: Creator Tools and Deployment Resources
impact: MEDIUM
impactDescription: Tools for deploying and managing Euler vaults
tags: tools, deployment, scripts, no-code, creator
---

## Creator Tools and Deployment Resources

Euler provides multiple tools for creating and managing vaults, from no-code platforms to scripting libraries.

**Available Creator Tools:**

### 1. Euler Create (No-Code Platform)

A bare-bones no-code platform for creating and managing lending vaults on Euler.

```markdown
URL: https://create.euler.finance

Features:
- Deploy new vaults without writing code
- Configure IRM, oracle, and LTV settings
- Manage existing vault parameters
- View vault analytics

Best for: Non-technical users, quick prototyping
```

### 2. Oracle Deployer

Tool for deploying and managing price oracles for Euler markets.

```markdown
Features:
- Deploy Chainlink adapter oracles
- Deploy Pyth adapter oracles
- Deploy Uniswap TWAP oracles
- Configure EulerRouter price paths
```

### 3. Euler Vault Scripts

Collection of scripts for deploying, configuring, and managing vault clusters.

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

**Correct (deploying vault via script):**

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

**Correct (using EdgeFactory for ungoverned vaults):**

```solidity
import {IEdgeFactory} from "evk-periphery/EdgeFactory/interfaces/IEdgeFactory.sol";

// Edge vaults have governance permanently renounced
IEdgeFactory.VaultParams[] memory vaults = new IEdgeFactory.VaultParams[](2);

// Collateral vault (escrow)
vaults[0] = IEdgeFactory.VaultParams({
    asset: wethAddress,
    irm: address(0),  // No IRM for escrow
    escrow: true
});

// Borrow vault
vaults[1] = IEdgeFactory.VaultParams({
    asset: usdcAddress,
    irm: kinkIrmAddress,
    escrow: false
});

// Oracle configuration
IEdgeFactory.AdapterParams[] memory adapters = new IEdgeFactory.AdapterParams[](2);
adapters[0] = IEdgeFactory.AdapterParams({
    base: wethAddress,
    adapter: ethUsdAdapter
});
adapters[1] = IEdgeFactory.AdapterParams({
    base: usdcAddress,
    adapter: usdcUsdAdapter
});

// LTV configuration
IEdgeFactory.LTVParams[] memory ltv = new IEdgeFactory.LTVParams[](1);
ltv[0] = IEdgeFactory.LTVParams({
    collateralVaultIndex: 0,   // WETH vault
    controllerVaultIndex: 1,   // USDC vault
    borrowLTV: 0.75e4,         // 75%
    liquidationLTV: 0.85e4     // 85%
});

IEdgeFactory.DeployParams memory params = IEdgeFactory.DeployParams({
    vaults: vaults,
    router: IEdgeFactory.RouterParams({
        externalResolvedVaults: new address[](0),
        adapters: adapters
    }),
    ltv: ltv,
    unitOfAccount: usdAddress
});

// Deploy - governance is renounced automatically
(address router, address[] memory deployedVaults) = edgeFactory.deploy(params);
```

**TypeScript: Using euler-interfaces package:**

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

Reference: [Euler Vault Scripts](https://github.com/euler-xyz/euler-vault-scripts), [Euler Create](https://create.euler.finance)
