import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMatrixCellReportName,
  buildMatrixPlan,
  buildMatrixPreflightSummary,
  buildMatrixSummary,
  estimatePromptTokensFromChars,
  matrixVerdict,
  sanitizeProviderErrorMessage
} from '../src/matrixCommand.js';

const pafSteps = [
  { scenarioPath: 'scenarios/paf-next-artifact-routing.scenario.json' },
  { scenarioPath: 'scenarios/paf-pmf-without-evidence.scenario.json' }
];

test('buildMatrixPlan creates candidate matrix from profile defaults', () => {
  const plan = buildMatrixPlan({
    suite: 'paf-baseline',
    profile: 'candidate'
  }, pafSteps);

  assert.equal(plan.profile, 'candidate');
  assert.equal(plan.runs, 2);
  assert.deepEqual(plan.copilotModels, [
    'openai/gpt-5.5',
    'anthropic/claude-4.6-sonnet'
  ]);
  assert.equal(plan.simulatorModel, 'openai/gpt-5-mini');
  assert.equal(plan.cells.length, 8);
  assert.deepEqual(plan.cells[0], {
    scenarioPath: 'scenarios/paf-next-artifact-routing.scenario.json',
    scenarioIndex: 0,
    modelIndex: 0,
    runIndex: 0,
    copilotModel: 'openai/gpt-5.5',
    simulatorModel: 'openai/gpt-5-mini'
  });
});

test('buildMatrixPlan creates quality-full matrix as the main high-fidelity gate', () => {
  const plan = buildMatrixPlan({
    suite: 'paf-baseline',
    profile: 'quality-full'
  }, pafSteps);

  assert.equal(plan.profile, 'quality-full');
  assert.equal(plan.sourceProfile, 'full');
  assert.equal(plan.runs, 2);
  assert.deepEqual(plan.copilotModels, [
    'openai/gpt-5.5',
    'anthropic/claude-4.6-sonnet'
  ]);
  assert.equal(plan.simulatorModel, 'openai/gpt-5-mini');
  assert.equal(plan.cells.length, 8);
});

test('buildMatrixPlan supports explicit models and run count', () => {
  const plan = buildMatrixPlan({
    copilotModels: 'model-a, model-b',
    runs: '3',
    simulatorModel: 'sim-model'
  }, pafSteps);

  assert.deepEqual(plan.copilotModels, ['model-a', 'model-b']);
  assert.equal(plan.runs, 3);
  assert.equal(plan.simulatorModel, 'sim-model');
  assert.equal(plan.cells.length, 12);
});

test('matrixVerdict passes only when every scenario run passes', () => {
  assert.equal(matrixVerdict([
    result('scenario-a', 'model-a', 0, 'pass'),
    result('scenario-a', 'model-a', 1, 'pass'),
    result('scenario-a', 'model-b', 0, 'pass')
  ]), 'pass');

  assert.equal(matrixVerdict([
    result('scenario-a', 'model-a', 0, 'pass'),
    result('scenario-a', 'model-a', 1, 'hard_fail')
  ]), 'behavior_fail');

  assert.equal(matrixVerdict([
    result('scenario-a', 'model-a', 0, 'hard_fail'),
    result('scenario-a', 'model-a', 1, 'hard_fail')
  ]), 'behavior_fail');

  assert.equal(matrixVerdict([
    result('scenario-a', 'model-a', 0, 'hard_fail'),
    result('scenario-a', 'model-b', 0, 'hard_fail')
  ]), 'behavior_fail');
});

test('matrixVerdict separates infrastructure and contract-review outcomes from behavior failures', () => {
  assert.equal(matrixVerdict([
    result('scenario-a', 'model-a', 0, 'pass'),
    result('scenario-b', 'model-a', 0, 'infra_blocked')
  ]), 'infra_blocked');

  assert.equal(matrixVerdict([
    result('scenario-a', 'model-a', 0, 'pass'),
    result('scenario-b', 'model-a', 0, 'needs_review')
  ]), 'contract_needs_review');

  assert.equal(matrixVerdict([
    result('scenario-a', 'model-a', 0, 'infra_blocked'),
    result('scenario-b', 'model-a', 0, 'hard_fail')
  ]), 'behavior_fail');
});

test('buildMatrixSummary records totals and failing cells', () => {
  const summary = buildMatrixSummary({
    profile: 'candidate',
    copilotModels: ['model-a', 'model-b'],
    simulatorModel: 'sim-model',
    runs: 2,
    results: [
      result('scenario-a', 'model-a', 0, 'pass', { inputTokens: 10, outputTokens: 2, totalTokens: 12 }),
      result('scenario-a', 'model-a', 1, 'hard_fail', { inputTokens: 11, outputTokens: 3, totalTokens: 14 })
    ]
  });

  assert.equal(summary.verdict, 'behavior_fail');
  assert.equal(summary.totalRuns, 2);
  assert.equal(summary.expectedRuns, 2);
  assert.equal(summary.passRuns, 1);
  assert.equal(summary.failRuns, 1);
  assert.equal(summary.behaviorFailRuns, 1);
  assert.equal(summary.infraBlockedRuns, 0);
  assert.equal(summary.contractReviewRuns, 0);
  assert.deepEqual(summary.usageTotals, {
    inputTokens: 21,
    outputTokens: 5,
    totalTokens: 26
  });
  assert.deepEqual(summary.failures.map((item) => item.scenarioId), ['scenario-a']);
});

test('buildMatrixSummary keeps API errors as reportable infra-blocked matrix failures', () => {
  const summary = buildMatrixSummary({
    profile: 'candidate',
    copilotModels: ['model-a'],
    simulatorModel: 'sim-model',
    runs: 1,
    results: [
      {
        ...result('scenario-a', 'model-a', 0, 'infra_blocked'),
        error: 'Provider token limit exceeded'
      }
    ]
  });

  assert.equal(summary.verdict, 'infra_blocked');
  assert.equal(summary.failRuns, 1);
  assert.equal(summary.infraBlockedRuns, 1);
  assert.equal(summary.infraFailures[0].verdict, 'infra_blocked');
  assert.equal(summary.failures[0].verdict, 'infra_blocked');
  assert.equal(summary.failures[0].error, 'Provider token limit exceeded');
  assert.equal(summary.results[0].error, 'Provider token limit exceeded');
});

test('buildMatrixSummary sanitizes provider errors from resumed reports', () => {
  const summary = buildMatrixSummary({
    profile: 'quality-full',
    copilotModels: ['model-a'],
    simulatorModel: 'sim-model',
    runs: 1,
    results: [
      {
        ...result('scenario-a', 'model-a', 0, 'api_error'),
        error: 'HTTP 402: {"user_id":"org_secret","message":"limit"} Authorization: Bearer sk-live'
      }
    ]
  });

  assert.equal(
    summary.failures[0].error,
    'HTTP 402: {"user_id":"[redacted]","message":"limit"} Authorization: Bearer [redacted]'
  );
  assert.equal(summary.results[0].error.includes('org_secret'), false);
});

test('buildMatrixSummary records preflight budget without downgrading full-source fidelity', () => {
  const summary = buildMatrixSummary({
    profile: 'quality-full',
    copilotModels: ['model-a'],
    simulatorModel: 'sim-model',
    runs: 1,
    expectedRuns: 1,
    preflight: [
      {
        scenarioId: 'scenario-a',
        copilotModel: 'model-a',
        sourceProfile: 'full',
        sourceChars: 227119,
        estimatedPromptTokens: 56780,
        budgetStatus: 'warning'
      }
    ],
    results: [
      result('scenario-a', 'model-a', 0, 'pass')
    ]
  });

  assert.equal(summary.verdict, 'pass');
  assert.equal(summary.preflight[0].sourceProfile, 'full');
  assert.equal(summary.preflight[0].budgetStatus, 'warning');
});

test('buildMatrixCellReportName produces stable names for resume', () => {
  assert.equal(
    buildMatrixCellReportName({
      scenarioPath: 'scenarios/paf-next-artifact-routing.scenario.json',
      copilotModel: 'anthropic/claude-4.6-sonnet',
      runIndex: 1
    }),
    'paf-next-artifact-routing--anthropic-claude-4.6-sonnet--run-2'
  );
});

test('buildMatrixPreflightSummary aggregates estimated prompt budget', () => {
  const preflight = buildMatrixPreflightSummary([
    { estimatedPromptTokens: 10, sourceProfile: 'full', budgetStatus: 'ok' },
    { estimatedPromptTokens: 30, sourceProfile: 'full', budgetStatus: 'warning' }
  ]);

  assert.deepEqual(preflight, {
    sourceProfile: 'full',
    totalEstimatedPromptTokens: 40,
    maxEstimatedPromptTokens: 30,
    warningCount: 1
  });
});

test('estimatePromptTokensFromChars uses a conservative deterministic estimate', () => {
  assert.equal(estimatePromptTokensFromChars(0), 0);
  assert.equal(estimatePromptTokensFromChars(1), 1);
  assert.equal(estimatePromptTokensFromChars(8), 6);
});

test('sanitizeProviderErrorMessage redacts provider identifiers and credentials', () => {
  const message = 'HTTP 402: {"user_id":"org_secret","api_key":"sk-secret"} Authorization: Bearer sk-live';

  assert.equal(
    sanitizeProviderErrorMessage(message),
    'HTTP 402: {"user_id":"[redacted]","api_key":"[redacted]"} Authorization: Bearer [redacted]'
  );
});

function result(scenarioId, copilotModel, runIndex, verdict, usage = undefined) {
  return {
    scenarioId,
    copilotModel,
    runIndex,
    reportDir: `reports/run/${scenarioId}`,
    evaluation: {
      verdict,
      findings: []
    },
    usage
  };
}
