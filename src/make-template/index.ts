import process from 'node:process'
import { promises as fs, existsSync } from 'node:fs'
import url from 'node:url'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { program } from 'commander'
import prompts from 'prompts'
import { readWrite as readWriteFile } from '@design-edito/tools/node/files/index.js'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CWD = process.cwd()

program
  .name('@design-edito/make-template')
  .description('Generate in cwd a project template')

program
  .command('express')
  .description('make express.js + typescript project structure')
  .action(makeExpress)

program
  .command('express-api')
  .description('make express.js + typescript + docker project structure for a quick API setup')
  .action(makeExpressApi)

program
  .command('html')
  .description('make simple html project structure')
  .action(makeHtml)

program
  .command('react')
  .description('make react + typescript project structure')
  .action(makeReact)

program.parse(process.argv)

/* * * * * * * * * * * * * * * * * * *
 *
 * HTML
 *
 * * * * * * * * * * * * * * * * * * */
async function makeHtml () {
  const htmlTemplatePath = path.join(__dirname, 'assets/html')
  if (!existsSync(htmlTemplatePath)) {
    console.error(`Could not find the template to copy at ${htmlTemplatePath}`)
    return process.exit(1)
  }
  const targetPath = path.join(CWD, 'html-template')
  await fs.cp(htmlTemplatePath, targetPath, { recursive: true })
}

/* * * * * * * * * * * * * * * * * * *
 *
 * REACT
 *
 * * * * * * * * * * * * * * * * * * */
async function makeReact () {
  const reactTemplatePath = path.join(__dirname, 'assets/react')
  if (!existsSync(reactTemplatePath)) {
    console.error(`Could not find the template to copy at ${reactTemplatePath}`)
    return process.exit(1)
  }
  const defaultTargetPath = path.join(CWD, 'react-template')

  // Copy
  await fs.cp(reactTemplatePath, defaultTargetPath, { recursive: true })
  const { projectName } = await prompts({
    name: 'projectName',
    message: 'Project name ? (for package.json name field)',
    type: 'text'
  })

  // Custom project name
  const packageJsonPath = path.join(defaultTargetPath, 'package.json')
  await readWriteFile(packageJsonPath, rawContent => {
    const content = typeof rawContent === 'string'
      ? rawContent
      : rawContent.toString()
    const contentObj = JSON.parse(content) as Record<string, string>
    delete contentObj.name
    const newContentObj = {
      name: projectName,
      ...contentObj
    }
    return `${JSON.stringify(newContentObj, null, 2)}\n`
  }, { encoding: 'utf-8' })

  // Install deps
  const npmISubprocess = spawn(`cd ${defaultTargetPath} && npm i`, { stdio: 'inherit', shell: true })
  await new Promise((resolve, reject) => {
    npmISubprocess.on('exit', () => resolve(true))
    npmISubprocess.on('error', () => reject(false))
  })

  // Rename project
  const targetPath = path.join(CWD, projectName)
  await fs.rename(defaultTargetPath, targetPath)

  // Rename gitignore
  await fs.rename(
    path.join(targetPath, 'gitignore'),
    path.join(targetPath, '.gitignore')
  )
}

/* * * * * * * * * * * * * * * * * * *
 *
 * EXPRESS
 *
 * * * * * * * * * * * * * * * * * * */
async function makeExpress () {
  const expressTemplatePath = path.join(__dirname, 'assets/express')
  if (!existsSync(expressTemplatePath)) {
    console.error(`Could not find the template to copy at ${expressTemplatePath}`)
    return process.exit(1)
  }
  const defaultTargetPath = path.join(CWD, 'express-template')

  // Copy
  await fs.cp(expressTemplatePath, defaultTargetPath, { recursive: true })
  const { projectName } = await prompts({
    name: 'projectName',
    message: 'Project name ? (lower case a-z, hyphens or underscores only)',
    type: 'text'
  })

  // Custom project name in package.json
  const packageJsonPath = path.join(defaultTargetPath, 'package.json')
  await readWriteFile(packageJsonPath, rawContent => {
    const content = typeof rawContent === 'string'
      ? rawContent
      : rawContent.toString()
    return content.replaceAll('<<@design-edito/cli----replace-with-name>>', projectName)
  }, { encoding: 'utf-8' })

  // Custom project name in src/www/index.ts
  const binStartTsPath = path.join(defaultTargetPath, 'src/www/index.ts')
  await readWriteFile(binStartTsPath, rawContent => {
    const originalContent = typeof rawContent === 'string'
      ? rawContent
      : rawContent.toString()
    return originalContent.replaceAll('<<@design-edito/cli----replace-with-name>>', projectName)
  }, { encoding: 'utf-8' })

  // Install deps
  const npmISubprocess = spawn(`cd ${defaultTargetPath} && npm i`, { stdio: 'inherit', shell: true })
  await new Promise((resolve, reject) => {
    npmISubprocess.on('exit', () => resolve(true))
    npmISubprocess.on('error', () => reject(false))
  })

  // Rename project
  const targetPath = path.join(CWD, projectName)
  await fs.rename(defaultTargetPath, targetPath)

  // Rename gitignore
  await fs.rename(path.join(targetPath, 'gitignore'), path.join(targetPath, '.gitignore'))
}

/* * * * * * * * * * * * * * * * * * *
 *
 * EXPRESS API
 *
 * * * * * * * * * * * * * * * * * * */
async function makeExpressApi () {
  const expressTemplatePath = path.join(__dirname, 'assets/express-api')
  if (!existsSync(expressTemplatePath)) {
    console.error(`Could not find the template to copy at ${expressTemplatePath}`)
    return process.exit(1)
  }
  const defaultTargetPath = path.join(CWD, 'express-api-template')

  // Copy
  await fs.cp(expressTemplatePath, defaultTargetPath, { recursive: true })
  const { projectName } = await prompts({
    name: 'projectName',
    message: 'Project name ? (lower case a-z, hyphens or underscores only)',
    type: 'text'
  })

  // Custom project name in package.json
  const packageJsonPath = path.join(defaultTargetPath, 'package.json')
  await readWriteFile(packageJsonPath, rawContent => {
    const content = typeof rawContent === 'string'
      ? rawContent
      : rawContent.toString()
    return content.replaceAll('<<@design-edito/cli----replace-with-name>>', projectName)
  }, { encoding: 'utf-8' })

  // Custom project name in src/www/index.ts
  const binStartTsPath = path.join(defaultTargetPath, 'src//www/index.ts')
  await readWriteFile(binStartTsPath, rawContent => {
    const originalContent = typeof rawContent === 'string'
      ? rawContent
      : rawContent.toString()
    return originalContent.replaceAll('<<@design-edito/cli----replace-with-name>>', projectName)
  }, { encoding: 'utf-8' })

  // Install deps
  const npmISubprocess = spawn(`cd ${defaultTargetPath} && npm i`, { stdio: 'inherit', shell: true })
  await new Promise((resolve, reject) => {
    npmISubprocess.on('exit', () => resolve(true))
    npmISubprocess.on('error', () => reject(false))
  })

  // Rename project
  const targetPath = path.join(CWD, projectName)
  await fs.rename(defaultTargetPath, targetPath)

  // Rename gitignore
  await fs.rename(path.join(targetPath, 'gitignore'), path.join(targetPath, '.gitignore'))
  await fs.rename(path.join(targetPath, 'env'), path.join(targetPath, '.env'))

  console.log('You\'re all set! Now configure .env file!')
}
