# Agent Skills

A collection of skills for AI coding agents. Skills are packaged instructions and scripts that extend agent capabilities.

Skills follow the [Agent Skills format](https://agentskills.io/home).

## Available Skills

### euler-vaults (Core)

Core guide for Euler Finance V2 protocol. Covers vault operations, EVC orchestration, risk management, architecture, and security.

**Use when:** Depositing, borrowing, managing positions, batching with EVC, monitoring health factors, understanding architecture.

**Categories:** Vault Operations, EVC Operations, Risk Management, Architecture, Security

### euler-irm-oracles

Oracle and Interest Rate Model guide. Covers deploying oracle adapters (Chainlink, Pyth, TWAP, etc.), configuring EulerRouter, and IRM types.

**Use when:** Deploying oracle adapters, configuring price feeds, understanding IRM types (Linear Kink, Adaptive Curve).

### euler-swap

EulerSwap AMM integration guide. Covers pool deployment, quotes, liquidity limits, and swap execution.

**Use when:** Deploying EulerSwap pools, getting swap quotes, executing swaps, managing LP positions.

### euler-earn

EulerEarn yield aggregation guide. Covers vault creation, strategy management, roles, and PublicAllocator.

**Use when:** Creating yield aggregation vaults, managing strategies, configuring roles, using PublicAllocator.

### euler-advanced

Advanced features guide. Covers hooks, flash loans, debt transfer, fee flow, and EUL rewards.

**Use when:** Implementing vault hooks, using flash loans, understanding fee flow, working with EUL rewards.

### euler-data

Developer tools and data access guide. Covers Lens contracts, subgraphs, contract interfaces, and deployment tools.

**Use when:** Querying vault data, fetching historical data, looking up addresses/ABIs, using Euler Creator.

## Installation

Install all skills:

```bash
npx add-skill euler-xyz/agent-skills --skill euler-vaults --skill euler-irm-oracles --skill euler-swap --skill euler-earn --skill euler-advanced --skill euler-data
```

Install specific skill(s):

```bash
npx add-skill euler-xyz/agent-skills --skill euler-vaults
npx add-skill euler-xyz/agent-skills --skill euler-vaults --skill euler-irm-oracles
```

Interactive selection (prompts you to choose):

```bash
npx add-skill euler-xyz/agent-skills
```

List available skills:

```bash
npx add-skill euler-xyz/agent-skills --list
```

**Skill guide:**
- `euler-vaults` - Core operations (start here)
- `euler-irm-oracles` - Oracle adapters and Interest Rate Models
- `euler-swap` - EulerSwap AMM integration
- `euler-earn` - Yield aggregation vaults
- `euler-advanced` - Hooks, flash loans, fee flow, rewards
- `euler-data` - Lens contracts, subgraphs, developer tools

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

```
Create an EulerEarn yield aggregation vault
```

## Skill Structure

Each skill contains:

- `SKILL.md` - Quick reference with rule IDs, categories, and companion skill links
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
pnpm build        # Compile AGENTS.md and extract test cases for all skills
pnpm validate     # Validate rule file structure for all skills
```

Build a specific skill:

```bash
pnpm build-agents -- --skill=euler-vaults
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
