---
title: Security and Audits
impact: CRITICAL
impactDescription: Understanding security practices and audit coverage
tags: security, audits, bug-bounty, best-practices
---

## Security and Audits

Euler V2 has undergone extensive security audits and maintains an active bug bounty program. See [Euler Security](https://docs.euler.finance/security/audits) for full audit reports.

**Incorrect (ignoring security considerations):**

```solidity
// WRONG: Using unverified vaults without checks
IEVault vault = IEVault(userProvidedVault);
vault.deposit(amount, receiver); // Could be malicious!
```

**Correct (verifying vault authenticity):**

```solidity
import {GenericFactory} from "evk/GenericFactory/GenericFactory.sol";

// Check if deployed by official factory (confirms it's a real EVK vault)
GenericFactory factory = GenericFactory(EVAULT_FACTORY);
require(factory.isProxy(vaultAddress), "Not EVK vault");

// Factory provenance does not establish safe governance, collateral, or pricing.
// Check the current implementation and configuration separately.

// IMPORTANT: Users should only interact with vaults they trust
// - Verify the governor address and who controls it
// - Monitor for parameter changes (LTV, caps, oracle, IRM)
// - Assess the risk manager's reputation and track record
```

**Security Best Practices:**

```typescript
// 1. Validate vault is from official factory
const isEVKVault = async (vault: Address): Promise<boolean> => {
  return await evaultFactory.read.isProxy([vault]);
};

// 2. Check who controls the vault (critical!)
const checkGovernance = async (vault: Address) => {
  const governor = await publicClient.readContract({
    address: vault, abi: evaultABI, functionName: 'governorAdmin',
  });

  if (governor === zeroAddress) {
    console.log('Ungoverned vault - parameters are immutable');
  } else {
    // IMPORTANT: Verify you trust this governor!
    // Could be EOA, multisig, DAO, or limited steward contract
    console.log('Governor:', governor);
    // Research: Who controls this address? What's their track record?
  }
};

// 3. Check current configuration matches your expectations
const verifyConfig = async (vault: Address) => {
  const evault = getContract({ address: vault, abi: evaultABI, client: publicClient });
  const oracle = await evault.read.oracle();
  const irm = await evault.read.interestRateModel();
  const [hookTarget, hookedOps] = await evault.read.hookConfig();
  const [supplyCap, borrowCap] = await evault.read.caps();

  // Verify these match what you expect for this vault
  console.log('Oracle:', oracle);
  console.log('IRM:', irm);
  console.log('Hooks:', hookTarget, hookedOps);
};
```

**Evaluating Collateral Quality (Critical for Lenders):**

When depositing into a vault, you're exposed to the collateral assets that borrowers can use. Assess:
- **What collaterals are accepted?** Check `LTVList()` for all configured collaterals
- **Are these assets trustworthy?** Consider token contract risk, liquidity, price stability
- **Are the LTVs appropriate?** Higher LTV = more risk for lenders if collateral drops
- **Is the oracle reliable?** Bad price feeds can lead to undercollateralized loans

```typescript
// Check what collaterals a vault accepts and their LTVs
const collaterals = await vault.read.LTVList();
for (const collateral of collaterals) {
  const [borrowLTV, liqLTV] = await vault.read.LTVFull([collateral]);
  const collateralAsset = await publicClient.readContract({
    address: collateral, abi: evaultABI, functionName: 'asset',
  });
  console.log(`Collateral: ${collateralAsset}, Borrow LTV: ${borrowLTV/100}%`);
  // Research: Is this a safe, liquid asset? Do you trust it?
}
```

**Key Security Considerations:**

| Area | Risk | Mitigation |
|------|------|------------|
| Collateral quality | Bad debt from risky assets | Review accepted collaterals and their LTVs |
| Vault authenticity | Fake vault contracts | Verify via factory (`isProxy`) |
| Governor trust | Malicious parameter changes | Only use vaults with trusted governors |
| Oracle manipulation | Price feed attacks | Verify oracle source and configuration |
| Governance changes | Unexpected LTV/cap/IRM updates | Monitor events, verify governor identity |
| Hook exploitation | Custom logic vulnerabilities | Check hook configuration before use |

Factory provenance identifies a deployment; it is not a risk endorsement. Verify the implementation, current configuration, governor permissions, oracle dependencies, and accepted collateral before depositing. The maintained escrow perspective checks collateral-only properties; governance status is a separate on-chain read.

Reference: [Euler Security](https://docs.euler.finance/security/audits), [EVC Audits](https://github.com/euler-xyz/ethereum-vault-connector/tree/master/audits), [EVK Audits](https://github.com/euler-xyz/euler-vault-kit/tree/master/audits)
