import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const DEFAULT_SOURCE_DIRS = ['runtime/core', 'runtime/project_setup'];
export const DEFAULT_INITIAL_PROMPT_PATH = 'runtime/project_setup/prompt_launch_cpo_copilot.md';

function git(repoPath, args) {
  try {
    return execFileSync('git', ['-C', repoPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    const stderr = error.stderr?.toString?.() ?? '';
    const stdout = error.stdout?.toString?.() ?? '';
    throw new Error(`git ${args.join(' ')} failed in ${repoPath}: ${stderr || stdout || error.message}`);
  }
}

function normalizeGitPath(path) {
  return path.replaceAll('\\', '/').replace(/^\/+/, '');
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function readFileFromRef(repoPath, ref, filePath) {
  return git(repoPath, ['show', `${ref}:${normalizeGitPath(filePath)}`]);
}

function readFileFromWorkingTree(repoPath, filePath) {
  return readFileSync(join(repoPath, filePath), 'utf8');
}

function listMarkdownFiles(repoPath, ref, sourceDirs) {
  const args = ['ls-tree', '-r', '--name-only', ref, '--', ...sourceDirs.map(normalizeGitPath)];
  return git(repoPath, args)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('.md'))
    .sort((left, right) => left.localeCompare(right));
}

function listMarkdownFilesFromWorkingTree(repoPath, sourceDirs) {
  const paths = [];

  function walk(directoryPath) {
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
      const entryPath = join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.md')) {
        paths.push(normalizeGitPath(relative(repoPath, entryPath)));
      }
    }
  }

  for (const sourceDir of sourceDirs.map(normalizeGitPath)) {
    const sourcePath = join(repoPath, sourceDir);
    if (existsSync(sourcePath) && statSync(sourcePath).isDirectory()) {
      walk(sourcePath);
    }
  }

  return paths.sort((left, right) => left.localeCompare(right));
}

function resolveSourceRef(repoPath, requestedRef) {
  if (requestedRef !== 'upstream') {
    return requestedRef;
  }

  try {
    return git(repoPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).trim();
  } catch {
    throw new Error('Source ref "upstream" requires the current branch to track a remote branch. Set upstream or pass --source-ref origin/<branch>.');
  }
}

function remoteNameForRef(ref) {
  const [remoteName] = ref.split('/');
  return remoteName || 'origin';
}

function fetchRef(repoPath, ref) {
  git(repoPath, ['fetch', '--quiet', remoteNameForRef(ref)]);
}

export function readGitRefBundle(options = {}) {
  const repoPath = resolve(options.repoPath ?? '../cpo');
  const requestedRef = options.ref ?? 'upstream';
  const fetchBeforeRead = options.fetchBeforeRead ?? false;
  const requireClean = options.requireClean ?? true;
  const sourceDirs = options.sourceDirs ?? DEFAULT_SOURCE_DIRS;
  const initialPromptPath = normalizeGitPath(options.initialPromptPath ?? DEFAULT_INITIAL_PROMPT_PATH);

  git(repoPath, ['rev-parse', '--git-dir']);
  const ref = resolveSourceRef(repoPath, requestedRef);
  const useWorkingTree = ref === 'working-tree';

  if (fetchBeforeRead && !useWorkingTree) {
    fetchRef(repoPath, ref);
  }

  const dirtyStatus = git(repoPath, ['status', '--porcelain']);
  if (requireClean && !useWorkingTree && dirtyStatus.trim().length > 0) {
    throw new Error(`Source repo has a dirty working tree: ${repoPath}`);
  }

  const commitSha = git(repoPath, ['rev-parse', `${useWorkingTree ? 'HEAD' : ref}^{commit}`]).trim();
  const branch = git(repoPath, ['branch', '--show-current']).trim() || null;
  const paths = useWorkingTree
    ? listMarkdownFilesFromWorkingTree(repoPath, sourceDirs)
    : listMarkdownFiles(repoPath, ref, sourceDirs);
  const files = paths.map((path) => {
    const content = useWorkingTree
      ? readFileFromWorkingTree(repoPath, path)
      : readFileFromRef(repoPath, ref, path);
    return {
      path,
      sha256: sha256(content),
      content
    };
  });

  const bundleMaterial = files.map((file) => `--- ${file.path}\n${file.content}`).join('\n');

  return {
    type: 'git_ref',
    repoPath,
    requestedRef,
    ref,
    fetchBeforeRead,
    branch,
    commitSha,
    sourceDirs: sourceDirs.map(normalizeGitPath),
    initialPromptPath,
    initialPrompt: useWorkingTree
      ? readFileFromWorkingTree(repoPath, initialPromptPath)
      : readFileFromRef(repoPath, ref, initialPromptPath),
    files,
    fileCount: files.length,
    bundleSha256: sha256(bundleMaterial),
    dirty: dirtyStatus.trim().length > 0
  };
}

export function formatSourceBundleForPrompt(bundle) {
  return bundle.files
    .map((file) => [
      `===== BEGIN SOURCE: ${file.path} =====`,
      file.content.trimEnd(),
      `===== END SOURCE: ${file.path} =====`
    ].join('\n'))
    .join('\n\n');
}
