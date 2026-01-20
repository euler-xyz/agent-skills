# Agent Skills

A collection of skills for AI coding agents. Skills are packaged instructions and scripts that extend agent capabilities.

Skills follow the [Agent Skills format](https://agentskills.io/home).

## Available Skills

### euler-finance

Comprehensive guide for interacting with Euler Finance V2 protocol. Contains 30+ rules across 11 categories covering vault operations, EVC orchestration, risk management, oracle integration, yield aggregation, and AMM swaps.

**Use when:**

- Depositing, borrowing, or managing positions on Euler vaults
- Batching operations via the Ethereum Vault Connector (EVC)
- Monitoring health factors and liquidation risk
- Deploying or configuring price oracles
- Creating or managing EulerEarn yield aggregation vaults
- Integrating with EulerSwap for token swaps

**Categories covered:**

- Vault Operations (Critical) - deposit, borrow, repay, get APY
- EVC Operations (Critical) - batch calls, sub-accounts, operators
- Risk Management (High) - health checks, liquidation, monitoring
- Oracle Integration (High) - adapters, routing, price feeds
- Architecture (High) - market design, vault types
- Interest Rate Models (High) - Linear Kink, Adaptive Curve
- Advanced Features (Medium) - hooks, fee flow, EUL rewards
- Security (Critical) - audits, best practices
- Developer Tools (Medium) - addresses, ABIs, subgraphs
- EulerEarn (Medium) - yield aggregation vaults
- EulerSwap (Medium) - AMM integration

## Installation

```bash
npx add-skill euler-xyz/agent-skills --skill euler-finance
```

Or clone the repository directly:

```bash
git clone https://github.com/euler-xyz/agent-skills.git
```

## Usage

Skills are automatically available once installed. The agent will use them when relevant tasks are detected.

**Examples:**

```
How do I deposit into an Euler vault?
```

```
Check the health factor of my position
```

```
Help me batch multiple operations with EVC
```

```
Deploy a Chainlink oracle adapter
```

## Skill Structure

Each skill contains:

- `SKILL.md` - Quick reference with rule IDs and categories
- `AGENTS.md` - Compiled full document for AI agent context
- `rules/` - Individual rule files with detailed guidance
- `metadata.json` - Version and metadata

### Rule File Format

Each rule file in `rules/` contains:

- Brief explanation of why the rule matters
- **Incorrect** code example showing common mistakes
- **Correct** code example with best practices
- Additional context and references

## Building

The repository includes build tooling for compiling skills:

```bash
cd packages/euler-build
pnpm install
pnpm build        # Compile AGENTS.md and extract test cases
pnpm validate     # Validate rule file structure
```

## References

- [Euler Documentation](https://docs.euler.finance)
- [Euler Vault Kit](https://github.com/euler-xyz/euler-vault-kit)
- [Ethereum Vault Connector](https://github.com/euler-xyz/ethereum-vault-connector)
- [Euler Price Oracle](https://github.com/euler-xyz/euler-price-oracle)
- [EulerEarn](https://github.com/euler-xyz/euler-earn)
- [EulerSwap](https://github.com/euler-xyz/euler-swap)

## License

MIT
