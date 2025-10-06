import process from 'node:process'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { existsSync, promises as fs } from 'node:fs'
import esbuild from 'esbuild'
import { BUILD, SRC } from '../_config/index.js'
import { listSubdirectoriesIndexes } from '../_utils/index.js'
import { exec, execSync } from 'node:child_process'

const libToBuild = process.argv[2]
const entryPoints = await listSubdirectoriesIndexes(SRC, ['.js', '.ts'])
const filteredEntryPoints = entryPoints.filter(entryPointPath => entryPointPath.includes(libToBuild ?? ''))
const actualEntryPoints = filteredEntryPoints.length === 0 ? entryPoints : filteredEntryPoints

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Typechecks
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */
await new Promise(resolve => {
  const prcss = spawn('npx', ['tsc', '--noEmit', '-p', SRC])
  prcss.stdout?.on('data', data => console.log(data.toString().trim()))
  prcss.stderr?.on('data', data => console.log(data.toString().trim()))
  prcss.on('error', err => console.error(err.toString().trim()))
  prcss.on('close', code => {
    if (code === 0) return resolve(true)
    console.error('Typechecks failed')
    throw new Error('Typechecks failed')
  })
})

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Build
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

await Promise.all(actualEntryPoints.map(async indexPath => {
  return await new Promise((resolve, reject) => {
    const parentDir = path.basename(path.dirname(indexPath))
    esbuild.build({
      entryPoints: [indexPath],
      outdir: path.join(BUILD, parentDir),
      bundle: true,
      external: ['@design-edito/tools', 'commander', 'http-server', 'prompts'],
      chunkNames: '_chunks/[name]-[hash]',
      minify: true,
      splitting: false,
      platform: 'node',
      sourcemap: true,
      format: 'esm',
      target: ['esnext']
    }).then(() => {
      console.log('Source build completed:', indexPath)
      resolve(true)
    }).catch(err => {
      console.error('Source build error:', indexPath)
      console.error(err)
      reject(err)
      process.exit(1)
    })
  })
}))

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Add the shebang and make executable
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

const outputs = await listSubdirectoriesIndexes(BUILD, ['.js'])
await Promise.all(outputs.map(async indexPath => {
  const content = await fs.readFile(indexPath, { encoding: 'utf-8' })
  const newContent = `#!/usr/bin/env node\n${content}`
  await fs.writeFile(indexPath, newContent, { encoding: 'utf-8' })
  console.log('Shebang added:', indexPath)
  execSync(`chmod +x ${indexPath}`)
  console.log('Permissions changed:', indexPath)
}))

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Look for assets/
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

const buildAssets = (await Promise.all(actualEntryPoints.map(async indexPath => {
  const parent = path.basename(path.dirname(indexPath))
  const assetsPath = path.join(indexPath, '../assets')
  const assetsExists = existsSync(assetsPath)
  if (!assetsExists) return;
  const assetsIsDir = (await fs.stat(assetsPath)).isDirectory()
  if (!assetsIsDir) return;
  const assetsDestination = path.join(BUILD, parent, 'assets')
  await fs.cp(assetsPath, assetsDestination, { recursive: true })
  console.log('Assets dir copied:', assetsDestination)
  return assetsDestination
}))).filter((e): e is string => e !== undefined)

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Look for assets/.build
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

const buildAssetsToProcessForBuild = (await Promise.all(buildAssets.map(async assetsDirPath => {
  const buildFolderPath = path.join(assetsDirPath, '.build')
  const buildIndexPath = path.join(buildFolderPath, 'index.ts')
  const buildTsconfigPath = path.join(buildFolderPath, 'tsconfig.json')
  const buildFolderExists = existsSync(buildFolderPath)
  if (!buildFolderExists) return;
  const buildIndexExists = existsSync(buildIndexPath)
  const buildTsconfigExists = existsSync(buildTsconfigPath)
  if (!buildIndexExists || !buildTsconfigExists) {
    console.error(`Missing files inside ${buildFolderPath}`)
    console.error('Should contain index.ts and tsconfig.json in order to build')
    console.error('Build skipped.')
    await fs.rm(buildFolderPath, { recursive: true, force: true })
    return;
  }
  return buildFolderPath
}))).filter((e): e is string => e !== undefined)

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Process each .build/index.ts
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

console.log('Assets to build:')
buildAssetsToProcessForBuild.forEach(buildFolderPath => console.log(` ${buildFolderPath}`))
await Promise.all(buildAssetsToProcessForBuild.map(async buildFolderPath => {
  const buildTsconfigPath = path.join(buildFolderPath, 'tsconfig.json')
  await new Promise(resolve => {
    exec(`npx tsc -p ${buildTsconfigPath}`, (err, stdout, stderr) => {
      if (err !== null) console.error(err)
      if (stdout !== '') console.log(stdout)
      if (stderr !== '') console.log(stderr)
      resolve(true)
    })
  })
  const buildIndexTsPath = path.join(buildFolderPath, 'index.ts')
  const buildIndexJsPath = path.join(buildFolderPath, 'dist/index.js')
  const buildIndexJsExists = existsSync(buildIndexJsPath)
  if (!buildIndexJsExists) {
    console.error(`Something went wrong while transpiling ${buildIndexTsPath}`)
    console.error('Skipping build')
    await fs.rm(buildFolderPath, { recursive: true, force: true })
    console.log('.build dir removed:', buildFolderPath)
    return;
  }
  await new Promise(resolve => {
    const assetsDirPath = path.dirname(buildFolderPath)
    exec(`node ${buildIndexJsPath} ${assetsDirPath}`, (err, stdout, stderr) => {
      if (err !== null) console.error(err)
      if (stdout !== '') console.log(stdout)
      if (stderr !== '') console.log(stderr)
      resolve(true)
    })
  })
  console.log('Assets build completed:', buildIndexJsPath)
  await fs.rm(buildFolderPath, { recursive: true, force: true })
  console.log('.build dir removed:', buildFolderPath)
  return buildFolderPath
}))

console.log('Build completed.')
