import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { getSkillPaths } from './config.js'

// Optional local check: requires forge and network access to the pinned interfaces.
const sources = JSON.parse(await readFile(new URL('../../../sources.json', import.meta.url), 'utf8'))
const root = await mkdtemp(join(tmpdir(), 'euler-operator-'))
try {
  const rule = await readFile(join(getSkillPaths('euler-vaults').rulesDir, 'evc-operators.md'), 'utf8')
  const code = rule.match(/<!-- checked-solidity: owner-withdraw-operator -->\s*```solidity\n([\s\S]*?)\n```/)?.[1]
  if (!code) throw new Error('Missing operator example')
  await mkdir(join(root, 'src'))
  await mkdir(join(root, 'test'))
  await writeFile(join(root, 'src/OwnerWithdrawOperator.sol'), '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n' + code + '\n')
  await copyFile(new URL('../test/fixtures/Operator.t.sol', import.meta.url), join(root, 'test/Operator.t.sol'))
  for (const [repository, path, local] of [
    ['ethereum-vault-connector', 'src/interfaces/IEthereumVaultConnector.sol', 'evc/interfaces/IEthereumVaultConnector.sol'],
    ['ethereum-vault-connector', 'src/interfaces/IVault.sol', 'evc/interfaces/IVault.sol'],
    ['euler-vault-kit', 'src/EVault/IEVault.sol', 'evk/EVault/IEVault.sol'],
  ]) {
    const source = sources.contracts.find((entry: { repository: string }) => entry.repository === `https://github.com/euler-xyz/${repository}`)
    if (!source || !/^[0-9a-f]{40}$/.test(source.commit)) throw new Error(`Missing pinned source: ${repository}`)
    const response = await fetch(`https://raw.githubusercontent.com/euler-xyz/${repository}/${source.commit}/${path}`)
    if (!response.ok) throw new Error(`Interface fetch failed: ${response.status} ${path}`)
    const target = join(root, local)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, await response.text())
  }
  await writeFile(join(root, 'foundry.toml'), '[profile.default]\nsolc="0.8.24"\nlibs=[]\nremappings=["ethereum-vault-connector/=evc/", "evk/=evk/"]\n')
  const result = spawnSync('forge', ['test', '--root', root, '-vv'], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Solidity checks failed (${result.status})`)
} finally { await rm(root, { recursive: true, force: true }) }
