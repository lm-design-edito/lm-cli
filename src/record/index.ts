import { spawn } from 'node:child_process'
import path from 'node:path'
import url from 'node:url'
import { program } from 'commander'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

program
  .name('@design-edito/record')
  .description('simple command for recording audio')
  .argument('<some-arg>', 'Some argument')
  .action((someArg: string) => {
    spawn(
      'sh',
      [path.join(__dirname, 'assets/main.sh'), someArg],
      { stdio: 'inherit' }
    ).on('exit', code => process.exit(code ?? 0))
  })

program.parse(process.argv)
