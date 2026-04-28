import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRunSettings, resolveScenarioModels } from '../src/runSettings.js';

test('resolveScenarioModels keeps evaluator deterministic even when EVALUATOR_MODEL is set', () => {
  const models = resolveScenarioModels({
    models: {
      copilot: 'scenario-copilot',
      simulator: 'scenario-simulator',
      evaluator: 'deterministic'
    }
  }, {
    COPILOT_MODEL: 'env-copilot',
    SIMULATOR_MODEL: 'env-simulator',
    EVALUATOR_MODEL: 'env-llm-evaluator'
  });

  assert.equal(models.copilot, 'env-copilot');
  assert.equal(models.simulator, 'env-simulator');
  assert.equal(models.evaluator, 'deterministic');
});

test('buildRunSettings records provider, model settings and deterministic evaluator', () => {
  const settings = buildRunSettings({
    models: {
      copilot: 'openai/gpt-5-mini',
      simulator: 'openai/gpt-5-mini',
      evaluator: 'deterministic'
    },
    temperature: 0.2,
    seed: 12345,
    reasoning: {
      effort: 'minimal',
      exclude: true
    },
    maxOutputTokens: {
      copilot: 5000,
      simulator: 1200
    }
  }, 'openrouter');

  assert.equal(settings.provider, 'openrouter');
  assert.equal(settings.models.evaluator, 'deterministic');
  assert.equal(settings.seed, 12345);
  assert.deepEqual(settings.reasoning, { effort: 'minimal', exclude: true });
});
