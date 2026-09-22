import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SKILLS_BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../skills')

// Every skill directory participates in build, validation, and extraction.
export const SKILL_NAMES = readdirSync(SKILLS_BASE_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
  .map((entry) => entry.name)
  .sort()

export type SkillName = string

export function getSkillPaths(skillName: SkillName) {
  if (!SKILL_NAMES.includes(skillName)) throw new Error(`Unknown skill: ${skillName}`)
  const skillDir = join(SKILLS_BASE_DIR, skillName)
  return {
    skillDir,
    rulesDir: join(skillDir, 'rules'),
    metadataFile: join(skillDir, 'metadata.json'),
    outputFile: join(skillDir, 'AGENTS.md'),
  }
}

export function selectedSkills(args = process.argv.slice(2)): string[] {
  for (const arg of args) {
    if (arg !== '--' && arg !== '--check' && arg !== '--upgrade-version' && !arg.startsWith('--skill=')) {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  const selections = args.filter((arg) => arg.startsWith('--skill='))
  if (selections.length > 1) throw new Error('Specify at most one --skill')
  if (!selections.length) return SKILL_NAMES
  const name = selections[0].slice('--skill='.length)
  getSkillPaths(name)
  return [name]
}

export const TEST_CASES_FILE = join(dirname(fileURLToPath(import.meta.url)), '../test-cases.json')
