import { readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadScenarioPackage } from '../src/config.js';

test('MVP scenario set covers happy, legacy, draft-in-sources, incomplete, evidence-missing and exploration cases', () => {
  const scenarios = readdirSync('scenarios')
    .filter((name) => name.endsWith('.scenario.json'))
    .map((name) => loadScenarioPackage(`scenarios/${name}`));

  const ids = scenarios.map((item) => item.scenario.id).sort();

  assert.deepEqual(ids, [
    'draft-already-in-sources',
    'evidence-missing',
    'exploration-no-product',
    'incomplete-passport',
    'legacy-missing-cvc',
    'product-happy'
  ]);

  for (const item of scenarios) {
    assert.equal(typeof item.contract.id, 'string');
    assert.equal(Array.isArray(item.contract.rules), true);
    assert.equal(item.inputs.contract.sha256.length, 64);
  }

  const exploration = scenarios.find((item) => item.scenario.id === 'exploration-no-product');
  assert.equal(exploration.fixture, null);
  assert.equal(exploration.inputs.fixture.present, false);
});
