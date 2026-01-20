#!/usr/bin/env node
/**
 * Extract test cases from rules for LLM evaluation
 * Extracts from all skills by default, or a specific skill via --skill flag
 */

import { readdir, writeFile, access } from 'fs/promises'
import { join } from 'path'
import { Rule, TestCase } from './types.js'
import { parseRuleFile } from './parser.js'
import { SKILL_NAMES, getSkillPaths, SkillName, TEST_CASES_FILE } from './config.js'

// Parse command line arguments
const args = process.argv.slice(2)
const skillArg = args.find((arg) => arg.startsWith('--skill='))
const specificSkill = skillArg ? (skillArg.split('=')[1] as SkillName) : null

/**
 * Extract test cases from a rule
 */
function extractTestCases(rule: Rule, skillName: SkillName): TestCase[] {
  const testCases: TestCase[] = []

  rule.examples.forEach((example) => {
    const isBad =
      example.label.toLowerCase().includes('incorrect') ||
      example.label.toLowerCase().includes('wrong') ||
      example.label.toLowerCase().includes('bad')

    const isGood =
      example.label.toLowerCase().includes('correct') ||
      example.label.toLowerCase().includes('good')

    if ((isBad || isGood) && example.code && example.code.trim()) {
      testCases.push({
        skill: skillName,
        ruleId: rule.id,
        ruleTitle: rule.title,
        type: isBad ? 'bad' : 'good',
        code: example.code,
        language: example.language || 'typescript',
        description: example.description || `${example.label} example for ${rule.title}`,
      })
    }
  })

  return testCases
}

/**
 * Extract test cases from a single skill
 */
async function extractFromSkill(skillName: SkillName): Promise<TestCase[]> {
  const paths = getSkillPaths(skillName)
  const testCases: TestCase[] = []

  // Check if rules directory exists
  try {
    await access(paths.rulesDir)
  } catch {
    console.log(`  Skipping ${skillName}: no rules directory`)
    return testCases
  }

  const files = await readdir(paths.rulesDir)
  const ruleFiles = files.filter(
    (f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md'
  )

  if (ruleFiles.length === 0) {
    console.log(`  Skipping ${skillName}: no rule files`)
    return testCases
  }

  for (const file of ruleFiles) {
    const filePath = join(paths.rulesDir, file)
    try {
      const { rule } = await parseRuleFile(filePath, skillName)
      const cases = extractTestCases(rule, skillName)
      testCases.push(...cases)
    } catch (error) {
      console.error(`  Error processing ${file}:`, error)
    }
  }

  return testCases
}

/**
 * Main extraction function
 */
async function extractTests() {
  try {
    console.log('Extracting test cases from rules...\n')

    const skillsToProcess = specificSkill ? [specificSkill] : SKILL_NAMES
    const allTestCases: TestCase[] = []

    for (const skillName of skillsToProcess) {
      console.log(`Extracting from ${skillName}...`)
      const paths = getSkillPaths(skillName)
      console.log(`  Rules directory: ${paths.rulesDir}`)

      const cases = await extractFromSkill(skillName)
      allTestCases.push(...cases)

      if (cases.length > 0) {
        const badCount = cases.filter((tc) => tc.type === 'bad').length
        const goodCount = cases.filter((tc) => tc.type === 'good').length
        console.log(`  ✓ Extracted ${cases.length} test cases (${badCount} bad, ${goodCount} good)\n`)
      }
    }

    // Write test cases as JSON
    await writeFile(TEST_CASES_FILE, JSON.stringify(allTestCases, null, 2), 'utf-8')

    const totalBad = allTestCases.filter((tc) => tc.type === 'bad').length
    const totalGood = allTestCases.filter((tc) => tc.type === 'good').length

    console.log(`\n✓ Extracted ${allTestCases.length} total test cases to ${TEST_CASES_FILE}`)
    console.log(`  - Bad examples: ${totalBad}`)
    console.log(`  - Good examples: ${totalGood}`)

    // Print breakdown by skill
    console.log(`\n  By skill:`)
    for (const skillName of skillsToProcess) {
      const skillCases = allTestCases.filter((tc) => tc.skill === skillName)
      if (skillCases.length > 0) {
        console.log(`    - ${skillName}: ${skillCases.length}`)
      }
    }
  } catch (error) {
    console.error('Extraction failed:', error)
    process.exit(1)
  }
}

extractTests()
