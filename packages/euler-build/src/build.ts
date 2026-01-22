#!/usr/bin/env node
/**
 * Build script to compile individual rule files into AGENTS.md
 * Supports building all skills or a specific skill via --skill flag
 */

import { readdir, readFile, writeFile, access } from 'fs/promises'
import { join } from 'path'
import { Rule, Section, ImpactLevel } from './types.js'
import { parseRuleFile, RuleFile } from './parser.js'
import { SKILL_NAMES, getSkillPaths, SkillName } from './config.js'

// Parse command line arguments
const args = process.argv.slice(2)
const upgradeVersion = args.includes('--upgrade-version')
const skillArg = args.find((arg) => arg.startsWith('--skill='))
const specificSkill = skillArg ? (skillArg.split('=')[1] as SkillName) : null

/**
 * Increment a semver-style version string
 */
function incrementVersion(version: string): string {
  const parts = version.split('.').map(Number)
  parts[parts.length - 1]++
  return parts.join('.')
}

/**
 * Generate markdown from rules
 */
function generateMarkdown(
  sections: Section[],
  metadata: {
    version: string
    organization: string
    date: string
    abstract: string
    references?: string[]
  },
  skillName: SkillName
): string {
  const titleMap: Record<SkillName, string> = {
    'how-to-use-euler-vaults': 'Euler Finance Agent Skill',
    'euler-interest-rate-models-and-oracles': 'Euler IRM & Oracles Agent Skill',
    'interact-with-euler-earn': 'EulerEarn Agent Skill',
    'use-euler-feeflow-hooks-rewardEUL-flashloan': 'Euler Advanced Features Agent Skill',
    'how-to-fetch-euler-data-lens': 'Euler Lens & Data Agent Skill',
  }

  const noteMap: Record<SkillName, string> = {
    'how-to-use-euler-vaults': `> **Note:**  
> This document is for agents and LLMs to follow when interacting with,  
> building on, or integrating Euler Finance protocol. It covers vault operations,  
> EVC batching, risk management, architecture, and security.
>
> For specialized topics, see companion skills:
> - \`euler-interest-rate-models-and-oracles\` - Oracle adapters, price resolution, Interest Rate Models
> - \`interact-with-euler-earn\` - EulerEarn yield aggregation
> - \`use-euler-feeflow-hooks-rewardEUL-flashloan\` - Hooks, flash loans, fee flow, rewards
> - \`how-to-fetch-euler-data-lens\` - Lens contracts, subgraphs, developer tools`,
    'euler-interest-rate-models-and-oracles': `> **Note:**  
> This document is for agents and LLMs to follow when working with  
> Euler Finance price oracles and Interest Rate Models. It covers deploying  
> adapters, configuring EulerRouter, querying prices, and understanding IRM types.`,
    'interact-with-euler-earn': `> **Note:**  
> This document is for agents and LLMs to follow when interacting with  
> EulerEarn yield aggregation. It covers vault creation, strategy management,  
> roles, and PublicAllocator.`,
    'use-euler-feeflow-hooks-rewardEUL-flashloan': `> **Note:**  
> This document is for agents and LLMs to follow when implementing  
> advanced Euler features. It covers hooks, flash loans, fee flow, and rewards.`,
    'how-to-fetch-euler-data-lens': `> **Note:**  
> This document is for agents and LLMs to follow when querying Euler data  
> or using developer tools. It covers Lens contracts, subgraphs, contract  
> interfaces, and no-code vault deployment.`,
  }

  let md = `# ${titleMap[skillName]}\n\n`
  md += `**Version ${metadata.version}**  \n`
  md += `${metadata.organization}  \n`
  md += `${metadata.date}\n\n`
  md += `${noteMap[skillName]}\n\n`
  md += `---\n\n`
  md += `## Abstract\n\n`
  md += `${metadata.abstract}\n\n`
  md += `---\n\n`
  md += `## Table of Contents\n\n`

  // Generate TOC
  sections.forEach((section) => {
    md += `${section.number}. [${section.title}](#${section.number}-${section.title.toLowerCase().replace(/\s+/g, '-')}) — **${section.impact}**\n`
    section.rules.forEach((rule) => {
      const anchor = `${rule.id} ${rule.title}`
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '')
      md += `   - ${rule.id} [${rule.title}](#${anchor})\n`
    })
  })

  md += `\n---\n\n`

  // Generate sections
  sections.forEach((section) => {
    md += `## ${section.number}. ${section.title}\n\n`
    md += `**Impact: ${section.impact}${section.impactDescription ? ` (${section.impactDescription})` : ''}**\n\n`

    if (section.introduction) {
      md += `${section.introduction}\n\n`
    }

    section.rules.forEach((rule) => {
      md += `### ${rule.id} ${rule.title}\n\n`
      md += `**Impact: ${rule.impact}${rule.impactDescription ? ` (${rule.impactDescription})` : ''}**\n\n`
      md += `${rule.explanation}\n\n`

      rule.examples.forEach((example) => {
        if (example.description) {
          md += `**${example.label}: ${example.description}**\n\n`
        } else {
          md += `**${example.label}:**\n\n`
        }

        if (example.code && example.code.trim()) {
          md += `\`\`\`${example.language || 'typescript'}\n`
          md += `${example.code}\n`
          md += `\`\`\`\n\n`
        }

        if (example.additionalText) {
          md += `${example.additionalText}\n\n`
        }
      })

      if (rule.references && rule.references.length > 0) {
        md += `Reference: ${rule.references.map((ref) => `[${ref}](${ref})`).join(', ')}\n\n`
      }
    })

    md += `---\n\n`
  })

  // Add references section
  if (metadata.references && metadata.references.length > 0) {
    md += `## References\n\n`
    metadata.references.forEach((ref, i) => {
      md += `${i + 1}. [${ref}](${ref})\n`
    })
  }

  return md
}

/**
 * Build a single skill
 */
async function buildSkill(skillName: SkillName): Promise<{ sections: number; rules: number }> {
  const paths = getSkillPaths(skillName)

  // Check if rules directory exists
  try {
    await access(paths.rulesDir)
  } catch {
    console.log(`  Skipping ${skillName}: no rules directory`)
    return { sections: 0, rules: 0 }
  }

  // Read all rule files
  const files = await readdir(paths.rulesDir)
  const ruleFiles = files
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md')
    .sort()

  if (ruleFiles.length === 0) {
    console.log(`  Skipping ${skillName}: no rule files`)
    return { sections: 0, rules: 0 }
  }

  const ruleData: RuleFile[] = []

  for (const file of ruleFiles) {
    const filePath = join(paths.rulesDir, file)
    try {
      const parsed = await parseRuleFile(filePath, skillName)
      ruleData.push(parsed)
    } catch (error) {
      console.error(`  Error parsing ${file}:`, error)
    }
  }

  // Group rules by section
  const sectionsMap = new Map<number, Section>()

  ruleData.forEach(({ section, rule }) => {
    if (!sectionsMap.has(section)) {
      sectionsMap.set(section, {
        number: section,
        title: `Section ${section}`,
        impact: rule.impact,
        rules: [],
      })
    }
    sectionsMap.get(section)!.rules.push(rule)
  })

  // Sort rules within each section
  sectionsMap.forEach((section) => {
    section.rules.sort((a, b) =>
      a.title.localeCompare(b.title, 'en-US', { sensitivity: 'base' })
    )
    // Assign IDs
    section.rules.forEach((rule, index) => {
      rule.id = `${section.number}.${index + 1}`
      rule.subsection = index + 1
    })
  })

  // Convert to array and sort
  const sections = Array.from(sectionsMap.values()).sort((a, b) => a.number - b.number)

  // Read section metadata
  const sectionsFile = join(paths.rulesDir, '_sections.md')
  try {
    const sectionsContent = await readFile(sectionsFile, 'utf-8')
    const sectionBlocks = sectionsContent.split(/(?=^## \d+\. )/m).filter(Boolean)

    for (const block of sectionBlocks) {
      const headerMatch = block.match(/^## (\d+)\.\s+(.+?)(?:\s+\([^)]+\))?$/m)
      if (!headerMatch) continue

      const sectionNumber = parseInt(headerMatch[1])
      const sectionTitle = headerMatch[2].trim()

      const impactMatch = block.match(/\*\*Impact:\*\*\s+(\w+(?:-\w+)?)/i)
      const impactLevel = impactMatch
        ? (impactMatch[1].toUpperCase() as ImpactLevel)
        : 'MEDIUM'

      const descMatch = block.match(/\*\*Description:\*\*\s+(.+?)(?=\n\n##|$)/s)
      const description = descMatch ? descMatch[1].trim() : ''

      const section = sections.find((s) => s.number === sectionNumber)
      if (section) {
        section.title = sectionTitle
        section.impact = impactLevel
        section.introduction = description
      }
    }
  } catch (error) {
    // _sections.md is optional for non-core skills
  }

  // Read metadata
  let metadata
  try {
    const metadataContent = await readFile(paths.metadataFile, 'utf-8')
    metadata = JSON.parse(metadataContent)
  } catch {
    metadata = {
      version: '1.0.0',
      organization: 'Euler Labs',
      date: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      abstract: `Guide for ${skillName}.`,
    }
  }

  // Upgrade version if flag is passed (only for how-to-use-euler-vaults)
  if (upgradeVersion && skillName === 'how-to-use-euler-vaults') {
    const oldVersion = metadata.version
    metadata.version = incrementVersion(oldVersion)
    console.log(`  Upgrading version: ${oldVersion} -> ${metadata.version}`)

    await writeFile(paths.metadataFile, JSON.stringify(metadata, null, 2) + '\n', 'utf-8')

    // Update SKILL.md frontmatter
    const skillFile = join(paths.skillDir, 'SKILL.md')
    try {
      const skillContent = await readFile(skillFile, 'utf-8')
      const updatedSkillContent = skillContent.replace(
        /^(---[\s\S]*?version:\s*)"[^"]*"([\s\S]*?---)$/m,
        `$1"${metadata.version}"$2`
      )
      await writeFile(skillFile, updatedSkillContent, 'utf-8')
    } catch {
      // SKILL.md update is optional
    }
  }

  // Generate markdown
  const markdown = generateMarkdown(sections, metadata, skillName)

  // Write output
  await writeFile(paths.outputFile, markdown, 'utf-8')

  return { sections: sections.length, rules: ruleData.length }
}

/**
 * Main build function
 */
async function build() {
  try {
    console.log('Building AGENTS.md from rules...\n')

    const skillsToBuild = specificSkill ? [specificSkill] : SKILL_NAMES

    let totalSections = 0
    let totalRules = 0

    for (const skillName of skillsToBuild) {
      console.log(`Building ${skillName}...`)
      const paths = getSkillPaths(skillName)
      console.log(`  Rules directory: ${paths.rulesDir}`)
      console.log(`  Output file: ${paths.outputFile}`)

      const { sections, rules } = await buildSkill(skillName)

      if (sections > 0) {
        console.log(`  ✓ Built with ${sections} sections and ${rules} rules\n`)
        totalSections += sections
        totalRules += rules
      }
    }

    console.log(`\n✓ Build complete: ${totalSections} total sections, ${totalRules} total rules`)
  } catch (error) {
    console.error('Build failed:', error)
    process.exit(1)
  }
}

build()
