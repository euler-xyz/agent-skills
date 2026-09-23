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

### euler-earn

EulerEarn yield aggregation guide. Covers vault creation, strategy management, roles, and PublicAllocator.

**Use when:** Creating yield aggregation vaults, managing strategies, configuring roles, using PublicAllocator.

### euler-advanced

Advanced features guide. Covers hooks, flash loans, debt transfer, fee flow, and EUL rewards.

**Use when:** Implementing vault hooks, using flash loans, understanding fee flow, working with EUL rewards.

### euler-data

Developer tools and data access guide. Covers Lens contracts, subgraphs, contract interfaces, and deployment tools.

**Use when:** Querying vault data, fetching historical data, looking up addresses/ABIs, using Euler Creator.

### euler-sdk

Integration guide for `@eulerxyz/euler-v2-sdk@3.4.0`. Covers service reads, prepared/materialized execution, simulation, CoW swaps, migrations, plugins, fallback adapters, and query caching.

**Use when:** Building applications, scripts, or bots with the TypeScript SDK. Skill versions are independent of the SDK package version.

## Installation

Install all skills:

```bash
npx skills add euler-xyz/agent-skills --skill euler-vaults --skill euler-irm-oracles --skill euler-earn --skill euler-advanced --skill euler-data --skill euler-sdk
```

Install specific skill(s):

```bash
npx skills add euler-xyz/agent-skills --skill euler-vaults
npx skills add euler-xyz/agent-skills --skill euler-vaults --skill euler-irm-oracles
```

Interactive selection (prompts you to choose):

```bash
npx skills add euler-xyz/agent-skills
```

List available skills:

```bash
npx skills add euler-xyz/agent-skills --list
```

**Skill guide:**
- `euler-vaults` - Core operations (start here)
- `euler-irm-oracles` - Oracle adapters and Interest Rate Models
- `euler-earn` - Yield aggregation vaults
- `euler-advanced` - Hooks, flash loans, fee flow, rewards
- `euler-data` - SDK/Data V3 routing, Lens contracts, subgraphs, developer tools
- `euler-sdk` - TypeScript SDK integration

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
- Labeled examples where code clarifies the rule; procedural rules may be prose-only
- Deliberately incorrect examples clearly marked as such
- Additional context and references

## Building

The repository includes build tooling for compiling skills:

```bash
cd packages/euler-build
pnpm install --frozen-lockfile --ignore-scripts
pnpm validate         # Validate every skill's rules and metadata
pnpm typecheck        # Check the build tooling
pnpm test             # Run parser and representative documentation regressions
pnpm build            # Regenerate all six AGENTS.md files and evaluation cases
pnpm check-generated  # Fail on stale generated files without writing
```

Build a specific skill:

```bash
pnpm build-agents -- --skill=euler-vaults
```

### Maintenance and verification

Euler Labs maintains these guides. [sources.json](sources.json) records the SDK version and contract revisions used for the current refresh. Use the maintained deployment/ABI services or canonical interfaces repository for chain addresses; this repository does not bundle an address snapshot.

When updating a skill:

1. Compare its guidance against the published SDK types and the relevant contract revision; update the provenance record.
2. Edit `rules/`, `SKILL.md`, and `metadata.json`, keeping the two skill-version fields equal.
3. Update the marked executable examples and regression tests for changed APIs or transaction behavior.
4. Run the checks above, review the generated guides, and commit generated output with its sources.

CI runs on every PR and main-branch push. `test-cases.json` is an LLM evaluation catalog, not the executable test suite. The tests compile marked TypeScript examples against the pinned SDK and exercise parser preservation, bigint caching, transaction encoding, receipt parsing, and Earn allocation bounds. Educational fragments and deliberately incorrect snippets are not all compiled; these checks do not establish live-chain or fork execution success.

With Foundry installed, `pnpm test:solidity` extracts the operator example, downloads the three interfaces pinned in `sources.json`, and checks owner authorization and recipient/account encoding in a local mock harness. This optional check requires network access and is separate from the Node-only CI suite.

Build tooling requires Node.js 22 or newer and pnpm 10.33.2. To extract a single skill, use `pnpm extract-tests -- --skill=euler-sdk`; this writes a separate ignored catalog without replacing the combined one.

## References

- [Euler Documentation](https://docs.euler.finance)
- [Euler Vault Kit](https://github.com/euler-xyz/euler-vault-kit)
- [Ethereum Vault Connector](https://github.com/euler-xyz/ethereum-vault-connector)
- [Euler Price Oracle](https://github.com/euler-xyz/euler-price-oracle)
- [EulerEarn](https://github.com/euler-xyz/euler-earn)

## License

MIT
