import { readFile, writeFile } from 'node:fs/promises'

export async function writeOrCheck(path: string, content: string, check: boolean): Promise<void> {
  if (!check) {
    await writeFile(path, content, 'utf8')
    return
  }
  let actual: string | undefined
  try {
    actual = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (actual !== content) throw new Error(`Generated output is stale: ${path}. Run pnpm build.`)
}
