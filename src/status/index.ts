import { spawn } from 'node:child_process'
import { promises as fs, type Dirent } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { program } from 'commander'
import { styles } from '@design-edito/tools/agnostic/misc/logs/styles/index.js'

const CWD = process.cwd()

type Ctx = {
  depth: number
  maxChildren: number
  gitArgs: string[]
}

program
  .name('@design-edito/status')
  .description('Shorthand for git status, with optional recursion into sub directories')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[args...]', 'arguments forwarded to git status')
  .option('-d, --depth <n>', 'recurse n directory levels deep looking for git repositories', '0')
  .option('-m, --max-children <n>', 'skip a directory holding more than n sub directories (0 disables the limit)', '50')
  .action(async (args: string[] | undefined, options: { depth: string, maxChildren: string }) => {
    const depth = Number.parseInt(options.depth, 10)
    const maxChildren = Number.parseInt(options.maxChildren, 10)
    if (!Number.isInteger(depth) || depth < 0) {
      console.error(styles.error('--depth must be a non-negative integer'))
      return process.exit(1)
    }
    if (!Number.isInteger(maxChildren) || maxChildren < 0) {
      console.error(styles.error('--max-children must be a non-negative integer'))
      return process.exit(1)
    }
    const ctx: Ctx = { depth, maxChildren, gitArgs: args ?? [] }

    // Root: raw `git status`, exactly like running it by hand (its "fatal: not a
    // git repository" is printed verbatim when we're not in a repo).
    const rootCode = await runGitStatus(CWD, ctx.gitArgs)
    if (depth > 0) {
      console.log('')
      await recurse(CWD, 0, ctx)
      console.log('')
    }
    return process.exit(depth === 0 ? rootCode : 0)
  })

program.parse(process.argv)

/**
 * Walks `dir` at recursion level `currentDepth`, printing a `git status` for
 * every git repository found and a one-line marker for every other directory,
 * then recurses into child directories until `ctx.depth` is reached.
 */
async function recurse (dir: string, currentDepth: number, ctx: Ctx): Promise<void> {
  // The root directory was already printed raw by the caller.
  if (currentDepth > 0) {
    const rel = path.relative(CWD, dir) || '.'
    if (await isRepoRoot(dir)) {
      console.log(`\n${styles.info(`./${rel}`)}`)
      await runGitStatus(dir, ctx.gitArgs)
      console.log('')
    } else {
      console.log(`${styles.info(`./${rel}`)} ${styles.light('not a git repository')}`)
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
    const rel = path.relative(CWD, dir) || '.'
    console.log(styles.warning(`${rel} — ${childDirs.length} sub directories, skipped (--max-children ${ctx.maxChildren})`))
    return
  }

  for (const name of childDirs) {
    await recurse(path.join(dir, name), currentDepth + 1, ctx)
  }
}

/** Runs `git status` in `dir`, streaming its output, and resolves its exit code. */
function runGitStatus (dir: string, gitArgs: string[]): Promise<number> {
  return new Promise(resolve => {
    spawn('git', ['-C', dir, '-c', 'color.ui=always', 'status', ...gitArgs], { stdio: 'inherit' })
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
