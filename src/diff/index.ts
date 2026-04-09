import { program } from "commander";
import { simpleGit } from "simple-git";
import fs from 'fs';
import path from 'path';
import * as logs  from '@design-edito/tools/agnostic/misc/logs/styles';

export type GetDiffOptions = {
  cwd?: string,
  outputFilename?: string;
  fullHistory?: boolean
}

export type Diff = Record<string, {
  then: string,
  now: string
}>

type FileDiff = {
  hash: string
}

function getFullHistoryChangesFromCommit (
  git: ReturnType<typeof simpleGit>, 
  commitHash: string
): Promise<Map<string, FileDiff>> {
  return new Promise(async (resolve, reject) => {
    const changedFiles = new Map<string, FileDiff>();
    try {
      console.log(logs.styles.info(`- Retrieving all commits since #${commitHash}...`))
      const allLogs = await git.log({ from: commitHash, to: 'HEAD' });
      console.log(logs.styles.info(`-- Number of retrieved commits : ${allLogs.total}`));

      for (const logEntry of allLogs.all) {
        const diffNameStatus = await git.raw(['diff-tree', '--no-commit-id', '--name-status', '-r', logEntry.hash]);
        diffNameStatus.split('\n').map(line => line.trim().split('\t')[1]).filter(Boolean).forEach((filePath) => {
          if (!filePath) {
            return;
          }
          changedFiles.set(filePath, {
            hash: logEntry.hash
          });
        })
      }
      resolve(changedFiles);
    } catch (err) {
      reject(err);
    }
  })
}

function getWorkingTreeChanges (git: ReturnType<typeof simpleGit>): Promise<Map<string, FileDiff>> {
  return new Promise(async (resolve, reject) => {
    const changedFiles = new Map<string, FileDiff>();
    try {
      console.log(logs.styles.info(`- Retrieving all files modified but not yet tracked by git history (working tree changes)...`))
      const status = await git.status();
      [
        ...status.modified,
        ...status.created,
        ...status.deleted,
        ...status.renamed.map(r => r.to),
        ...status.not_added
      ].forEach(file => {
        changedFiles.set(file, {
          hash: ''
        });
      })
      console.log(logs.styles.info(`-- ${changedFiles.size} modified files found in the working tree.`))
      resolve(changedFiles);
    } catch (err) {
      reject(err);
    }
  })
}

const getNormalizedRepoDirectory = (cwd: string, repoRoot: string) => {
  const repoDirectory = path.relative(repoRoot, path.resolve(cwd)).replace(/\\/g, '/').replace(/\/+$/, '');
  return repoDirectory ? repoDirectory + '/' : '';
};

function filterFileDiffListByCwd (fileDiffList: Array<[string, FileDiff]>, repoRoot: string, cwd?: string): Array<[string, FileDiff]> {
  if (!cwd) {
    return fileDiffList;
  }
  const normalizedCwd = getNormalizedRepoDirectory(cwd, repoRoot);
  return fileDiffList.filter((changedFile) => changedFile[0].startsWith(normalizedCwd));
}

export async function getDiffFrom (
  commitHash: string,
  options: GetDiffOptions = {}
): Promise<Diff> {
  const { cwd, fullHistory } = options
  logs.styles.info(`Getting diff with commit ${commitHash} in folder ${options.cwd} ...`)

  const git = simpleGit({ baseDir: options.cwd });
  const repoRoot = await git.revparse(['--show-toplevel']);

  try {
    const type = await git.catFile(['-t', commitHash]);
    if (type.trim() !== 'commit') {
      throw new Error('Not a commit');
    }
    console.log(logs.styles.success(`Commit #${commitHash} exists in the git history.`));
  } catch (err) {
    console.log(logs.styles.error(`Error: commit #${commitHash} not found in the git history. Please provide a valid commit hash.`));
    return {};
  }
  
  const changedFiles = new Map<string, FileDiff>();
  
  if (fullHistory) {
    const fullHistoryChangedFiles = await getFullHistoryChangesFromCommit(git, commitHash);
    fullHistoryChangedFiles.forEach((fileDiff, filePath) => {
      changedFiles.set(filePath, fileDiff);
    });
  }

  const currentWorkingTreeChangedFiles = await getWorkingTreeChanges(git);
  currentWorkingTreeChangedFiles.forEach((fileDiff, filePath) => {
    changedFiles.set(filePath, fileDiff);
  });

  console.log(logs.styles.info(`- Filtering files found in folder ${cwd} ...`))
  const filteredChangedFiles = filterFileDiffListByCwd(Array.from(changedFiles), repoRoot, cwd);
  console.log(logs.styles.info(`-- ${filteredChangedFiles.length > 0 ? filteredChangedFiles.length : 'No'} files changed since commit #${commitHash} in the  ${cwd ? cwd : 'root'} repository.`));
  
  console.log(logs.styles.info(`- Creating FileDiff record...`))
  const result: Diff = {};
  for (const [filePath, fileDiff] of filteredChangedFiles) {
    const diff = { then: '', now: '' };
    try {
      diff.then = await git.show([`${commitHash}:${filePath}`]);
      console.log(logs.styles.info( `----- ${filePath} - ${fileDiff.hash ? `#${fileDiff.hash}` : 'uncommited'}`));
    } catch(err) {
      console.log(logs.styles.warning( `----- ${filePath} - File newly created or renamed`));
      diff.then = '';
    }
    try {
      const filePathInRepo = path.resolve(repoRoot, filePath);
      diff.now = fs.readFileSync(filePathInRepo, 'utf8');
    } catch(err) {
      console.log(logs.styles.warning( `----- ${filePath} - File potentially deleted.`));
    }
    result[filePath] =  diff;
  }
  console.log(logs.styles.success(`Full diff generated for ${filteredChangedFiles.length} files.`))
  
  return result;
}

function getOutputFile (commitHash: string, options: GetDiffOptions): string {
  if (options.outputFilename) {
    return `${options.outputFilename}.json`;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fullHistorySuffix = options.fullHistory ? '_full-history' : '';
  return `diff_${commitHash}${fullHistorySuffix}_${timestamp}.json`;
}

program
.name('@design-edito/diff')
.description('Gets diff between current working tree and a given commit in a specific folder (defaults to ".")')
.argument('<commitHash>', 'hash of the commit to compare with')
.option('-f, --fullHistory',  'Compare with the full history of the commit instead of just the last state')
.option('-d, --cwd <path>', 'folder to compare (defaults to ".")', '.')
.option('-o, --ouput-file-name <path>', 'file storing your record with all diffs')
.action(async (
  commitHash: string,
  options: GetDiffOptions,
) => {
  console.log(logs.styles.info(`Getting diff with commit ${commitHash} in folder ${options.cwd}...`))

  console.log(logs.styles.info('Making sure argument and options format are correct...'))

  const isValidHash = typeof commitHash === 'string' && /^[a-fA-F0-9]{7,40}$/.test(commitHash);
  if (!isValidHash) {
    console.log(logs.styles.error('Error: commitHash seems invalid. It must be a 7 to 40 character hexadecimal string'));
    return;
  }
  
  const isValidCwd = typeof options.cwd === 'undefined' || (typeof options.cwd === 'string' && /^(\.{1,2}\/?|\/|[a-zA-Z0-9_\-\.\/]+)$/.test(options.cwd));
  if (!isValidCwd) {
    console.log(logs.styles.error('"Error: cwd does not look like a valid folder path. Leave empty to run the script in the current directory.'));
    return;
  }

  console.log(logs.styles.success('Argument and options format seem correct.'))

  console.log(logs.styles.info('Processing diff...'));
  const diff = await getDiffFrom(commitHash, options);

  if (Object.keys(diff).length === 0) {
    console.log(logs.styles.warning('No changes found between the specified commit and the current working tree in the targeted folder. No diff file will be generated.'));
    return;
  }

  console.log(logs.styles.info('Saving diff to file...'));
  const outputFile = getOutputFile(commitHash, options);
  try {
    fs.writeFileSync(outputFile, JSON.stringify(diff, null, 2), 'utf8');
    console.log(logs.styles.success(`Diff saved to ${outputFile}`))
  } catch (err) {
    console.log(logs.styles.error(`Error writing output file : ${err}`));
  }
})

program.parse(process.argv)