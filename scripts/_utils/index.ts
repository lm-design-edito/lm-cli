import path from 'node:path'
import * as Subpaths from '@design-edito/tools/node/files/subpaths/index.js'

export async function listSubdirectoriesIndexes (root: string, extensions?: string[]): Promise<string[]> {
  return await Subpaths.list(root, {
    directories: false,
    symlinks: false,
    hidden: false,
    maxDepth: 1,
    filter: (filePath, { type }) => {
      if (type !== 'file') return false
      const extension = path.extname(filePath)
      const basename = path.basename(filePath, extension)
      const extensionIsValid = extensions?.includes(extension) ?? true
      return basename === 'index' && extensionIsValid
    }
  })
}
