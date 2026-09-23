import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { CodeExample, ImpactLevel, Rule } from './types.js'

export interface RuleFile {
  section: number
  rule: Rule
}

export function parseRule(content: string, filePath: string, skillName?: string): RuleFile {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!match) throw new Error(`${filePath}: missing YAML frontmatter`)
  const frontmatter: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([\w-]+):\s*(.*)$/)
    if (field) frontmatter[field[1]] = field[2].replace(/^["']|["']$/g, '')
  }

  const contentBody = content.slice(match[0].length).trim()
  const heading = contentBody.match(/^## +([^\n]+)\r?\n/)
  if (!heading) throw new Error(`${filePath}: expected an initial ## title`)
  // Generation uses the original Markdown. Extraction never reconstructs it.
  const body = contentBody.slice(heading[0].length).trim()
  const examples: CodeExample[] = []
  const explanation: string[] = []
  let label = 'Example'
  let fence: { marker: string; language: string; lines: string[] } | undefined
  let sawCode = false

  for (const line of body.split('\n')) {
    if (fence) {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/)
      if (closing && closing[1][0] === fence.marker[0] && closing[1].length >= fence.marker.length) {
        examples.push({ label, code: fence.lines.join('\n'), language: fence.language })
        fence = undefined
      } else {
        fence.lines.push(line)
      }
      continue
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})([^\n]*)$/)
    if (opening) {
      fence = { marker: opening[1], language: opening[2].trim().split(/\s+/)[0] || 'text', lines: [] }
      sawCode = true
      continue
    }
    const exampleLabel = line.match(/^\*\*(.+?)\*\*\s*$/)
    if (exampleLabel) label = exampleLabel[1].replace(/:$/, '')
    else if (/^#{1,6} /.test(line)) label = 'Example'
    if (!sawCode) explanation.push(line)
  }
  if (fence) throw new Error(`${filePath}: unclosed code fence`)

  const area = basename(filePath).split('-')[0]
  const sectionMaps: Record<string, Record<string, number>> = {
    'euler-vaults': { vault: 1, evc: 2, risk: 3, arch: 4, sec: 5 },
    'euler-irm-oracles': { oracle: 1, irm: 2 },
  }
  const section = frontmatter.section
    ? Number(frontmatter.section)
    : sectionMaps[skillName ?? '']?.[area] ?? 1
  if (!Number.isInteger(section) || section < 1) throw new Error(`${filePath}: invalid section`)
  return {
    section,
    rule: {
      id: basename(filePath, '.md'),
      title: frontmatter.title || heading[1].trim(),
      section,
      impact: frontmatter.impact as ImpactLevel,
      impactDescription: frontmatter.impactDescription,
      explanation: explanation.join('\n').trim(),
      body,
      examples,
      references: [...body.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)].map((link) => link[1]),
      tags: frontmatter.tags?.split(',').map((tag) => tag.trim()),
    },
  }
}

export async function parseRuleFile(filePath: string, skillName?: string): Promise<RuleFile> {
  return parseRule(await readFile(filePath, 'utf8'), filePath, skillName)
}
