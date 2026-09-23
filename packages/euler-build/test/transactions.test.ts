import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import ts from 'typescript'
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData, maxUint256, parseAbi, parseEventLogs, type Address, type Hex } from 'viem'
import { eVaultAbi } from '@eulerxyz/euler-v2-sdk'
import { parseRuleFile } from '../src/parser.js'
import { SKILLS_BASE_DIR } from '../src/config.js'

const owner = '0x0000000000000000000000000000000000000010' as Address
const position = '0x0000000000000000000000000000000000000011' as Address
const destination = '0x0000000000000000000000000000000000000012' as Address
const vault = '0x0000000000000000000000000000000000000100' as Address
const factory = '0x0000000000000000000000000000000000000200' as Address
const created = '0x0000000000000000000000000000000000000300' as Address
const hash = `0x${'ab'.repeat(32)}` as Hex
const quiet = { log() {} }

// Execute the actual educational fragment with explicit local adapters. No RPC or wallet.
async function runFragment(skill: string, file: string, match: string, context: Record<string, unknown>) {
  const { rule } = await parseRuleFile(join(SKILLS_BASE_DIR, skill, 'rules', file), skill)
  const fragment = rule.examples.find(example => example.code.includes(match))
  assert.ok(fragment, `Missing fragment ${file}: ${match}`)
  const source = fragment.code.replace(/^import .*;\n/gm, '')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  await new AsyncFunction(...Object.keys(context), code)(...Object.values(context))
}

test('sub-account rebalancing transfers shares in the source account context', async () => {
  let captured: any
  await runFragment('euler-vaults', 'evc-sub-accounts.md', 'const subAccount0', {
    account: owner, getSubAccount: (_owner: Address, id: number) => id === 0 ? position : destination,
    sharesToMove: 42n, collateralVault: vault, encodeFunctionData, eVaultABI: eVaultAbi,
    evc: { write: { batch: async (args: unknown) => { captured = args } } },
  })
  assert.equal(captured.length, 1)
  assert.equal(captured[0].length, 1)
  assert.equal(captured[0][0].onBehalfOfAccount, position)
  const call = decodeFunctionData({ abi: eVaultAbi, data: captured[0][0].data })
  assert.equal(call.functionName, 'transfer')
  assert.deepEqual(call.args, [destination, 42n])
})

test('full exit repays from the wallet, then redeems shares to the wallet', async () => {
  let captured: any
  await runFragment('euler-vaults', 'risk-check-health.md', 'const batchItems:', {
    account: position, ownerAddress: owner, controllerVault: vault, collateralVault: destination,
    MaxUint256: maxUint256, encodeFunctionData, evaultABI: eVaultAbi,
    evc: { write: { batch: async (args: unknown) => { captured = args } } },
  })
  const items = captured[0]
  assert.equal(items.length, 3)
  assert.deepEqual(items.map((item: any) => item.onBehalfOfAccount), [owner, position, position])
  const calls = items.map((item: any) => decodeFunctionData({ abi: eVaultAbi, data: item.data }))
  assert.deepEqual(calls.map((call: any) => call.functionName), ['repay', 'disableController', 'redeem'])
  assert.deepEqual(calls[0].args, [maxUint256, position])
  assert.deepEqual(calls[2].args, [maxUint256, owner, position])
})

test('Pyth uses hex updates, authenticated context, and the single array argument', async () => {
  const pythABI = parseAbi(['function updatePriceFeeds(bytes[] updateData) payable'])
  let captured: any
  await runFragment('euler-irm-oracles', 'oracle-deploy.md', 'async function getPythUpdateData', {
    fetch: async (url: string) => {
      assert.equal(new URL(url).pathname, '/v2/updates/price/latest')
      assert.equal(new URL(url).searchParams.get('encoding'), 'hex')
      return { ok: true, json: async () => ({ binary: { encoding: 'hex', data: ['abcd'] } }) }
    },
    encodeFunctionData, pythABI, evaultABI: eVaultAbi, priceFeedId: 'feed', pythAddress: factory,
    vaultAddress: vault, ownerAddress: owner, account: position, amount: 5n,
    pythContract: { read: { getUpdateFee: async (args: unknown) => { assert.deepEqual(args, [['0xabcd']]); return 7n } } },
    evc: { write: { batch: async (args: unknown, options: unknown) => { captured = { args, options } } } },
  })
  assert.deepEqual(captured.options, { value: 7n })
  const items = captured.args[0]
  assert.equal(items[0].onBehalfOfAccount, owner)
  assert.equal(items[0].value, 7n)
  assert.deepEqual(decodeFunctionData({ abi: pythABI, data: items[0].data }).args, [['0xabcd']])
  assert.deepEqual(decodeFunctionData({ abi: eVaultAbi, data: items[1].data }).args, [5n, owner])
})

const eulerEarnFactoryABI = parseAbi(['event CreateEulerEarn(address indexed eulerEarn, address indexed caller, address initialOwner, uint256 initialTimelock, address indexed asset, string name, string symbol, bytes32 salt)'])
const eulerEarnABI = parseAbi(['function setFeeRecipient(address)', 'function setFee(uint256)', 'function setCurator(address)', 'function submitGuardian(address)'])

test('Earn creation derives the address from a successful factory receipt before setup', async () => {
  const log = {
    address: factory,
    topics: encodeEventTopics({ abi: eulerEarnFactoryABI, eventName: 'CreateEulerEarn', args: { eulerEarn: created, caller: owner, asset: vault } }),
    data: encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'string' }, { type: 'string' }, { type: 'bytes32' }], [owner, 0n, 'Euler USDC Earn', 'eUSDC', `0x${'00'.repeat(32)}`]),
  }
  const sends: any[] = []
  let receiptReads = 0
  await runFragment('euler-earn', 'earn-create-vault.md', 'const creationHash', {
    encodeFunctionData, parseEventLogs, eulerEarnFactoryABI, eulerEarnABI,
    ownerAddress: owner, usdcAddress: vault, treasuryAddress: owner, curatorAddress: owner, guardianAddress: owner,
    eulerEarnFactory: { address: factory, write: { createEulerEarn: async () => hash } },
    publicClient: { waitForTransactionReceipt: async () => { receiptReads++; return { status: 'success', logs: [{ ...log, address: destination }, log] } } },
    ownerWallet: { sendTransaction: async (tx: unknown) => { sends.push(tx); return hash } },
  })
  assert.equal(sends.length, 4)
  assert.ok(sends.every(tx => tx.to === created && tx.to !== hash))
  assert.equal(receiptReads, 5)
  assert.deepEqual(decodeFunctionData({ abi: eulerEarnABI, data: sends[1].data }).args, [100_000_000_000_000_000n])
})

test('share repayment distinguishes simulation output, transaction hash, and confirmed state', async () => {
  let confirmed = false
  await runFragment('euler-vaults', 'vault-repay.md', 'predictedSharesBurned', {
    vaultAddress: vault, ownerAddress: owner, MaxUint256: maxUint256, evaultABI: eVaultAbi, console: quiet,
    publicClient: {
      simulateContract: async () => ({ request: { address: vault }, result: [5n, 10n] }),
      waitForTransactionReceipt: async (arg: any) => { assert.equal(arg.hash, hash); confirmed = true; return { status: 'success' } },
      readContract: async () => { assert.ok(confirmed); return 0n },
    },
    walletClient: { writeContract: async () => hash },
  })
  assert.ok(confirmed)
})
