import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseRule } from '../src/parser.js'
import { generateMarkdown, loadSkill, nestHeadings } from '../src/build.js'
import { selectedSkills, SKILL_NAMES } from '../src/config.js'
import { writeOrCheck } from '../src/output.js'

const frontmatter = '---\ntitle: Preserve examples\nimpact: HIGH\n---\n\n## Preserve examples\n\n'

test('preserves every fenced example, trailing prose, tables, and references', () => {
  const body = 'Explanation.\n\n**Correct:**\n\n```ts\nconst first = 1\n```\n\nAnother example.\n\n```ts\nconst second = 2\n```\n\n### Details\n\n~~~md\n# Do not shift code\n~~~\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nReference: [Source](https://example.com)'
  const { rule } = parseRule(frontmatter + body, 'sdk-demo.md', 'euler-sdk')
  assert.equal(rule.body, body)
  assert.deepEqual(rule.examples.map(e => e.code), ['const first = 1', 'const second = 2', '# Do not shift code'])
  assert.equal(rule.examples[2].label, 'Example')
  const nested = nestHeadings(body)
  assert.ok(nested.includes('#### Details'))
  assert.ok(nested.includes('~~~md\n# Do not shift code\n~~~'))
  assert.ok(nested.endsWith('Reference: [Source](https://example.com)'))
})

test('rejects malformed source instead of silently omitting it', () => {
  assert.throws(() => parseRule(frontmatter + '```ts\nconst a=1', 'bad.md'), /unclosed/)
  assert.throws(() => parseRule('## Missing metadata', 'bad.md'), /frontmatter/)
  assert.throws(() => selectedSkills(['--skill=typo']), /Unknown skill/)
  assert.throws(() => selectedSkills(['--skil=euler-sdk']), /Unknown argument/)
})

test('all discovered skills, including SDK, preserve all rule bodies in generation', async () => {
  assert.ok(SKILL_NAMES.includes('euler-sdk'))
  assert.equal(SKILL_NAMES.length, 6)
  for (const name of SKILL_NAMES) {
    const skill = await loadSkill(name)
    const output = generateMarkdown(skill)
    const ids = new Set<string>()
    for (const rule of skill.sections.flatMap(s => s.rules)) {
      assert.ok(output.includes(nestHeadings(rule.body)), `${name}/${rule.id}: lost Markdown`)
      assert.ok(!ids.has(rule.id), `Duplicate ID ${rule.id}`)
      ids.add(rule.id)
      for (const example of rule.examples) assert.ok(output.includes(example.code))
    }
  }
})

test('check mode detects drift and never rewrites output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'euler-build-'))
  try {
    const path = join(directory, 'AGENTS.md')
    await assert.rejects(writeOrCheck(path, 'generated', true), /stale/)
    await writeFile(path, 'edited')
    await assert.rejects(writeOrCheck(path, 'generated', true), /stale/)
    assert.equal(await readFile(path, 'utf8'), 'edited')
    await writeOrCheck(path, 'generated', false)
    await writeOrCheck(path, 'generated', true)
  } finally { await rm(directory, { recursive: true }) }
})
