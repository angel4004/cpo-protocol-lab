import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMatrixSummaryMarkdown,
  buildSummaryMarkdown
} from '../src/report.js';

test('buildSummaryMarkdown includes Russian verdict, source snapshot and failing reasons', () => {
  const markdown = buildSummaryMarkdown({
    scenarioId: 'report-test',
    source: {
      repoPath: 'C:/repo/cpo',
      requestedRef: 'upstream',
      ref: 'HEAD',
      branch: 'feature/protocol',
      commitSha: 'abc123',
      bundleSha256: 'bundlehash',
      fileCount: 14
    },
    inputs: {
      scenario: {
        path: 'C:/lab/scenarios/report-test.scenario.json',
        sha256: 'scenariohash'
      },
      fixture: {
        present: true,
        path: 'C:/lab/fixtures/local/project.md',
        sha256: 'fixturehash'
      },
      contract: {
        id: 'report-contract',
        path: 'C:/lab/contracts/report.contract.json',
        sha256: 'contracthash'
      }
    },
    run: {
      provider: 'openrouter',
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
    },
    usage: {
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120
    },
    evaluation: {
      verdict: 'hard_fail',
      findings: [
        {
          ruleId: 'draft.not.final',
          status: 'fail',
          severity: 'hard_fail',
          reason: 'Черновик нельзя представлять как готовый для Sources.',
          evidence: 'Draft Project Passport готов для загрузки в Sources'
        }
      ]
    }
  });

  assert.match(markdown, /# Отчет Protocol Lab: report-test/);
  assert.match(markdown, /\*\*Итог:\*\* hard_fail/);
  assert.match(markdown, /## Снимок источников/);
  assert.match(markdown, /## Входные артефакты/);
  assert.match(markdown, /## Настройки запуска/);
  assert.match(markdown, /## Нарушения и предупреждения/);
  assert.match(markdown, /feature\/protocol/);
  assert.match(markdown, /upstream/);
  assert.match(markdown, /fixturehash/);
  assert.match(markdown, /contracthash/);
  assert.match(markdown, /openrouter/);
  assert.match(markdown, /openai\/gpt-5-mini/);
  assert.match(markdown, /Seed: 12345/);
  assert.match(markdown, /Usage total tokens: 120/);
  assert.match(markdown, /draft\.not\.final/);
  assert.match(markdown, /Черновик нельзя представлять как готовый для Sources/);
});

test('buildMatrixSummaryMarkdown includes aggregate verdict, models and usage totals', () => {
  const markdown = buildMatrixSummaryMarkdown({
    profile: 'candidate',
    verdict: 'needs_review',
    copilotModels: ['model-a', 'model-b'],
    simulatorModel: 'sim-model',
    runs: 2,
    totalRuns: 4,
    expectedRuns: 4,
    passRuns: 3,
    failRuns: 1,
    behaviorFailRuns: 1,
    infraBlockedRuns: 0,
    contractReviewRuns: 0,
    usageTotals: {
      inputTokens: 1000,
      outputTokens: 200,
      totalTokens: 1200
    },
    preflightSummary: {
      sourceProfile: 'full',
      totalEstimatedPromptTokens: 4000,
      maxEstimatedPromptTokens: 1200,
      warningCount: 1
    },
    failures: [
      {
        scenarioId: 'scenario-a',
        copilotModel: 'model-b',
        runIndex: 1,
        verdict: 'hard_fail',
        reportDir: 'reports/matrix/scenario-a--model-b--run-2'
      }
    ],
    results: [
      {
        scenarioId: 'scenario-a',
        copilotModel: 'model-a',
        simulatorModel: 'sim-model',
        runIndex: 0,
        verdict: 'pass',
        reportDir: 'reports/matrix/scenario-a--model-a--run-1'
      },
      {
        scenarioId: 'scenario-a',
        copilotModel: 'model-b',
        simulatorModel: 'sim-model',
        runIndex: 1,
        verdict: 'hard_fail',
        reportDir: 'reports/matrix/scenario-a--model-b--run-2'
      }
    ]
  });

  assert.match(markdown, /# Matrix Baseline Report/);
  assert.match(markdown, /\*\*Итог:\*\* needs_review/);
  assert.match(markdown, /Profile: candidate/);
  assert.match(markdown, /Copilot models: model-a, model-b/);
  assert.match(markdown, /Simulator model: sim-model/);
  assert.match(markdown, /Runs per model: 2/);
  assert.match(markdown, /Total scenario-runs: 4/);
  assert.match(markdown, /Expected scenario-runs: 4/);
  assert.match(markdown, /Behavior failed scenario-runs: 1/);
  assert.match(markdown, /Infra blocked scenario-runs: 0/);
  assert.match(markdown, /Contract review scenario-runs: 0/);
  assert.match(markdown, /Source profile: full/);
  assert.match(markdown, /Max estimated prompt tokens: 1200/);
  assert.match(markdown, /Usage total tokens: 1200/);
  assert.match(markdown, /scenario-a/);
  assert.match(markdown, /model-b/);
});
