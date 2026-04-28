import test from 'node:test';
import assert from 'node:assert/strict';

import { replayReport } from '../src/replay.js';

test('replayReport re-evaluates saved transcript with embedded contract without API calls', () => {
  const report = {
    scenarioId: 'replay-source',
    transcript: [
      {
        role: 'assistant',
        content: 'Что уже подключено\nЧто обязательно добавить\nЧто не стоит добавлять\nЧто можно добавить позже'
      }
    ],
    contractSnapshot: {
      id: 'replay-contract',
      rules: [
        {
          id: 'sources.four-blocks',
          severity: 'hard_fail',
          type: 'required_patterns',
          target: 'assistant',
          patterns: [
            'Что уже подключено',
            'Что обязательно добавить',
            'Что не стоит добавлять',
            'Что можно добавить позже'
          ]
        }
      ]
    },
    evaluation: {
      verdict: 'hard_fail',
      findings: []
    }
  };

  const replayed = replayReport(report);

  assert.equal(replayed.scenarioId, 'replay-source');
  assert.equal(replayed.evaluation.contractId, 'replay-contract');
  assert.equal(replayed.evaluation.verdict, 'pass');
  assert.equal(replayed.replay.enabled, true);
  assert.equal(replayed.replay.apiCalls, 0);
});

test('replayReport rejects reports without transcript or contract', () => {
  assert.throws(() => replayReport({ scenarioId: 'bad' }), /transcript/i);
  assert.throws(() => replayReport({ scenarioId: 'bad', transcript: [] }), /contract/i);
});
