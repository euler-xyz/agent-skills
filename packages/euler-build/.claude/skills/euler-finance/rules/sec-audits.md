---
title: Security and Audits
impact: CRITICAL
impactDescription: Understanding security practices and audit coverage
tags: security, audits, bug-bounty, best-practices
---

## Security and Audits

Euler V2 has undergone extensive security audits and maintains an active bug bounty program. Understanding security practices is critical for safe integration.

**Security Audit Coverage:**

Euler V2 has been audited by multiple top-tier security firms:

### Ethereum Vault Connector (EVC)
- Trail of Bits
- OpenZeppelin
- Spearbit
- ChainSecurity
- Omniscia
- Hunter Security
- Certora (formal verification)
- yAudit (code competition)
- Cantina (code competition)

### Euler Vault Kit (EVK)
- Trail of Bits
- Spearbit
- ChainSecurity
- Hunter Security
- yAudit
- Cantina
- Certora (formal verification)

### Euler Price Oracle
- OpenZeppelin
- Spearbit
- ChainSecurity
- Hunter Security
- yAudit

### EulerEarn
- Certora
- Pashov Audit Group
- Sigma Prime

### EulerSwap
- Spearbit
- yAudit
- Hunter Security

**Incorrect (ignoring security considerations):**

```solidity
// WRONG: Using unverified vaults without checks
IEVault vault = IEVault(userProvidedVault);
vault.deposit(amount, receiver); // Could be malicious!
```

**Correct (verifying vault authenticity):**

```solidity
import {GenericFactory} from "evk/GenericFactory/GenericFactory.sol";
import {IPerspective} from "evk-periphery/Perspectives/implementation/interfaces/IPerspective.sol";

// Option 1: Check if deployed by official factory
GenericFactory factory = GenericFactory(EVAULT_FACTORY);
require(factory.isProxy(vaultAddress), "Not EVK vault");

// Option 2: Check if verified by Euler governance
IPerspective governedPerspective = IPerspective(GOVERNED_PERSPECTIVE);
require(governedPerspective.isVerified(vaultAddress), "Not Euler verified");

// Option 3: Check specific perspective based on vault type
IPerspective escrowPerspective = IPerspective(ESCROW_PERSPECTIVE);
bool isEscrow = escrowPerspective.isVerified(vaultAddress);
```

**Correct (safe integration patterns):**

```solidity
// 1. Always use EVC for cross-vault operations
// This ensures proper status checks and atomicity
IEVC evc = IEVC(EVC_ADDRESS);

evc.batch(items); // Atomic, with deferred checks

// 2. Check account health before and after operations
(uint256 collateralValue, uint256 liabilityValue) = 
    IEVault(vault).accountLiquidity(account, false);

// 3. Use approved oracles only
address oracle = IEVault(vault).oracle();
require(isApprovedOracle(oracle), "Unknown oracle");

// 4. Verify IRM is from known factory
address irm = IEVault(vault).interestRateModel();
require(irmRegistry.isRegistered(irm), "Unknown IRM");
```

**Bug Bounty Program:**

Euler maintains bug bounty programs through:
- Immunefi
- Direct security contact: security@euler.xyz

```markdown
Severity Levels:
- Critical: Up to $2,000,000 USD
- High: Up to $100,000 USD
- Medium: Up to $25,000 USD
- Low: Up to $5,000 USD
```

**Security Best Practices:**

```typescript
// 1. Always validate external vault addresses
const isValidVault = async (vault: Address): Promise<boolean> => {
  // Check factory deployment
  const isProxy = await evaultFactory.read.isProxy([vault]);
  if (!isProxy) return false;
  
  // Check perspective verification
  const isVerified = await governedPerspective.read.isVerified([vault]);
  return isVerified;
};

// 2. Monitor for governance changes
const monitorVault = async (vault: Address) => {
  const events = await publicClient.getLogs({
    address: vault,
    event: parseAbiItem('event GovernorAdminSet(address indexed newGovernorAdmin)'),
    fromBlock: 'earliest'
  });
  // Alert on unexpected governor changes
};

// 3. Check for hook configuration
const checkHooks = async (vault: Address) => {
  const [hookTarget, hookedOps] = await evault.read.hookConfig();
  
  if (hookTarget !== zeroAddress) {
    // Vault has custom hooks - verify hook contract
    console.warn('Vault has hooks configured:', hookTarget);
  }
};

// 4. Validate oracle freshness
const checkOracle = async (vault: Address) => {
  const oracle = await evault.read.oracle();
  const price = await eulerRouter.read.getQuote([
    1n * 10n ** 18n,  // 1 unit
    asset,
    unitOfAccount
  ]);
  
  // Verify price is reasonable
  if (price === 0n) {
    throw new Error('Oracle returned zero price');
  }
};
```

**Key Security Considerations:**

| Area | Risk | Mitigation |
|------|------|------------|
| Vault authenticity | Fake vault contracts | Verify via factory/perspective |
| Oracle manipulation | Price feed attacks | Use Euler-verified oracles |
| Governance changes | Malicious parameter updates | Monitor events, use timelocks |
| Hook exploitation | Custom logic vulnerabilities | Audit hook contracts |
| Flash loan attacks | Price manipulation | Deferred liquidity checks |
| Reentrancy | State corruption | Built-in reentrancy guards |

**Formal Verification:**

Euler uses Certora for formal verification of critical invariants:
- EVC: Account/operator relationships, collateral/controller consistency
- EVault: Share/asset accounting, liquidation mechanics
- EulerEarn: Strategy allocation, share calculations

Reference: [Euler Security](https://docs.euler.finance/security/audits), [EVC Audits](https://github.com/euler-xyz/ethereum-vault-connector/tree/master/audits), [EVK Audits](https://github.com/euler-xyz/euler-vault-kit/tree/master/audits)
