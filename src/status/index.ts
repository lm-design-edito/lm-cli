import process from 'node:process'
import { program } from 'commander'
import { styles } from '@design-edito/tools/agnostic/misc/logs/styles/index.js'
import { addRecursionOptions, parseRecursionOptions, recursiveGitCommand } from '../_git-recursion.js'

program
  .name('@design-edito/status')
  .description('Shorthand for git status, with optional recursion into sub directories')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[args...]', 'arguments forwarded to git status')
  .action(async (args: string[] | undefined, options: { depth: string, maxChildren: string }) => {
    const parsed = parseRecursionOptions(options)
    if (parsed === null) {
      console.error(styles.error('--depth and --max-children must be non-negative integers'))
      return process.exit(1)
    }
    const code = await recursiveGitCommand('status', {
      cwd: process.cwd(),
      gitArgs: args ?? [],
      ...parsed
    })
    return process.exit(code)
  })

addRecursionOptions(program)
program.parse(process.argv)
