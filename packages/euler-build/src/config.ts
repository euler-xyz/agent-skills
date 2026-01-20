/**
 * Configuration for build paths
 */

import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Navigate from packages/euler-build/src to skills/euler-finance
export const SKILL_DIR = join(__dirname, '..', '..', '..', 'skills', 'euler-finance')
export const RULES_DIR = join(SKILL_DIR, 'rules')
export const METADATA_FILE = join(SKILL_DIR, 'metadata.json')
export const OUTPUT_FILE = join(SKILL_DIR, 'AGENTS.md')
export const TEST_CASES_FILE = join(__dirname, '..', 'test-cases.json')
