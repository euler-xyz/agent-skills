# Euler Finance Agent Skill

A comprehensive agent skill for interacting with Euler Finance V2 protocol. This skill provides AI agents and developers with detailed guidance on vault operations, EVC orchestration, risk management, oracle integration, yield aggregation, and AMM swaps.

## Structure

```
euler-finance/
├── SKILL.md          # Quick reference with rule IDs and categories
├── AGENTS.md         # Compiled full document (generated)
├── README.md         # This file
├── metadata.json     # Version and metadata
└── rules/            # Individual rule files
    ├── _sections.md  # Category definitions
    ├── vault-*.md    # Vault operations
    ├── evc-*.md      # EVC operations
    ├── risk-*.md     # Risk management
    ├── oracle-*.md   # Oracle integration
    ├── arch-*.md     # Architecture concepts
    ├── irm-*.md      # Interest rate models
    ├── adv-*.md      # Advanced features
    ├── sec-*.md      # Security
    ├── tools-*.md    # Developer tools
    ├── earn-*.md     # EulerEarn
    └── swap-*.md     # EulerSwap
```

## Categories

| Priority | Category | Prefix | Topics |
|----------|----------|--------|--------|
| 1 | Vault Operations | `vault-` | Get APY, deposit, borrow, repay, create market |
| 2 | EVC Operations | `evc-` | Batch calls, sub-accounts, operators, collateral |
| 3 | Risk Management | `risk-` | Health checks, liquidation, monitoring, curators |
| 4 | Oracle Integration | `oracle-` | Deploy adapters, configure router, get prices |
| 5 | Architecture | `arch-` | Market design, vault types (Core, Edge, Escrow) |
| 6 | Interest Rate Models | `irm-` | Linear Kink, Adaptive Curve, Fixed Cyclical |
| 7 | Advanced Features | `adv-` | Hooks, fee flow, EUL rewards |
| 8 | Security | `sec-` | Audits, best practices, vulnerability disclosure |
| 9 | Developer Tools | `tools-` | Addresses, ABIs, subgraphs, creator tools |
| 10 | EulerEarn | `earn-` | Create vaults, manage strategies |
| 11 | EulerSwap | `swap-` | Quote, execute swaps, check liquidity |

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
- **How to deploy an oracle?** → Use ChainlinkOracle, PythOracle, or UniswapV3Oracle
- **How to batch operations?** → Use EVC.batch() for atomic execution
- **How to check health factor?** → Use AccountLens or vault.checkAccountStatus()
- **How to execute swaps?** → Use EulerSwap.computeQuote() then swap()
- **What vault types exist?** → Core (governed), Edge (ungoverned), Escrow (collateral-only)
- **Which IRM should I use?** → Adaptive Curve for volatile assets, Linear Kink for stable
- **How do hooks work?** → Vault calls hook target before hooked operations
- **Where are contract addresses?** → euler-interfaces package has all chain addresses
- **How to query historical data?** → Use Euler subgraphs (The Graph)
- **What audits has Euler had?** → 10+ audits from Trail of Bits, Spearbit, Certora, etc.

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
