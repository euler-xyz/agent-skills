# Euler Finance Agent Skill

Core agent skill for interacting with Euler Finance V2 protocol. This skill provides AI agents and developers with detailed guidance on vault operations, EVC orchestration, risk management, architecture concepts, and security.

## Companion Skills

For specialized topics, see these companion skills:
- **euler-irm-oracles** - Oracle adapters, price resolution, Interest Rate Models
- **euler-swap** - EulerSwap AMM integration
- **euler-earn** - EulerEarn yield aggregation
- **euler-advanced** - Hooks, flash loans, fee flow, rewards
- **euler-data** - Lens contracts, subgraphs, developer tools

## Structure

```
euler-vaults/
├── SKILL.md          # Quick reference with rule IDs and categories
├── AGENTS.md         # Compiled full document (generated)
├── README.md         # This file
├── metadata.json     # Version and metadata
└── rules/            # Individual rule files
    ├── _sections.md  # Category definitions
    ├── vault-*.md    # Vault operations
    ├── evc-*.md      # EVC operations
    ├── risk-*.md     # Risk management
    ├── arch-*.md     # Architecture concepts
    └── sec-*.md      # Security
```

## Categories

| Priority | Category | Prefix | Topics |
|----------|----------|--------|--------|
| 1 | Vault Operations | `vault-` | Get APY, deposit, borrow, repay, create market |
| 2 | EVC Operations | `evc-` | Batch calls, sub-accounts, operators, collateral |
| 3 | Risk Management | `risk-` | Health checks, liquidation, monitoring, curators |
| 4 | Architecture | `arch-` | Market design, vault types (Core, Edge, Escrow) |
| 5 | Security | `sec-` | Audits, best practices, vulnerability disclosure |

## Usage

### For AI Agents

The `AGENTS.md` file contains all rules compiled into a single document, optimized for loading into an AI agent's context. The `SKILL.md` provides a quick reference if the agent needs only specific rules.

### For Developers

Individual rule files in `rules/` provide detailed guidance with:
- Brief explanation of why the rule matters
- **Incorrect** code example showing common mistakes
- **Correct** code example with best practices
- Additional context and references

## Building

The skill includes build tooling in `packages/euler-build/`:

```bash
cd packages/euler-build
pnpm install
pnpm build        # Compile AGENTS.md and extract test cases
pnpm validate     # Validate rule file structure
```

## Key Questions Answered

- **How to get vault APY?** → Use VaultLens.getVaultInfoDynamic()
- **How to create a market?** → Deploy via GenericFactory with IRM and oracle
- **How to batch operations?** → Use EVC.batch() for atomic execution
- **How to check health factor?** → Use AccountLens or vault.checkAccountStatus()
- **What vault types exist?** → Core (governed), Edge (ungoverned), Escrow (collateral-only)
- **What audits has Euler had?** → 10+ audits from Trail of Bits, Spearbit, Certora, etc.

For other topics, see companion skills:
- **Oracle/IRM questions** → euler-irm-oracles
- **Swap questions** → euler-swap
- **Yield aggregation** → euler-earn
- **Hooks/flash loans** → euler-advanced
- **Data querying** → euler-data

## References

- [Euler Documentation](https://docs.euler.finance)
- [Euler Vault Kit](https://github.com/euler-xyz/euler-vault-kit)
- [Ethereum Vault Connector](https://github.com/euler-xyz/ethereum-vault-connector)
- [Euler Price Oracle](https://github.com/euler-xyz/euler-price-oracle)
- [EulerEarn](https://github.com/euler-xyz/euler-earn)
- [EulerSwap](https://github.com/euler-xyz/euler-swap)
- [EVK Periphery](https://github.com/euler-xyz/evk-periphery)

## License

MIT
