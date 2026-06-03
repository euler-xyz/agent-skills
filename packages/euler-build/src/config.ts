/**
 * Configuration for build paths
 */

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Base skills directory
export const SKILLS_BASE_DIR = join(__dirname, '..', '..', '..', 'skills')

// All skill directories to process
export const SKILL_NAMES = [
  'euler-vaults',
  'euler-irm-oracles',
  'euler-earn',
  'euler-advanced',
  'euler-data',
  'euler-sdk',
] as const

export type SkillName = (typeof SKILL_NAMES)[number]

// Get paths for a specific skill
export function getSkillPaths(skillName: SkillName) {
  const skillDir = join(SKILLS_BASE_DIR, skillName)
  return {
    skillDir,
    rulesDir: join(skillDir, 'rules'),
    metadataFile: join(skillDir, 'metadata.json'),
    outputFile: join(skillDir, 'AGENTS.md'),
  }
}

// Legacy exports for backward compatibility (defaults to euler-vaults)
export const SKILL_DIR = join(SKILLS_BASE_DIR, 'euler-vaults')
export const RULES_DIR = join(SKILL_DIR, 'rules')
export const METADATA_FILE = join(SKILL_DIR, 'metadata.json')
export const OUTPUT_FILE = join(SKILL_DIR, 'AGENTS.md')

// Test cases output (combined from all skills)
export const TEST_CASES_FILE = join(__dirname, '..', 'test-cases.json')
