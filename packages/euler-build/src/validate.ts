#!/usr/bin/env node
/**
 * Validate rule files follow the correct structure
 * Validates all skills by default, or a specific skill via --skill flag
 */

import { readdir, access } from 'fs/promises'
import { join } from 'path'
import { Rule } from './types.js'
import { parseRuleFile } from './parser.js'
import { SKILL_NAMES, getSkillPaths, SkillName } from './config.js'

// Parse command line arguments
const args = process.argv.slice(2)
const skillArg = args.find((arg) => arg.startsWith('--skill='))
const specificSkill = skillArg ? (skillArg.split('=')[1] as SkillName) : null

interface ValidationError {
  skill: string
  file: string
  ruleId?: string
  message: string
}

/**
 * Validate a rule
 */
function validateRule(rule: Rule, file: string, skillName: string): ValidationError[] {
  const errors: ValidationError[] = []

  if (!rule.title || rule.title.trim().length === 0) {
    errors.push({
      skill: skillName,
      file,
      ruleId: rule.id,
      message: 'Missing or empty title',
    })
  }

  if (!rule.explanation || rule.explanation.trim().length === 0) {
    errors.push({
      skill: skillName,
      file,
      ruleId: rule.id,
      message: 'Missing or empty explanation',
    })
  }

  if (!rule.examples || rule.examples.length === 0) {
    errors.push({
      skill: skillName,
      file,
      ruleId: rule.id,
      message: 'Missing examples (need at least one incorrect and one correct example)',
    })
  } else {
    const codeExamples = rule.examples.filter((e) => e.code && e.code.trim().length > 0)

    const hasBad = codeExamples.some(
      (e) =>
        e.label.toLowerCase().includes('incorrect') ||
        e.label.toLowerCase().includes('wrong') ||
        e.label.toLowerCase().includes('bad')
    )

    const hasGood = codeExamples.some(
      (e) =>
        e.label.toLowerCase().includes('correct') ||
        e.label.toLowerCase().includes('good') ||
        e.label.toLowerCase().includes('usage') ||
        e.label.toLowerCase().includes('implementation') ||
        e.label.toLowerCase().includes('example')
    )

    if (codeExamples.length === 0) {
      errors.push({
        skill: skillName,
        file,
        ruleId: rule.id,
        message: 'Missing code examples',
      })
    } else if (!hasBad && !hasGood) {
      errors.push({
        skill: skillName,
        file,
        ruleId: rule.id,
        message: 'Missing incorrect or correct examples',
      })
    }
  }

  const validImpacts: Rule['impact'][] = [
    'CRITICAL',
    'HIGH',
    'MEDIUM-HIGH',
    'MEDIUM',
    'LOW-MEDIUM',
    'LOW',
  ]

  if (!validImpacts.includes(rule.impact)) {
    errors.push({
      skill: skillName,
      file,
      ruleId: rule.id,
      message: `Invalid impact level: ${rule.impact}. Must be one of: ${validImpacts.join(', ')}`,
    })
  }

  return errors
}

/**
 * Validate a single skill
 */
async function validateSkill(skillName: SkillName): Promise<{ errors: ValidationError[]; fileCount: number }> {
  const paths = getSkillPaths(skillName)
  const errors: ValidationError[] = []

  // Check if rules directory exists
  try {
    await access(paths.rulesDir)
  } catch {
    console.log(`  Skipping ${skillName}: no rules directory`)
    return { errors: [], fileCount: 0 }
  }

  const files = await readdir(paths.rulesDir)
  const ruleFiles = files.filter((f) => f.endsWith('.md') && !f.startsWith('_'))

  if (ruleFiles.length === 0) {
    console.log(`  Skipping ${skillName}: no rule files`)
    return { errors: [], fileCount: 0 }
  }

  for (const file of ruleFiles) {
    const filePath = join(paths.rulesDir, file)
    try {
      const { rule } = await parseRuleFile(filePath, skillName)
      const ruleErrors = validateRule(rule, file, skillName)
      errors.push(...ruleErrors)
    } catch (error) {
      errors.push({
        skill: skillName,
        file,
        message: `Failed to parse: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  return { errors, fileCount: ruleFiles.length }
}

/**
 * Main validation function
 */
async function validate() {
  try {
    console.log('Validating rule files...\n')

    const skillsToValidate = specificSkill ? [specificSkill] : SKILL_NAMES
    const allErrors: ValidationError[] = []
    let totalFiles = 0

    for (const skillName of skillsToValidate) {
      console.log(`Validating ${skillName}...`)
      const paths = getSkillPaths(skillName)
      console.log(`  Rules directory: ${paths.rulesDir}`)

      const { errors, fileCount } = await validateSkill(skillName)
      allErrors.push(...errors)
      totalFiles += fileCount

      if (fileCount > 0) {
        if (errors.length === 0) {
          console.log(`  ✓ All ${fileCount} rule files are valid\n`)
        } else {
          console.log(`  ✗ Found ${errors.length} errors in ${fileCount} files\n`)
        }
      }
    }

    if (allErrors.length > 0) {
      console.error('\n✗ Validation failed:\n')
      allErrors.forEach((error) => {
        console.error(
          `  [${error.skill}] ${error.file}${error.ruleId ? ` (${error.ruleId})` : ''}: ${error.message}`
        )
      })
      process.exit(1)
    } else {
      console.log(`\n✓ All ${totalFiles} rule files across ${skillsToValidate.length} skills are valid`)
    }
  } catch (error) {
    console.error('Validation failed:', error)
    process.exit(1)
  }
}

validate()
