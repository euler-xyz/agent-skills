#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ImpactLevel, Section } from './types.js'
import { parseRuleFile } from './parser.js'
import { getSkillPaths, selectedSkills } from './config.js'
import { writeOrCheck } from './output.js'

export interface SkillMetadata {
  version: string
  organization: string
  date: string
  abstract: string
  references?: string[]
}

export async function loadSkill(skillName: string) {
  const paths = getSkillPaths(skillName)
  const metadata: SkillMetadata = JSON.parse(await readFile(paths.metadataFile, 'utf8'))
  for (const key of ['version', 'organization', 'date', 'abstract'] as const) {
    if (!metadata[key]?.trim()) throw new Error(`${skillName}: missing metadata.${key}`)
  }
  const entrypoint = await readFile(join(paths.skillDir, 'SKILL.md'), 'utf8')
  const title = entrypoint.match(/^# (.+)$/m)?.[1]
  if (!title) throw new Error(`${skillName}: SKILL.md is missing its title`)
  const files = (await readdir(paths.rulesDir))
    .filter((file) => file.endsWith('.md') && !file.startsWith('_') && file !== 'README.md')
    .sort()
  if (!files.length) throw new Error(`${skillName}: no rules`)

  const sections = new Map<number, Section>()
  for (const file of files) {
    const { section, rule } = await parseRuleFile(join(paths.rulesDir, file), skillName)
    if (!sections.has(section)) {
      sections.set(section, { number: section, title: `Section ${section}`, impact: rule.impact, rules: [] })
    }
    sections.get(section)!.rules.push(rule)
  }
  const descriptions = await readFile(join(paths.rulesDir, '_sections.md'), 'utf8')
  for (const block of descriptions.split(/(?=^## \d+\. )/m)) {
    const heading = block.match(/^## (\d+)\.\s+(.+?)(?:\s+\([^)]+\))?$/m)
    if (!heading) continue
    const section = sections.get(Number(heading[1]))
    if (!section) continue
    section.title = heading[2]
    section.impact = (block.match(/\*\*Impact:\*\*\s+([\w-]+)/)?.[1] ?? section.impact) as ImpactLevel
    section.introduction = block.match(/\*\*Description:\*\*\s+([\s\S]*?)$/)?.[1].trim()
  }
  return { paths, metadata, entrypoint, title, sections: [...sections.values()].sort((a, b) => a.number - b.number) }
}

function anchor(title: string): string {
  return title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s/g, '-')
}

// Shift Markdown headings into the rule without touching fenced code or prose.
export function nestHeadings(body: string): string {
  let fence: string | undefined
  const headings: { index: number; level: number }[] = []
  const lines = body.split('\n')
  for (const [index, line] of lines.entries()) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && line.slice(marker[0].length).trim() === '') fence = undefined
      continue
    }
    const heading = !fence && line.match(/^(#{1,6}) /)
    if (heading) headings.push({ index, level: heading[1].length })
  }
  const shift = 4 - Math.min(4, ...headings.map(heading => heading.level))
  for (const { index, level } of headings) {
    lines[index] = '#'.repeat(Math.min(6, level + shift)) + lines[index].slice(level)
  }
  return lines.join('\n')
}

export function generateMarkdown(skill: Awaited<ReturnType<typeof loadSkill>>): string {
  const { title, metadata, sections } = skill
  let md = `# ${title}\n\n**Version ${metadata.version}**\n\n${metadata.organization}\n\n${metadata.date}\n\n`
  md += '> Generated from SKILL.md, metadata.json, and rules/. Edit those sources and run pnpm build.\n\n'
  md += `${metadata.abstract}\n\n## Table of Contents\n\n`
  for (const section of sections) {
    md += `- [${section.title}](#${anchor(`${section.number}. ${section.title}`)})\n`
    for (const rule of section.rules) md += `  - [${rule.title}](#${anchor(`${rule.id} ${rule.title}`)})\n`
  }
  for (const section of sections) {
    md += `\n## ${section.number}. ${section.title}\n\n**Impact: ${section.impact}**\n\n`
    if (section.introduction) md += `${section.introduction}\n\n`
    for (const rule of section.rules) {
      md += `### ${rule.id} ${rule.title}\n\n**Impact: ${rule.impact}${rule.impactDescription ? ` (${rule.impactDescription})` : ''}**\n\n${nestHeadings(rule.body)}\n\n`
    }
  }
  if (metadata.references?.length) md += '## References\n\n' + metadata.references.map((url) => `- [${url}](${url})\n`).join('')
  return md.trimEnd() + '\n'
}

async function main() {
  const check = process.argv.includes('--check')
  const upgrade = process.argv.includes('--upgrade-version')
  if (check && upgrade) throw new Error('--check and --upgrade-version cannot be combined')
  for (const name of selectedSkills()) {
    const skill = await loadSkill(name)
    if (upgrade) {
      if (!/^\d+\.\d+\.\d+$/.test(skill.metadata.version)) throw new Error('Expected a stable semver skill version')
      skill.metadata.version = skill.metadata.version.replace(/\d+$/, (patch) => String(Number(patch) + 1))
      const updated = skill.entrypoint.replace(/(\n  version: )"[^"]+"/, `$1"${skill.metadata.version}"`)
      if (updated === skill.entrypoint) throw new Error(`${name}: metadata.version not found in SKILL.md`)
      await writeFile(skill.paths.metadataFile, JSON.stringify(skill.metadata, null, 2) + '\n')
      await writeFile(join(skill.paths.skillDir, 'SKILL.md'), updated)
    }
    await writeOrCheck(skill.paths.outputFile, generateMarkdown(skill), check)
    console.log(`${check ? 'Checked' : 'Built'} ${name}: ${skill.sections.flatMap((section) => section.rules).length} rules`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1 })
}
