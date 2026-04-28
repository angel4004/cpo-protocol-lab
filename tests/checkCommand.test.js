import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCheckPlan } from '../src/checkCommand.js';

test('buildCheckPlan runs product onboarding with a real passport by default when passport is provided', () => {
  const plan = buildCheckPlan({
    passport: 'fixtures/local/my-project-passport.md'
  });

  assert.equal(plan.label, 'product passport check');
  assert.deepEqual(plan.steps, [
    {
      scenarioPath: 'scenarios/product-happy.scenario.json',
      fixture: 'fixtures/local/my-project-passport.md'
    }
  ]);
});

test('buildCheckPlan runs exploration scenario for no-product mode', () => {
  const plan = buildCheckPlan({
    mode: 'exploration'
  });

  assert.equal(plan.label, 'exploration no-product check');
  assert.deepEqual(plan.steps, [
    {
      scenarioPath: 'scenarios/exploration-no-product.scenario.json'
    }
  ]);
});

test('buildCheckPlan runs the full branch suite when requested', () => {
  const plan = buildCheckPlan({
    suite: 'branch'
  });

  assert.equal(plan.label, 'branch protocol suite');
  assert.deepEqual(plan.steps.map((step) => step.scenarioPath), [
    'scenarios/draft-already-in-sources.scenario.json',
    'scenarios/evidence-missing.scenario.json',
    'scenarios/exploration-no-product.scenario.json',
    'scenarios/incomplete-passport.scenario.json',
    'scenarios/legacy-missing-cvc.scenario.json',
    'scenarios/product-happy.scenario.json'
  ]);
});

test('buildCheckPlan rejects product checks without passport', () => {
  assert.throws(() => buildCheckPlan({}), /--passport/);
  assert.throws(() => buildCheckPlan({ mode: 'product' }), /--passport/);
});
