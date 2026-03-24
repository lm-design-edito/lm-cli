import { spawn } from 'child_process'
import { program } from 'commander'

program
  .name('@design-edito/branch')
  .description('Shorthand for git branch with arguments forwarding (defaults to ".")')
  .allowUnknownOption(true)
  .arguments('[args...]')
  .action((args: string[]) => {
    const finalArgs = args.length > 0 ? args : []
    spawn(
      'git',
      ['-c', 'color.ui=always', 'branch', ...finalArgs],
      { stdio: 'inherit' }
    ).on('exit', code => process.exit(code ?? 0))
  })

program.parse(process.argv)
