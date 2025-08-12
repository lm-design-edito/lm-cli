import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { exec, execSync } from 'node:child_process'
import prompts from 'prompts'
import semver from 'semver'
import Git from 'simple-git'
import { PKG_JSON, BUILD_PKG_JSON, BUILD } from '../_config/index.js'
import { listSubdirectoriesIndexes } from '../_utils/index.js'

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Git status
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

const git = Git()
const isClean = (await git.status()).isClean()
if (!isClean) {
  console.error('Git working directory must be clean.')
  process.exit(1)
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Read package.json
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

const packageJsonData = await fs.readFile(PKG_JSON, { encoding: 'utf-8' })
let currentVersion: string | null = null
try {
  const parsed = JSON.parse(packageJsonData)
  const version = parsed.version
  if (typeof version !== 'string') throw new Error('Could not find the version field inside package.json')
  const versionIsValid = semver.valid(version)
  if (!versionIsValid) throw new Error(`Version number ${version} found in package.json is not valid`)
  currentVersion = version
} catch (err) {
  console.error('Something went wrong reading package.json')
  console.error(err)
  process.exit(1)
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Select target version
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

const targetVersionNumbers = {
  patch: semver.inc(currentVersion, 'patch'),
  minor: semver.inc(currentVersion, 'minor'),
  major: semver.inc(currentVersion, 'major')
}

if (Object.values(targetVersionNumbers).some(val => val === null)) {
  console.error('Some target versions are not valid')
  console.error(targetVersionNumbers)
  process.exit(1)
}

const { upgradeType } = await prompts({
  name: 'upgradeType',
  type: 'select',
  message: 'What kind of upgrade is this?',
  choices: [
    { title: 'Patch', description: `(${targetVersionNumbers.patch})`, value: 'patch' },
    { title: 'Minor', description: `(${targetVersionNumbers.minor})`, value: 'minor' },
    { title: 'Major', description: `(${targetVersionNumbers.major})`, value: 'major' }
  ]
})

if (upgradeType === 'patch') execSync('npm version patch')
else if (upgradeType === 'minor') execSync('npm version minor')
else if (upgradeType === 'major') execSync('npm version major')
else {
  console.error(`Invalid upgrade type: ${upgradeType}`)
  process.exit(1)
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Look for assets/
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

const builtIndexes = await listSubdirectoriesIndexes(BUILD, ['.js'])
const buildAssets = (await Promise.all(builtIndexes.map(async indexPath => {
  const assetsPath = path.join(indexPath, '../assets')
  const assetsExists = existsSync(assetsPath)
  if (!assetsExists) return;
  const assetsIsDir = (await fs.stat(assetsPath)).isDirectory()
  if (!assetsIsDir) return;
  return assetsPath
}))).filter((e): e is string => e !== undefined)

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Look for assets/.publish
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

const buildAssetsToBuild = (await Promise.all(buildAssets.map(async assetsDirPath => {
  const buildFolderPath = path.join(assetsDirPath, '.publish')
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
 * Process each .publish/index.ts
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

console.log('Assets to build:')
buildAssetsToBuild.forEach(buildFolderPath => console.log(` ${buildFolderPath}`))
await Promise.all(buildAssetsToBuild.map(async buildFolderPath => {
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

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Create build/package.json
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

await fs.cp(PKG_JSON, BUILD_PKG_JSON)
const buildPkgJsonData = await fs.readFile(BUILD_PKG_JSON, { encoding: 'utf-8' })
type PkgJson = {
  name?: string | undefined
  version?: string | undefined
  description?: string | undefined
  author?: string | undefined
  license?: string | undefined
  repository?: {
    type: string
    url: string
  }
  type?: string | undefined
  main?: string | undefined
  module?: string | undefined
  scripts?: Record<string, string> | undefined
  bin?: Record<string, string> | undefined
  dependencies?: Record<string, string> | undefined
  devDependencies?: Record<string, string> | undefined
  peerDependencies?: Record<string, string> | undefined
}
let buildPkgJsonObj: PkgJson | null = null

const buildPkgJsonBinObj = (await listSubdirectoriesIndexes(BUILD, ['.js']))
  .map(indexPath => {
    const parent = path.basename(path.dirname(indexPath))
    return [parent, `./${parent}/index.js`]
  })
  .reduce((reduced, [name, filePath]) => {
    return {
      ...reduced,
      [name as string]: filePath as string
    }
  }, {} as Record<string, string>)

try {
  const parsed = JSON.parse(buildPkgJsonData) as PkgJson
  buildPkgJsonObj = {
    name: parsed.name,
    version: parsed.version,
    description: parsed.description,
    author: parsed.author,
    license: parsed.license,
    repository: parsed.repository,
    type: parsed.type,
    main: 'index.js',
    module: 'index.js',
    bin: buildPkgJsonBinObj,
    dependencies: parsed.dependencies,
    peerDependencies: parsed.peerDependencies,
    devDependencies: parsed.devDependencies
  }
  await fs.writeFile(
    BUILD_PKG_JSON,
    `${JSON.stringify(buildPkgJsonObj, null, 2)}\n`,
    { encoding: 'utf-8' }
  )
  console.log(`Written ${BUILD_PKG_JSON}`)
} catch (err) {
  console.error(`Something went wrong while parsing build/package.json`)
  process.exit(1)
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Publish from build
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

const { otp } = await prompts({
  name: 'otp',
  type: 'text',
  message: 'Enter your NPM OTP token'
})

await new Promise(resolve => {
  exec(`cd ${BUILD} && npm publish --access public --otp=${otp}`, (err, stdout, stderr) => {
    if (err !== null) console.error(err)
    if (stdout !== '') console.log(stdout)
    if (stderr !== '') console.log(stderr)
    resolve(true)
  })
})

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * Prevent npm publish to happen from here
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * */

console.log('Pre publish: done')
process.exit(1)

