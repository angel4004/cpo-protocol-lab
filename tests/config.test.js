import { mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadDotEnv, loadScenarioPackage } from '../src/config.js';

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

test('loadScenarioPackage resolves fixture and contract paths relative to scenario file', () => {
  const root = mkdtempSync(join(tmpdir(), 'cpo-lab-config-'));
  const scenarioPath = join(root, 'scenario.json');
  const scenarioText = JSON.stringify({
    id: 'config-test',
    fixturePath: 'fixture.json',
    contractPath: 'contract.json',
    source: {
      type: 'git_ref',
      repoPath: '../cpo',
      ref: 'HEAD',
      requireClean: true
    }
  });
  writeFileSync(join(root, 'fixture.json'), JSON.stringify({ known: { projectName: 'Config Product' } }));
  writeFileSync(join(root, 'contract.json'), JSON.stringify({ id: 'contract', rules: [] }));
  writeFileSync(scenarioPath, scenarioText);

  const loaded = loadScenarioPackage(scenarioPath);

  assert.equal(loaded.scenario.id, 'config-test');
  assert.equal(loaded.fixture.known.projectName, 'Config Product');
  assert.equal(loaded.contract.id, 'contract');
  assert.equal(loaded.paths.scenarioPath, scenarioPath);
  assert.equal(loaded.inputs.scenario.sha256, sha256(scenarioText));
});

test('loadScenarioPackage can override scenario fixture with a local project passport', () => {
  const root = mkdtempSync(join(tmpdir(), 'cpo-lab-config-'));
  const scenarioPath = join(root, 'scenario.json');
  const localPassportPath = join(root, 'real-project-passport.md');
  writeFileSync(join(root, 'fixture.json'), JSON.stringify({ known: { projectName: 'Synthetic Product' } }));
  writeFileSync(localPassportPath, '# Real Project Passport\n\nProduct: Real Product\n');
  writeFileSync(join(root, 'contract.json'), JSON.stringify({ id: 'contract', rules: [] }));
  writeFileSync(scenarioPath, JSON.stringify({
    id: 'config-test',
    fixturePath: 'fixture.json',
    contractPath: 'contract.json'
  }));

  const loaded = loadScenarioPackage(scenarioPath, { fixturePath: localPassportPath });

  assert.match(loaded.fixture, /Real Project Passport/);
  assert.match(loaded.fixture, /Real Product/);
  assert.equal(loaded.paths.fixturePath, localPassportPath);
  assert.equal(loaded.inputs.fixture.present, true);
  assert.equal(loaded.inputs.fixture.sha256, sha256('# Real Project Passport\n\nProduct: Real Product\n'));
  assert.equal(loaded.inputs.contract.sha256, sha256(JSON.stringify({ id: 'contract', rules: [] })));
});

test('loadScenarioPackage supports no fixture for no-product exploration runs', () => {
  const root = mkdtempSync(join(tmpdir(), 'cpo-lab-config-'));
  const scenarioPath = join(root, 'scenario.json');
  writeFileSync(join(root, 'fixture.json'), JSON.stringify({ known: { projectName: 'Synthetic Product' } }));
  writeFileSync(join(root, 'contract.json'), JSON.stringify({ id: 'contract', rules: [] }));
  writeFileSync(scenarioPath, JSON.stringify({
    id: 'config-test',
    fixturePath: 'fixture.json',
    contractPath: 'contract.json'
  }));

  const loaded = loadScenarioPackage(scenarioPath, { noFixture: true });

  assert.equal(loaded.fixture, null);
  assert.equal(loaded.paths.fixturePath, null);
  assert.equal(loaded.inputs.fixture.present, false);
  assert.equal(loaded.inputs.fixture.sha256, null);
});

test('loadDotEnv lets local .env override stale process environment by default', () => {
  const root = mkdtempSync(join(tmpdir(), 'cpo-lab-env-'));
  const envPath = join(root, '.env');
  const previous = process.env.OPENROUTER_API_KEY;

  try {
    process.env.OPENROUTER_API_KEY = 'stale-process-key';
    writeFileSync(envPath, 'OPENROUTER_API_KEY=fresh-local-key\n');

    loadDotEnv(envPath);

    assert.equal(process.env.OPENROUTER_API_KEY, 'fresh-local-key');
  } finally {
    if (previous === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = previous;
    }
  }
});
