import { program } from 'commander'
import { isInDirectory } from '@design-edito/tools/node/files/is-in-directory/index.js'
import * as Subpaths from '@design-edito/tools/node/files/subpaths/index.js'

const CWD = process.cwd()

type SubpathData = {
  value: string
  level: number
  children: SubpathData[]
}

program
  .name('@design-edito/tree')
  .description('List subpaths from the current working directory')
  .argument('[depth]', 'Depth (optional, defaults to 0)')
  .option('-f, --files [bool]', 'Include files', parseBoolean, true)
  .option('-H, --hidden [bool]', 'Include hidden files', parseBoolean, true)
  .option('-d, --directories [bool]', 'Include directories', parseBoolean, true)
  .option('-s, --symlinks [bool]', 'Include symlinks', parseBoolean, true)
  .option('-F, --follow [bool]', 'Follow symlinks', parseBoolean, false)
  .option('-u, --unique [bool]', 'Ensures followed symlinks contents don\'t create duplicates', parseBoolean, false)
  .option('-e, --exclude [pattern]', 'Regexp patterns to exclude from the result')
  .option('-i, --include [pattern]', 'Regexp patterns to include in the result')
  .action(async (_depth, options) => {
    const depth = _depth !== undefined ? parseInt(_depth) : 0
    if (Number.isNaN(depth)) {
      console.error('Depth should be a number')
      return process.exit(1)
    }
    const subpaths = await Subpaths.list(CWD, {
      maxDepth: depth,
      files: options.files,
      hidden: options.hidden,
      directories: options.directories,
      symlinks: options.symlinks,
      followSimlinks: options.follow,
      dedupeSimlinksContents: options.unique,
      exclude: makeRegexp(options.exclude),
      include: makeRegexp(options.include),
      returnRelative: true
    })
    const subpathsData = subpaths.reduce<SubpathData[]>((reduced, subpath) => {
      const level = getLevel(subpath)
      const thisSubpathData = {
        value: subpath,
        level,
        children: [] as SubpathData[]
      }
      // Parents
      const parents = reduced.filter(subpathData => subpathData.level === level - 1 && isInDirectory(subpath, subpathData.value))
      parents.forEach(parent => parent.children.push(thisSubpathData))
      // Children
      const children = reduced.filter(subpathData => subpathData.level === level + 1 && isInDirectory(subpathData.value, subpath))
      thisSubpathData.children.push(...children)
      return [...reduced, thisSubpathData]
    }, [])
    console.log(CWD)
    printSubpathData(subpathsData)
  })

program.parse(process.argv)

function parseBoolean (val: unknown) {
  const strVal = `${val}`.trim().toLowerCase()
  if (strVal === 'true') return true
  if (strVal === 'false') return false
  return undefined
}

function makeRegexp (strRegexp: unknown) {
  if (typeof strRegexp !== 'string') return undefined
  const validRegexpRegexp = /^\/(.+)\/([a-z]*)$/
  const inputMatches = strRegexp.match(validRegexpRegexp)
  if (inputMatches === null) return undefined
  const [, pattern, flags] = inputMatches
  return new RegExp(pattern!, flags!)
}

function getLevel (path: string) {
  const chunks = path.split('/')
  return chunks.length - 1
}

function printSubpathData (
  subpathsData: SubpathData[],
  level: number = 0,
  parentsAreLastMap: boolean[] = []) {
  subpathsData
    .filter(subpathData => subpathData.level === level)
    .forEach((subpathsData, pos, filtered) => {
      const isLast = pos === filtered.length - 1
      const indentChar = isLast ? '└──' : '├──'
      const { value, level, children } = subpathsData
      const toPrint = value.split('/').slice(level).join('/')
      const indentChars = new Array(level).fill(null).map((e, pos) => {
        if (parentsAreLastMap[pos] === true) return '    '
        else return '│   '
      }).join('')
      console.log(`${indentChars}${indentChar} ${toPrint}`)
      printSubpathData(children, level + 1, [...parentsAreLastMap, isLast])
    })
}
