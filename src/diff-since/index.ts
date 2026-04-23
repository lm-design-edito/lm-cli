/**
 * Module principal pour obtenir les différences entre l'état courant du dépôt et un commit donné.
 * Fournit une CLI pour générer un diff JSON des fichiers modifiés.
 * @module diff-since
 */
import { program } from 'commander'
import { simpleGit } from 'simple-git'
import fs from 'fs/promises'
import path from 'path'
import * as logs from '@design-edito/tools/agnostic/misc/logs/styles'

/**
 * Options pour la récupération du diff depuis un commit.
 * @typedef {Object} GetDiffSinceOptions
 * @property {string} [cwd] - Répertoire de travail à comparer (par défaut: ".").
 * @property {string} [outputFilename] - Nom du fichier de sortie pour le diff.
 * @property {boolean} [fullHistory] - Si vrai, compare tout l'historique depuis le commit.
 */
export type GetDiffSinceOptions = {
  cwd?: string
  outputFilename?: string
  fullHistory?: boolean
}

/**
 * Structure du diff : chaque fichier modifié avec son contenu avant et après.
 * @typedef {Object} Diff
 * @property {string} then - Contenu du fichier au moment du commit de référence.
 * @property {string} now - Contenu actuel du fichier.
 */
export type Diff = Record<string, {
  then: string
  now: string
}>

/**
 * Informations sur un fichier modifié (hash du commit).
 * @typedef {Object} FileDiff
 * @property {string} hash - Hash du commit où le fichier a été modifié.
 */
type FileDiff = {
  hash: string
}

/**
 * Récupère la liste des fichiers modifiés depuis un commit jusqu'à HEAD (tous les commits).
 * @param {ReturnType<typeof simpleGit>} git - Instance simpleGit.
 * @param {string} commitHash - Hash du commit de départ.
 * @returns {Promise<Map<string, FileDiff>>} Map des fichiers modifiés et leur hash de commit.
 */
async function getFullHistoryChangesFromCommit (
  git: ReturnType<typeof simpleGit>,
  commitHash: string
): Promise<Map<string, FileDiff>> {
  const changedFiles = new Map<string, FileDiff>()
  try {
    const allLogs = await git.log({ from: commitHash, to: 'HEAD' })

    for (const logEntry of allLogs.all) {
      const diffNameStatus = await git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', logEntry.hash])
      diffNameStatus.split('\n').map(line => line.trim().split('\t')[1]).filter(Boolean).forEach((filePath) => {
        if (filePath == null) {
          return
        }
        changedFiles.set(filePath, {
          hash: logEntry.hash
        })
      })
    }

    return changedFiles
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
}

/**
 * Récupère la liste des fichiers modifiés dans l'arbre de travail courant (non commités).
 * @param {ReturnType<typeof simpleGit>} git - Instance simpleGit.
 * @returns {Promise<Map<string, FileDiff>>} Map des fichiers modifiés et leur hash (vide si non commités).
 */
async function getWorkingTreeChanges (git: ReturnType<typeof simpleGit>): Promise<Map<string, FileDiff>> {
  const changedFiles = new Map<string, FileDiff>()
  try {
    const status = await git.status()
    const files = [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map(r => r.to),
      ...status.not_added
    ]

    files.forEach(file => {
      changedFiles.set(file, {
        hash: ''
      })
    })
    return changedFiles
  }
  catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
}

/**
 * Normalise le chemin du répertoire courant par rapport à la racine du dépôt.
 * @param {string} cwd - Répertoire courant.
 * @param {string} repoRoot - Racine du dépôt git.
 * @returns {string} Chemin relatif normalisé.
 */
function getNormalizedRepoDirectory (cwd: string, repoRoot: string): string {
  const repoDirectory = path.relative(repoRoot, path.resolve(cwd)).replace(/\\/g, '/').replace(/\/+$/, '')
  return (repoDirectory.length > 0) ? repoDirectory + '/' : ''
}

/**
 * Filtre la liste des fichiers modifiés pour ne garder que ceux dans le dossier courant.
 * @param {Array<[string, FileDiff]>} fileDiffList - Liste des fichiers modifiés.
 * @param {string} repoRoot - Racine du dépôt.
 * @param {string} [cwd] - Répertoire courant à filtrer.
 * @returns {Array<[string, FileDiff]>} Liste filtrée.
 */
function filterFileDiffListByCwd (fileDiffList: Array<[string, FileDiff]>, repoRoot: string, cwd?: string): Array<[string, FileDiff]> {
  if (cwd === undefined) {
    return fileDiffList
  }
  const normalizedCwd = getNormalizedRepoDirectory(cwd, repoRoot)
  return fileDiffList.filter((changedFile) => changedFile[0].startsWith(normalizedCwd))
}

/**
 * Récupère le diff entre l'état courant et un commit donné.
 * @param {string} commitHash - Hash du commit de référence.
 * @param {GetDiffSinceOptions} [options] - Options de récupération du diff.
 * @returns {Promise<Diff>} Différentiel des fichiers modifiés.
 */
export async function getDiffFrom (
  commitHash: string,
  options: GetDiffSinceOptions = {}
): Promise<Diff> {
  const { cwd, fullHistory } = options

  const git = simpleGit({ baseDir: options.cwd })
  const repoRoot = await git.revparse(['--show-toplevel'])

  try {
    const type = await git.catFile(['-t', commitHash])
    if (type.trim() !== 'commit') {
      throw new Error('Not a commit')
    }
  } catch (err) {
    throw new Error(`Commit ${commitHash} not found. Please provide a valid commit hash.`)
  }

  const changedFiles = new Map<string, FileDiff>()

  if (fullHistory === true) {
    const fullHistoryChangedFiles = await getFullHistoryChangesFromCommit(git, commitHash)
    fullHistoryChangedFiles.forEach((fileDiff, filePath) => {
      changedFiles.set(filePath, fileDiff)
    })
  }

  const currentWorkingTreeChangedFiles = await getWorkingTreeChanges(git)
  currentWorkingTreeChangedFiles.forEach((fileDiff, filePath) => {
    changedFiles.set(filePath, fileDiff)
  })

  const filteredChangedFiles = filterFileDiffListByCwd(Array.from(changedFiles), repoRoot, cwd)

  const result: Diff = {}
  for (const [filePath] of filteredChangedFiles) {
    const diff = { then: '', now: '' }
    try {
      diff.then = await git.show([`${commitHash}:${filePath}`])
    } catch (err) {
      diff.then = ''
    }
    try {
      const filePathInRepo = path.resolve(repoRoot, filePath)
      diff.now = await fs.readFile(filePathInRepo, 'utf8')
    } catch {}
    result[filePath] = diff
  }

  return result
}

/**
 * Génère le nom du fichier de sortie pour le diff.
 * @param {string} commitHash - Hash du commit de référence.
 * @param {GetDiffSinceOptions} options - Options de récupération du diff.
 * @returns {string} Nom du fichier de sortie.
 */
function getOutputFile (commitHash: string, options: GetDiffSinceOptions): string {
  if (options.outputFilename != null) {
    return `${options.outputFilename}.json`
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fullHistorySuffix = options.fullHistory === true ? '_full-history' : ''
  return `diff_${commitHash}${fullHistorySuffix}_${timestamp}.json`
}

/**
 * Sauvegarde le diff dans un fichier JSON.
 * @param {Diff} diff - Diff à sauvegarder.
 * @param {string} outputFile - Nom du fichier de sortie.
 * @returns {Promise<void>}
 */
async function saveDiffToFile (diff: Diff, outputFile: string): Promise<void> {
  try {
    await fs.writeFile(outputFile, JSON.stringify(diff, null, 2), 'utf8')
    console.log(logs.styles.success(`Diff saved to ${outputFile}`))
  } catch (err) {
    throw new Error(`Error writing output file : ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Point d'entrée CLI : parse les arguments et exécute la commande diff.
 */
program
  .name('@design-edito/diff-since')
  .description('Gets diff between current working tree and a given commit in a specific folder (defaults to ".")')
  .argument('<commitHash>', 'hash of the commit to compare with')
  .option('-f, --fullHistory', 'Compare with the full history of the commit instead of just the last state')
  .option('-d, --cwd <path>', 'folder to compare (defaults to ".")', '.')
  .option('-o, --ouput-file-name <path>', 'file storing your record with all diffs')
  .action(async (
    commitHash: string,
    options: GetDiffSinceOptions
  ) => {
    try {
      const isValidHash = typeof commitHash === 'string' && /^[a-fA-F0-9]{7,40}$/.test(commitHash)
      if (!isValidHash) {
        throw new Error('Commit hash seems invalid. It must be a 7 to 40 character hexadecimal string.')
      }

      const isValidCwd = typeof options.cwd === 'undefined' || (typeof options.cwd === 'string' && /^(\.{1,2}\/?|\/|[a-zA-Z0-9_\-./]+)$/.test(options.cwd))
      if (!isValidCwd) {
        throw new Error('Cwd seems invalid. It must be a valid folder path or left empty to run the script in the current directory.')
      }

      const diff = await getDiffFrom(commitHash, options)
      if (Object.keys(diff).length === 0) {
        return
      }

      const outputFile = getOutputFile(commitHash, options)
      await saveDiffToFile(diff, outputFile)
    } catch (err) {
      console.log(logs.styles.error(`Error: ${err instanceof Error ? err.message : String(err)}`))
    }
  })

program.parse(process.argv)