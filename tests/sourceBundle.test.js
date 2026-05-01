import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

import { readGitRefBundle } from '../src/sourceBundle.js';

function git(repoPath, args) {
  return execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8' }).trim();
}

function createRepo() {
  const repoPath = mkdtempSync(join(tmpdir(), 'cpo-lab-git-ref-'));
  git(repoPath, ['init']);
  git(repoPath, ['config', 'user.email', 'test@example.local']);
  git(repoPath, ['config', 'user.name', 'Protocol Lab Test']);
  mkdirSync(join(repoPath, 'runtime', 'core'), { recursive: true });
  mkdirSync(join(repoPath, 'runtime', 'project_setup'), { recursive: true });
  writeFileSync(join(repoPath, 'runtime', 'core', 'a.md'), '# core v1\n');
  writeFileSync(join(repoPath, 'runtime', 'project_setup', 'prompt_launch_cpo_copilot.md'), 'launch v1\n');
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '-m', 'initial']);
  const firstCommit = git(repoPath, ['rev-parse', 'HEAD']);

  writeFileSync(join(repoPath, 'runtime', 'core', 'a.md'), '# core dirty working tree\n');

  return { repoPath, firstCommit };
}

function createRepoWithUpstream() {
  const remotePath = mkdtempSync(join(tmpdir(), 'cpo-lab-remote-'));
  const repoPath = mkdtempSync(join(tmpdir(), 'cpo-lab-upstream-'));
  git(remotePath, ['init', '--bare']);
  git(repoPath, ['init']);
  git(repoPath, ['config', 'user.email', 'test@example.local']);
  git(repoPath, ['config', 'user.name', 'Protocol Lab Test']);
  git(repoPath, ['remote', 'add', 'origin', remotePath]);

  mkdirSync(join(repoPath, 'runtime', 'core'), { recursive: true });
  mkdirSync(join(repoPath, 'runtime', 'project_setup'), { recursive: true });
  writeFileSync(join(repoPath, 'runtime', 'core', 'a.md'), '# pushed version\n');
  writeFileSync(join(repoPath, 'runtime', 'project_setup', 'prompt_launch_cpo_copilot.md'), 'launch pushed\n');
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '-m', 'pushed']);
  git(repoPath, ['push', '-u', 'origin', 'HEAD']);
  const pushedCommit = git(repoPath, ['rev-parse', 'HEAD']);
  const upstreamRef = git(repoPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);

  writeFileSync(join(repoPath, 'runtime', 'core', 'a.md'), '# local unpushed version\n');
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '-m', 'local unpushed']);
  const localCommit = git(repoPath, ['rev-parse', 'HEAD']);

  return { repoPath, remotePath, pushedCommit, localCommit, upstreamRef };
}

function pushRemoteUpdate(remotePath) {
  const updaterPath = mkdtempSync(join(tmpdir(), 'cpo-lab-remote-updater-'));
  git(updaterPath, ['clone', remotePath, '.']);
  git(updaterPath, ['config', 'user.email', 'test@example.local']);
  git(updaterPath, ['config', 'user.name', 'Protocol Lab Test']);
  writeFileSync(join(updaterPath, 'runtime', 'core', 'a.md'), '# remotely pushed version\n');
  git(updaterPath, ['add', '.']);
  git(updaterPath, ['commit', '-m', 'remote update']);
  git(updaterPath, ['push']);
  return git(updaterPath, ['rev-parse', 'HEAD']);
}

test('readGitRefBundle reads markdown from the requested commit instead of the working tree', () => {
  const { repoPath, firstCommit } = createRepo();

  const bundle = readGitRefBundle({
    repoPath,
    ref: firstCommit,
    requireClean: false
  });

  assert.equal(bundle.ref, firstCommit);
  assert.equal(bundle.files.length, 2);
  assert.equal(bundle.files.find((file) => file.path === 'runtime/core/a.md').content, '# core v1\n');
  assert.equal(bundle.initialPrompt, 'launch v1\n');
  assert.match(bundle.commitSha, /^[0-9a-f]{40}$/);
  assert.match(bundle.bundleSha256, /^[0-9a-f]{64}$/);
});

test('readGitRefBundle can read the current working tree snapshot explicitly', () => {
  const { repoPath, firstCommit } = createRepo();
  writeFileSync(join(repoPath, 'runtime', 'core', 'b.md'), '# untracked working tree file\n');

  const bundle = readGitRefBundle({
    repoPath,
    ref: 'working-tree'
  });

  assert.equal(bundle.requestedRef, 'working-tree');
  assert.equal(bundle.ref, 'working-tree');
  assert.equal(bundle.commitSha, firstCommit);
  assert.equal(bundle.dirty, true);
  assert.equal(bundle.files.find((file) => file.path === 'runtime/core/a.md').content, '# core dirty working tree\n');
  assert.equal(bundle.files.find((file) => file.path === 'runtime/core/b.md').content, '# untracked working tree file\n');
  assert.equal(bundle.initialPrompt, 'launch v1\n');
});

test('readGitRefBundle reads upstream remote-tracking ref instead of local unpushed HEAD', () => {
  const { repoPath, pushedCommit, localCommit, upstreamRef } = createRepoWithUpstream();

  const bundle = readGitRefBundle({
    repoPath,
    ref: 'upstream',
    requireClean: true
  });

  assert.equal(bundle.requestedRef, 'upstream');
  assert.equal(bundle.ref, upstreamRef);
  assert.equal(bundle.commitSha, pushedCommit);
  assert.notEqual(bundle.commitSha, localCommit);
  assert.equal(bundle.files.find((file) => file.path === 'runtime/core/a.md').content, '# pushed version\n');
  assert.equal(bundle.initialPrompt, 'launch pushed\n');
});

test('readGitRefBundle can fetch upstream before reading the pushed snapshot', () => {
  const { repoPath, remotePath } = createRepoWithUpstream();
  const remotelyPushedCommit = pushRemoteUpdate(remotePath);

  const staleBundle = readGitRefBundle({
    repoPath,
    ref: 'upstream',
    fetchBeforeRead: false,
    requireClean: false
  });
  const freshBundle = readGitRefBundle({
    repoPath,
    ref: 'upstream',
    fetchBeforeRead: true,
    requireClean: false
  });

  assert.notEqual(staleBundle.commitSha, remotelyPushedCommit);
  assert.equal(freshBundle.commitSha, remotelyPushedCommit);
  assert.equal(freshBundle.files.find((file) => file.path === 'runtime/core/a.md').content, '# remotely pushed version\n');
});

test('readGitRefBundle can reject dirty source repos before checking a branch snapshot', () => {
  const { repoPath, firstCommit } = createRepo();

  assert.throws(
    () => readGitRefBundle({ repoPath, ref: firstCommit, requireClean: true }),
    /dirty working tree/i
  );
});
