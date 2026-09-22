/**
 * Type definitions for Euler Finance Agent Skill rules
 */

export type ImpactLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM-HIGH' | 'MEDIUM' | 'LOW-MEDIUM' | 'LOW'

export interface CodeExample {
  label: string // e.g., "Incorrect", "Correct", "Example"
  description?: string // Optional description before code
  code: string
  language?: string // Default: 'typescript' or 'solidity'
  additionalText?: string // Optional text after code block
}

export interface Rule {
  id: string // Stable rule filename without .md
  title: string
  section: number // Main section number (1-6)
  subsection?: number // Subsection number within section
  impact: ImpactLevel
  impactDescription?: string // e.g., "Essential for yield comparison"
  body: string // Original rule Markdown, preserved by generation
  explanation: string
  examples: CodeExample[]
  references?: string[] // URLs or citations
  tags?: string[] // For categorization/search
}

export interface Section {
  number: number
  title: string
  impact: ImpactLevel
  impactDescription?: string
  introduction?: string
  rules: Rule[]
}

export interface GuidelinesDocument {
  version: string
  organization: string
  date: string
  abstract: string
  sections: Section[]
  references?: string[]
}

export interface TestCase {
  skill: string // Which skill this test case belongs to
  ruleId: string
  ruleTitle: string
  type: 'bad' | 'good'
  code: string
  language: string
  description?: string
}
