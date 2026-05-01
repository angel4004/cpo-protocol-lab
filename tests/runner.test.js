import test from 'node:test';
import assert from 'node:assert/strict';

import { runScenarioWithClients } from '../src/runner.js';

test('runScenarioWithClients sends inline source bundle to copilot and hides contract from simulator', async () => {
  const calls = [];
  const bundle = {
    initialPrompt: 'Настрой продуктового копилота.',
    files: [
      {
        path: 'runtime/core/method_cpo_copilot_ux_kernel.md',
        content: '# UX Kernel\n'
      },
      {
        path: 'runtime/project_setup/start_here_activate_cpo_copilot.md',
        content: '# START HERE\nUse Sources blocks.'
      }
    ]
  };
  const scenario = {
    id: 'runner-test',
    maxTurns: 2,
    models: {
      copilot: 'copilot-model',
      simulator: 'simulator-model'
    },
    temperature: 0.1,
    seed: 12345,
    reasoning: {
      effort: 'minimal',
      exclude: true
    }
  };
  const fixture = {
    known: {
      projectName: 'Fixture Product'
    }
  };
  const contract = {
    id: 'secret-contract',
    rules: [
      {
        id: 'must-pass',
        type: 'required_patterns',
        target: 'assistant',
        patterns: ['Что уже подключено'],
        severity: 'hard_fail'
      }
    ]
  };
  const clients = {
    copilot: {
      complete: async (request) => {
        calls.push({ role: 'copilot', request });
        assert.deepEqual(request.reasoning, { effort: 'minimal', exclude: true });
        assert.equal(request.seed, 12345);
        return 'Что уже подключено\nОдин следующий вопрос?';
      }
    },
    simulator: {
      complete: async (request) => {
        calls.push({ role: 'simulator', request });
        assert.equal(request.seed, 12345);
        return 'У нас уже есть продукт.';
      }
    }
  };

  const result = await runScenarioWithClients({ scenario, bundle, fixture, contract, clients });

  assert.equal(result.evaluation.verdict, 'pass');
  assert.equal(result.transcript[0].role, 'user');
  assert.equal(result.transcript[0].content, 'Настрой продуктового копилота.');
  assert.match(calls[0].request.instructions, /START HERE/);
  assert.match(calls[0].request.instructions, /runtime\/project_setup\/start_here_activate_cpo_copilot\.md/);
  assert.match(calls[0].request.instructions, /already connected Project Sources/i);
  assert.match(calls[0].request.instructions, /Do not ask the user to verify whether these runtime files are connected/i);
  assert.match(calls[0].request.instructions, /runtime\/core\/method_cpo_copilot_ux_kernel\.md/);
  assert.match(calls[0].request.instructions, /Source files count: 2/);
  assert.doesNotMatch(calls[0].request.instructions, /secret-contract/);
  assert.doesNotMatch(JSON.stringify(calls[1].request), /secret-contract/);
  assert.match(JSON.stringify(calls[1].request), /Fixture Product/);
});

test('runScenarioWithClients supports post-activation scenarios without restarting onboarding', async () => {
  const calls = [];
  const bundle = {
    initialPrompt: 'Настрой продуктового копилота.',
    files: [
      {
        path: 'runtime/core/method_paf_answer_modes.md',
        content: '# PAF Answer Modes\n'
      }
    ]
  };
  const scenario = {
    id: 'post-activation-test',
    harnessMode: 'post_activation',
    initialPrompt: 'Какой следующий артефакт делать?',
    maxTurns: 1,
    models: {
      copilot: 'copilot-model',
      simulator: 'simulator-model'
    }
  };
  const contract = {
    id: 'post-activation-contract',
    rules: [
      {
        id: 'must-answer-question',
        type: 'required_patterns',
        target: 'assistant',
        patterns: ['следующий артефакт'],
        severity: 'hard_fail'
      }
    ]
  };
  const clients = {
    copilot: {
      complete: async (request) => {
        calls.push({ role: 'copilot', request });
        return 'следующий артефакт';
      }
    },
    simulator: {
      complete: async (request) => {
        calls.push({ role: 'simulator', request });
        return 'Не должен вызываться.';
      }
    }
  };

  const result = await runScenarioWithClients({ scenario, bundle, fixture: null, contract, clients });

  assert.equal(result.evaluation.verdict, 'pass');
  assert.equal(result.transcript[0].content, 'Какой следующий артефакт делать?');
  assert.equal(calls.length, 1);
  assert.match(calls[0].request.instructions, /post-activation поведение/);
  assert.match(calls[0].request.instructions, /Do not restart activation, onboarding, Sources setup or Project Passport creation/i);
  assert.doesNotMatch(calls[0].request.instructions, /Проверяется поведение onboarding-протокола/);
});

test('runScenarioWithClients records completion usage metadata when client returns it', async () => {
  const bundle = {
    initialPrompt: 'Настрой продуктового копилота.',
    files: [
      {
        path: 'runtime/core/method_paf_answer_modes.md',
        content: '# PAF Answer Modes\n'
      }
    ]
  };
  const scenario = {
    id: 'usage-test',
    harnessMode: 'post_activation',
    initialPrompt: 'Какой следующий артефакт делать?',
    maxTurns: 1,
    models: {
      copilot: 'copilot-model',
      simulator: 'simulator-model'
    }
  };
  const contract = {
    id: 'usage-contract',
    rules: [
      {
        id: 'must-answer-question',
        type: 'required_patterns',
        target: 'assistant',
        patterns: ['следующий артефакт'],
        severity: 'hard_fail'
      }
    ]
  };
  const clients = {
    copilot: {
      complete: async () => ({
        text: 'следующий артефакт',
        usage: {
          inputTokens: 10,
          outputTokens: 2,
          totalTokens: 12
        }
      })
    },
    simulator: {
      complete: async () => 'not used'
    }
  };

  const result = await runScenarioWithClients({ scenario, bundle, fixture: null, contract, clients });

  assert.deepEqual(result.usage, {
    inputTokens: 10,
    outputTokens: 2,
    totalTokens: 12,
    modelCalls: [
      {
        role: 'copilot',
        model: 'copilot-model',
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12
      }
    ]
  });
});
