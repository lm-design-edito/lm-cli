import { spawn } from 'node:child_process'
import { promises as fs, type Dirent } from 'node:fs'
import path from 'node:path'
import { type Command } from 'commander'
import { styles } from '@design-edito/tools/agnostic/misc/logs/styles/index.js'

/**
 * Shared machinery for git passthrough commands (`status`, `pull`, …) that can
 * optionally recurse into sub directories and run the same command in every git
 * repository they find.
 */

export type RecursionOptions = {
  /** Directory the command was invoked from. */
  cwd: string
  /** How many directory levels below `cwd` to explore (`0` = no recursion). */
  depth: number
  /** Skip a directory holding more than this many sub directories (`0` = no limit). */
  maxChildren: number
  /** Extra arguments forwarded verbatim to git. */
  gitArgs: string[]
}

type Ctx = RecursionOptions & { subcommand: string }

/** Registers the `-d/--depth` and `-m/--max-children` options on a command. */
export function addRecursionOptions (command: Command): Command {
  return command
    .option('-d, --depth <n>', 'recurse n directory levels deep looking for git repositories', '0')
    .option('-m, --max-children <n>', 'skip a directory holding more than n sub directories (0 disables the limit)', '50')
}

/**
 * Parses and validates the recursion options. Returns `null` when either value
 * is not a non-negative integer.
 */
export function parseRecursionOptions (
  options: { depth?: string, maxChildren?: string }
): { depth: number, maxChildren: number } | null {
  const depth = Number.parseInt(options.depth ?? '0', 10)
  const maxChildren = Number.parseInt(options.maxChildren ?? '50', 10)
  if (!Number.isInteger(depth) || depth < 0) return null
  if (!Number.isInteger(maxChildren) || maxChildren < 0) return null
  return { depth, maxChildren }
}

/**
 * Runs `git <subcommand> [gitArgs]` in `opts.cwd` exactly like running it by
 * hand, then — when `opts.depth > 0` — recurses into sub directories running the
 * same command in every git repository found. Resolves to the exit code the
 * caller should exit with.
 */
export async function recursiveGitCommand (subcommand: string, opts: RecursionOptions): Promise<number> {
  const ctx: Ctx = { ...opts, subcommand }
  const rootCode = await runGit(ctx.cwd, ctx)
  if (ctx.depth <= 0) return rootCode
  console.log('')
  await walk(ctx.cwd, 0, ctx)
  console.log('')
  return 0
}

/**
 * Walks `dir` at recursion level `currentDepth`, running the git command in
 * every git repository found and printing a one-line marker for every other
 * directory, then recurses into child directories until `ctx.depth` is reached.
 */
async function walk (dir: string, currentDepth: number, ctx: Ctx): Promise<void> {
  // The root directory was already run raw by the caller.
  if (currentDepth > 0) {
    const rel = `./${path.relative(ctx.cwd, dir) || '.'}`
    if (await isRepoRoot(dir)) {
      console.log(`\n${styles.info(rel)}`)
      await runGit(dir, ctx)
      console.log('')
    } else {
      console.log(`${styles.info(rel)} ${styles.light('not a git repository')}`)
    }
  }

  if (currentDepth >= ctx.depth) return

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  let childDirs = entries
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))

  // Inside a repository, honour .gitignore — drops node_modules, dist, build…
  const ignored = await ignoredChildren(dir, childDirs)
  if (ignored.size > 0) childDirs = childDirs.filter(name => !ignored.has(name))

  if (ctx.maxChildren > 0 && childDirs.length > ctx.maxChildren) {
    const rel = path.relative(ctx.cwd, dir) || '.'
    console.log(styles.warning(`  ${childDirs.length} sub directories, skipped (--max-children ${ctx.maxChildren})`))
    return
  }

  for (const name of childDirs) {
    await walk(path.join(dir, name), currentDepth + 1, ctx)
  }
}

/** Runs `git <subcommand>` in `dir`, streaming its output, and resolves its exit code. */
function runGit (dir: string, ctx: Ctx): Promise<number> {
  return new Promise(resolve => {
    spawn('git', ['-C', dir, '-c', 'color.ui=always', ctx.subcommand, ...ctx.gitArgs], { stdio: 'inherit' })
      .on('error', () => resolve(1))
      .on('close', code => resolve(code ?? 0))
  })
}

/** Silently runs a git command, capturing stdout and the exit code. */
function capture (args: string[]): Promise<{ code: number, stdout: string }> {
  return new Promise(resolve => {
    let stdout = ''
    const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'ignore'] })
    child.stdout?.on('data', chunk => { stdout += String(chunk) })
    child.on('error', () => resolve({ code: -1, stdout }))
    child.on('close', code => resolve({ code: code ?? -1, stdout }))
  })
}

/** True when `dir` is the top level of a git repository (or of a submodule). */
async function isRepoRoot (dir: string): Promise<boolean> {
  const { code, stdout } = await capture(['-C', dir, 'rev-parse', '--show-prefix'])
  return code === 0 && stdout.trim() === ''
}

/**
 * Subset of `names` that git considers ignored inside `dir`. Resolves to an
 * empty set when `dir` is not a repository (nothing to filter).
 */
function ignoredChildren (dir: string, names: string[]): Promise<Set<string>> {
  return new Promise(resolve => {
    if (names.length === 0) return resolve(new Set())
    let stdout = ''
    const child = spawn('git', ['-C', dir, 'check-ignore', '-z', '--stdin'], { stdio: ['pipe', 'pipe', 'ignore'] })
    child.stdout?.on('data', chunk => { stdout += String(chunk) })
    child.on('error', () => resolve(new Set()))
    child.on('close', () => resolve(new Set(stdout.split('\0').map(entry => entry.trim()).filter(Boolean))))
    child.stdin?.write(names.join('\0'))
    child.stdin?.end()
  })
}
