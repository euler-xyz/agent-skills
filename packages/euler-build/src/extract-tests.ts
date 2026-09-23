#!/usr/bin/env node
import { loadSkill } from './build.js'
import { selectedSkills, TEST_CASES_FILE } from './config.js'
import { writeOrCheck } from './output.js'
import type { TestCase } from './types.js'

async function main() {
  const cases: TestCase[] = []
  for (const name of selectedSkills()) {
    const skill = await loadSkill(name)
    for (const rule of skill.sections.flatMap((section) => section.rules)) {
      for (const example of rule.examples) {
        const bad = /\b(incorrect|wrong|bad)\b/i.test(example.label)
        const good = /\b(correct|good)\b/i.test(example.label)
        if ((!bad && !good) || !example.code.trim()) continue
        cases.push({
          skill: name,
          ruleId: rule.id,
          ruleTitle: rule.title,
          type: bad ? 'bad' : 'good',
          code: example.code,
          language: example.language ?? 'text',
          description: example.label,
        })
      }
    }
  }
  // A partial extraction must not replace the combined checked-in catalog.
  const selection = process.argv.find((arg) => arg.startsWith('--skill='))?.slice(8)
  const output = selection ? TEST_CASES_FILE.replace('.json', `.${selection}.json`) : TEST_CASES_FILE
  await writeOrCheck(output, JSON.stringify(cases, null, 2) + '\n', process.argv.includes('--check'))
  console.log(`Extracted ${cases.length} evaluation examples`)
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
