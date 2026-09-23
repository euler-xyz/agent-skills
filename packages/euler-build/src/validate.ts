#!/usr/bin/env node
import { selectedSkills } from './config.js'
import { loadSkill } from './build.js'
import type { ImpactLevel } from './types.js'

const impacts: ImpactLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM-HIGH', 'MEDIUM', 'LOW-MEDIUM', 'LOW']

async function main() {
  let count = 0
  for (const name of selectedSkills()) {
    const skill = await loadSkill(name)
    const version = skill.entrypoint.match(/^  version: "([^"]+)"$/m)?.[1]
    if (version !== skill.metadata.version) throw new Error(`${name}: SKILL.md and metadata.json versions differ`)
    if (!skill.entrypoint.startsWith(`---\nname: ${name}\n`)) throw new Error(`${name}: invalid skill frontmatter`)
    for (const section of skill.sections) {
      if (section.title === `Section ${section.number}`) throw new Error(`${name}: missing section ${section.number} in _sections.md`)
      for (const rule of section.rules) {
        if (!rule.title.trim() || !rule.body.trim() || !rule.explanation.trim()) throw new Error(`${name}/${rule.id}: missing title or explanation`)
        if (!impacts.includes(rule.impact)) throw new Error(`${name}/${rule.id}: invalid impact ${rule.impact}`)
        // Procedural rules can be prose-only. Any supplied code must be nonempty.
        if (rule.examples.some(example => !example.code.trim())) throw new Error(`${name}/${rule.id}: empty code block`)
        count++
      }
    }
    console.log(`Validated ${name}`)
  }
  console.log(`Validated ${count} rules`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
