/**
 * Parser for rule markdown files
 */

import { readFile } from 'fs/promises'
import { Rule, ImpactLevel } from './types.js'

export interface RuleFile {
  section: number
  subsection?: number
  rule: Rule
}

/**
 * Parse a rule markdown file into a Rule object
 * @param filePath - Path to the rule markdown file
 * @param skillName - Optional skill name to determine section numbering strategy
 */
export async function parseRuleFile(filePath: string, skillName?: string): Promise<RuleFile> {
  const content = await readFile(filePath, 'utf-8')

  // Extract frontmatter if present
  let frontmatter: Record<string, string> = {}
  let contentStart = 0

  if (content.startsWith('---')) {
    const frontmatterEnd = content.indexOf('---', 3)
    if (frontmatterEnd !== -1) {
      const frontmatterText = content.slice(3, frontmatterEnd).trim()
      frontmatterText.split('\n').forEach((line) => {
        const [key, ...valueParts] = line.split(':')
        if (key && valueParts.length) {
          const value = valueParts.join(':').trim()
          frontmatter[key.trim()] = value.replace(/^["']|["']$/g, '')
        }
      })
      contentStart = frontmatterEnd + 3
    }
  }

  // Parse the rule content
  const ruleContent = content.slice(contentStart).trim()
  const ruleLines = ruleContent.split('\n')

  // Extract title (first ## heading)
  let title = ''
  let titleLine = 0
  for (let i = 0; i < ruleLines.length; i++) {
    if (ruleLines[i].startsWith('##')) {
      title = ruleLines[i].replace(/^##+\s*/, '').trim()
      titleLine = i
      break
    }
  }

  // Extract content
  let impact: ImpactLevel = 'MEDIUM'
  let impactDescription = ''
  let explanation = ''
  const examples: Rule['examples'] = []
  const references: string[] = []

  let currentExample: {
    label: string
    description?: string
    code: string
    language?: string
    additionalText?: string
  } | null = null
  let inCodeBlock = false
  let codeBlockLanguage = 'typescript'
  let codeBlockContent: string[] = []
  let afterCodeBlock = false
  let additionalText: string[] = []
  let hasCodeBlockForCurrentExample = false

  for (let i = titleLine + 1; i < ruleLines.length; i++) {
    const line = ruleLines[i]

    // Impact line
    if (line.includes('**Impact:')) {
      const match = line.match(
        /\*\*Impact:\s*(\w+(?:-\w+)?)\s*(?:\(([^)]+)\))?/i
      )
      if (match) {
        impact = match[1].toUpperCase().replace(/-/g, '-') as ImpactLevel
        impactDescription = match[2] || ''
      }
      continue
    }

    // Code block handling
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        if (currentExample) {
          currentExample.code = codeBlockContent.join('\n')
          currentExample.language = codeBlockLanguage
        }
        codeBlockContent = []
        inCodeBlock = false
        afterCodeBlock = true
      } else {
        // Start of code block
        inCodeBlock = true
        hasCodeBlockForCurrentExample = true
        codeBlockLanguage = line.slice(3).trim() || 'typescript'
        codeBlockContent = []
        afterCodeBlock = false
      }
      continue
    }

    if (inCodeBlock) {
      codeBlockContent.push(line)
      continue
    }

    // Example label pattern: **Label:** at end of line
    const labelMatch = line.match(/^\*\*([^:]+?):\*?\*?$/)
    if (labelMatch) {
      // Save previous example
      if (currentExample) {
        if (additionalText.length > 0) {
          currentExample.additionalText = additionalText.join('\n\n')
          additionalText = []
        }
        examples.push(currentExample)
      }

      afterCodeBlock = false
      hasCodeBlockForCurrentExample = false

      const fullLabel = labelMatch[1].trim()
      // Extract description from parentheses
      const descMatch = fullLabel.match(
        /^([A-Za-z]+(?:\s+[A-Za-z]+)*)\s*\(([^()]+)\)$/
      )

      currentExample = {
        label: descMatch ? descMatch[1].trim() : fullLabel,
        description: descMatch ? descMatch[2].trim() : undefined,
        code: '',
        language: codeBlockLanguage,
      }
      continue
    }

    // Reference links
    if (line.startsWith('Reference:') || line.startsWith('References:')) {
      if (currentExample) {
        if (additionalText.length > 0) {
          currentExample.additionalText = additionalText.join('\n\n')
          additionalText = []
        }
        examples.push(currentExample)
        currentExample = null
      }

      const refMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/g)
      if (refMatch) {
        references.push(
          ...refMatch.map((ref) => {
            const m = ref.match(/\[([^\]]+)\]\(([^)]+)\)/)
            return m ? m[2] : ref
          })
        )
      }
      continue
    }

    // Regular text
    if (line.trim() && !line.startsWith('#')) {
      if (!currentExample && !inCodeBlock) {
        // Main explanation
        explanation += (explanation ? '\n\n' : '') + line
      } else if (currentExample && (afterCodeBlock || !hasCodeBlockForCurrentExample)) {
        additionalText.push(line)
      }
    }
  }

  // Handle last example
  if (currentExample) {
    if (additionalText.length > 0) {
      currentExample.additionalText = additionalText.join('\n\n')
    }
    examples.push(currentExample)
  }

  // Infer section from filename
  const filename = filePath.split('/').pop() || ''
  const area = filename.split('-')[0]
  
  // Section mappings per skill
  const sectionMaps: Record<string, Record<string, number>> = {
    'euler-vaults': {
      vault: 1,
      evc: 2,
      risk: 3,
      arch: 4,
      sec: 5,
    },
    'euler-irm-oracles': {
      oracle: 1,
      irm: 2,
    },
    'euler-data': {
      tools: 1,
    },
  }

  let section: number
  
  if (frontmatter.section) {
    // Frontmatter override takes priority
    section = parseInt(frontmatter.section)
  } else if (skillName && sectionMaps[skillName]) {
    // Use skill-specific section mapping
    section = sectionMaps[skillName][area] || 1
  } else {
    // Default: all rules go into section 1
    section = 1
  }

  const rule: Rule = {
    id: '', // Will be assigned by build script
    title: frontmatter.title || title,
    section: section,
    subsection: undefined,
    impact: (frontmatter.impact as ImpactLevel) || impact,
    impactDescription: frontmatter.impactDescription || impactDescription,
    explanation: frontmatter.explanation || explanation.trim(),
    examples,
    references: frontmatter.references
      ? frontmatter.references.split(',').map((r: string) => r.trim())
      : references,
    tags: frontmatter.tags
      ? frontmatter.tags.split(',').map((t: string) => t.trim())
      : undefined,
  }

  return { section, subsection: 0, rule }
}
