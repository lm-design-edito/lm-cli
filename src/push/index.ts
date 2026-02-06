import { spawn } from 'node:child_process'
import { program } from 'commander'
import { spawner } from '@design-edito/tools/node/process/spawner/index.js'
import { promptContinue } from '@design-edito/tools/node/process/prompt-continue/index.js'

program
  .name('@design-edito/push')
  .description('Shorthand for git push with arguments forwarding')
  .allowUnknownOption(true)
  .argument('<remote>', 'name of the remote source')
  .argument('<branch>', 'name of the branch')
  .argument('[message]', 'message of the commit')
  .argument('[files]', 'files to add')
  .argument('[rest...]', 'rest of the arguments')
  .option('-p, --pull', 'pull before pushing')
  .action(async (
    remote: string,
    branch: string,
    message: string | undefined,
    files: string | undefined,
    rest: string[] | undefined,
    options: { pull?: boolean },
    command
  ) => {
    console.log({
      remote,
      branch,
      message,
      files,
      rest,
      options
    })

    if (options.pull) {
      const pullRes = await spawner(
        `Pulling from ${remote}/${branch}...`,
        'git',
        ['pull', remote, branch]
      )
      if (!pullRes.success) throw process.exit(1)
    }
    if (files !== undefined) {
      const addRes = await spawner(
        'Adding to stage...',
        'git',
        ['add', files]
      )
      if (!addRes.success) throw process.exit(1)
    }
    if (message !== undefined) {
      const commitRes = await spawner(
        `Commiting with message "${message}"...`,
        'git',
        ['commit', '-m', `"${message}"`]
      )
      if (!commitRes.success) throw process.exit(1)
    }
    await promptContinue('push now?', true)
    await spawner(
      `Pushing to ${remote}/${branch}`,
      'echo',
      ['fake', 'git', 'push', remote, branch]
    )
      
    // spawn(
    //   'git',
    //   ['-c', 'color.ui=always', 'pull', ...pullOptions],
    //   { stdio: 'pipe' }
    // ).on('exit', code => process.exit(code ?? 0))
    

    // if (files !== undefined) spawn(
    //   'git',
    //   ['-c', 'color.ui=always', 'add', ...args],
    //   { stdio: 'inherit' }
    // ).on('exit', code => process.exit(code ?? 0))

  })

program.parse(process.argv)

// program
//   .name('@design-edito/push')
//   .description('Shorthand for git push with arguments forwarding')
//   .allowUnknownOption(true)
//   .option('-p, --pull', 'pull before pushing')
//   .argument('[remote]', 'name of the remote source')
//   .argument('[branch]', 'name of the branch')
//   .argument('[message]', 'message of the commit')
//   .argument('[files]', 'files to add')
//   .option('--flag', 'some optopn')
//   .action((
//     remote: string | undefined,
//     branch: string | undefined,
//     message: string | undefined,
//     files: string | undefined,
//     rest: string,
//     options: string | undefined
//   ) => {
//     // spawn(
//     //   'git',
//     //   ['-c', 'color.ui=always', 'add', ]
//     // )

//     console.log({
//       remote,
//       branch,
//       message,
//       files,
//       rest,
//       options
//     })

//     // spawn(
//     //   'git',
//     //   ['-c', 'color.ui=always', 'push', ...args],
//     //   { stdio: 'inherit' }
//     // ).on('exit', code => process.exit(code ?? 0))
//   })

