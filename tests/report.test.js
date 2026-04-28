import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSummaryMarkdown } from '../src/report.js';

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
  assert.match(markdown, /draft\.not\.final/);
  assert.match(markdown, /Черновик нельзя представлять как готовый для Sources/);
});
