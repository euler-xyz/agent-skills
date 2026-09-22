import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ts from 'typescript'
import { SKILL_NAMES } from '../src/config.js'
import { loadSkill } from '../src/build.js'

const examples = new Map<string, string>()
for (const name of SKILL_NAMES) {
  const skill = await loadSkill(name)
  for (const rule of skill.sections.flatMap(s => s.rules)) {
    for (const match of rule.body.matchAll(/<!-- checked-example: ([\w-]+) -->\s*```typescript\n([\s\S]*?)\n```/g)) {
      assert.ok(!examples.has(match[1]), `Duplicate checked example: ${match[1]}`)
      examples.set(match[1], match[2])
    }
  }
}

test('marked documentation examples compile against the exact published SDK', async () => {
  for (const required of ['sdk-build', 'sdk-cache', 'sdk-execution', 'account-read', 'interface-services', 'earn-targets', 'sdk-simulation', 'sdk-plugins']) assert.ok(examples.has(required), `Missing example ${required}`)
  const provenance = JSON.parse(await readFile(new URL('../../../sources.json', import.meta.url), 'utf8'))
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.devDependencies[provenance.sdk.package], provenance.sdk.version)
  const virtual = new Map([...examples].map(([id, code]) => [join(process.cwd(), '.checked-examples', `${id}.ts`), code]))
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true }
  const host = ts.createCompilerHost(options)
  const original = host.getSourceFile.bind(host)
  host.getSourceFile = (file, language, onError, fresh) => virtual.has(file) ? ts.createSourceFile(file, virtual.get(file)!, language, true) : original(file, language, onError, fresh)
  const program = ts.createProgram([...virtual.keys()], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => process.cwd(), getCanonicalFileName: f => f, getNewLine: () => '\n' }))
})

async function loadExample(id: string) {
  const code = examples.get(id)
  assert.ok(code, `Missing checked example ${id}`)
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/from (["'])([^"']+)\1/g, (_all, _quote, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`)
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

test('cache handles bigint arguments, deduplicates calls, and honors null bypass', async () => {
  const { buildQuery } = await loadExample('sdk-cache')
  let calls = 0
  const fetcher = async (value: bigint) => { calls++; return value + 1n }
  const cached = buildQuery('queryExample', fetcher, {})
  assert.deepEqual(await Promise.all([cached(2n), cached(2n)]), [3n, 3n])
  assert.equal(calls, 1)
  assert.equal(await cached(3n), 4n)
  assert.equal(calls, 2)
  const uncached = buildQuery('queryCursorPage', fetcher, {}, { getCacheKey: () => null })
  await uncached(2n)
  await uncached(2n)
  assert.equal(calls, 4)
})

test('Earn targets respect asset balances, liquidity, and destination capacity', async () => {
  const { reallocationTargets: targets } = await loadExample('earn-targets')
  // 50 tracked shares worth 100 assets: targets use the 100-asset value.
  assert.deepEqual(targets(80n, 100n, 30n, 20n, 60n, 100n), { amount: 30n, sourceTarget: 70n, targetTarget: 50n })
  assert.deepEqual(targets(80n, 100n, 90n, 20n, 25n, 100n), { amount: 5n, sourceTarget: 95n, targetTarget: 25n })
  assert.equal(targets(80n, 100n, 90n, 20n, 100n, 7n).amount, 7n)
  assert.equal(targets(80n, 100n, 0n, 20n, 100n, 100n).amount, 0n)
  assert.equal(targets(80n, 100n, 90n, 20n, 10n, 100n).amount, 0n)
  assert.equal(targets(80n, 10n, 90n, 20n, 100n, 100n).sourceTarget, 0n)
  assert.throws(() => targets(-1n, 100n, 90n, 20n, 100n, 100n), /Negative/)
})
